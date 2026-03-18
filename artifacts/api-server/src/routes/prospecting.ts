import { Router, type Request, type Response } from "express";
import { db, confidenceConfigsTable, prospectsTable, platformAuditLogTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const ConfidenceConfigUpdateSchema = z.object({
  emailWeight: z.number().min(0).max(1).optional(),
  phoneWeight: z.number().min(0).max(1).optional(),
  domainWeight: z.number().min(0).max(1).optional(),
  socialWeight: z.number().min(0).max(1).optional(),
  nameWeight: z.number().min(0).max(1).optional(),
  reviewSlaHours: z.number().int().min(1).max(168).optional(),
});

const ReviewProspectSchema = z.object({
  action: z.enum(["approve", "reject", "correct"]),
  corrections: z.object({
    companyName: z.string().optional(),
    domain: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

function getEffectiveClientId(req: Request): number | null {
  return req.user?.clientId ?? null;
}

// Confidence Config Routes
router.get("/prospecting/confidence-config", async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      res.status(403).json({ error: "Client context required" });
      return;
    }

    let [config] = await db.select().from(confidenceConfigsTable).where(eq(confidenceConfigsTable.clientId, clientId));
    
    if (!config) {
      [config] = await db.insert(confidenceConfigsTable).values({ clientId }).returning();
    }

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch confidence config" });
  }
});

router.put("/prospecting/confidence-config", async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      res.status(403).json({ error: "Client context required" });
      return;
    }

    const parsed = ConfidenceConfigUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const updates: any = { ...parsed.data, updatedAt: new Date() };
    const [config] = await db.insert(confidenceConfigsTable)
      .values({ clientId, ...updates })
      .onConflictDoUpdate({
        target: [confidenceConfigsTable.clientId],
        set: updates
      })
      .returning();

    res.json(config);
  } catch (err) {
    res.status(500).json({ error: "Failed to update confidence config" });
  }
});

// Utility for scoring confidence
export function scoreConfidence(data: any, config: any) {
  let score = 0;
  const breakdown: any = {};
  const issues: string[] = [];

  const weights = {
    email: parseFloat(config.emailWeight || "0.25"),
    phone: parseFloat(config.phoneWeight || "0.25"),
    domain: parseFloat(config.domainWeight || "0.20"),
    social: parseFloat(config.socialWeight || "0.15"),
    name: parseFloat(config.nameWeight || "0.15"),
  };

  if (data.email) {
    breakdown.email = weights.email;
    score += weights.email;
  } else {
    breakdown.email = 0;
    issues.push("Missing email");
  }

  if (data.phone) {
    breakdown.phone = weights.phone;
    score += weights.phone;
  } else {
    breakdown.phone = 0;
    issues.push("Missing phone");
  }

  if (data.domain) {
    breakdown.domain = weights.domain;
    score += weights.domain;
  } else {
    breakdown.domain = 0;
    issues.push("Missing domain");
  }

  if (data.socialLinks && Object.keys(data.socialLinks).length > 0) {
    breakdown.social = weights.social;
    score += weights.social;
  } else {
    breakdown.social = 0;
    issues.push("Missing social links");
  }

  if (data.companyName) {
    breakdown.name = weights.name;
    score += weights.name;
  } else {
    breakdown.name = 0;
    issues.push("Missing company name");
  }

  return { score: Math.min(score, 1.0), breakdown, issues };
}

router.patch("/prospecting/prospects/:id/review", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      res.status(403).json({ error: "Client context required" });
      return;
    }

    const parsed = ReviewProspectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { action, corrections } = parsed.data;

    const [prospect] = await db.select().from(prospectsTable).where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, clientId)));
    if (!prospect) {
      res.status(404).json({ error: "Prospect not found" });
      return;
    }

    const beforeSnapshot = { ...prospect };
    let updates: any = { updatedAt: new Date() };

    if (action === "approve") {
      updates.status = "qualified";
    } else if (action === "reject") {
      updates.status = "rejected";
    } else if (action === "correct") {
      if (corrections) {
        Object.assign(updates, corrections);
        // Re-run confidence scoring
        const [config] = await db.select().from(confidenceConfigsTable).where(eq(confidenceConfigsTable.clientId, clientId));
        const mergedData = { ...prospect, ...corrections };
        const newConfidence = scoreConfidence(mergedData, config || {
          emailWeight: "0.25",
          phoneWeight: "0.25",
          domainWeight: "0.20",
          socialWeight: "0.15",
          nameWeight: "0.15"
        });
        updates.confidenceScore = sql`${newConfidence.score}`; 
        updates.status = "qualified"; // Approve after correction
      }
    }

    const [updated] = await db.update(prospectsTable).set(updates).where(eq(prospectsTable.id, id)).returning();

    // Audit log
    await db.insert(platformAuditLogTable).values({
      clientId,
      userId: req.user?.userId || null, // req.user usually has userId or id, adjusting to match common patterns
      action: `prospect_review_${action}`,
      resource: "prospect",
      resourceId: id.toString(),
      metadata: {
        compliancePlatform: "kilopro",
        before: beforeSnapshot,
        after: updated,
        action
      }
    });

    res.json(updated);
  } catch (err) {
    console.error("Review error:", err);
    res.status(500).json({ error: "Failed to review prospect" });
  }
});

export default router;
