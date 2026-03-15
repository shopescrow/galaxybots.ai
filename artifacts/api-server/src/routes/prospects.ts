import { Router } from "express";
import { db, prospectsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

type ProspectStatus = "new" | "enriched" | "review_needed" | "qualified" | "contacted" | "rejected";

const VALID_STATUSES: ProspectStatus[] = ["new", "enriched", "review_needed", "qualified", "contacted", "rejected"];

const PatchProspectSchema = z.object({
  status: z.enum(["new", "enriched", "review_needed", "qualified", "contacted", "rejected"]).optional(),
  phone: z.string().nullable().optional(),
  email: z.union([z.string().email(), z.literal("").transform(() => null), z.null()]).optional(),
  domain: z.string().nullable().optional(),
  companyName: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
}).strict();

function isValidStatus(s: string): s is ProspectStatus {
  return (VALID_STATUSES as string[]).includes(s);
}

function isPlatformAdmin(req: Express.Request): boolean {
  return req.user?.bypassPayment === true;
}

function getEffectiveClientId(req: Express.Request): number | null {
  if (isPlatformAdmin(req) && req.query.clientId) {
    const parsed = Number(req.query.clientId);
    return isNaN(parsed) ? null : parsed;
  }
  return req.user?.clientId ?? null;
}

function buildConditions(...conds: ReturnType<typeof eq>[]) {
  return conds.length > 1 ? and(...conds) : conds[0];
}

router.get("/prospects", async (req, res) => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const { status, limit } = req.query;
    const maxResults = Math.min(Number(limit) || 50, 100);
    const conditions = [eq(prospectsTable.clientId, clientId)];

    if (status && typeof status === "string" && isValidStatus(status)) {
      conditions.push(eq(prospectsTable.status, status));
    }

    const results = await db.select().from(prospectsTable)
      .where(buildConditions(...conditions))
      .orderBy(desc(prospectsTable.createdAt))
      .limit(maxResults);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prospects" });
  }
});

router.get("/prospects/stats", async (req, res) => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const stats = await db.select({
      status: prospectsTable.status,
      count: sql<number>`count(*)::int`,
    })
      .from(prospectsTable)
      .where(eq(prospectsTable.clientId, clientId))
      .groupBy(prospectsTable.status);

    const statusCounts: Record<string, number> = {};
    let total = 0;
    for (const row of stats) {
      statusCounts[row.status] = row.count;
      total += row.count;
    }

    res.json({ total, statusCounts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prospect stats" });
  }
});

router.get("/prospects/review-queue", async (req, res) => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const reviewStatus: ProspectStatus = "review_needed";
    const results = await db.select().from(prospectsTable)
      .where(and(
        eq(prospectsTable.status, reviewStatus),
        eq(prospectsTable.clientId, clientId),
      ))
      .orderBy(desc(prospectsTable.createdAt))
      .limit(50);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch review queue" });
  }
});

router.patch("/prospects/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid prospect ID" });
    }

    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const parsed = PatchProspectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
    }

    const { status, phone, email, domain, companyName, notes } = parsed.data;

    const [existing] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, clientId)));
    if (!existing) {
      return res.status(404).json({ error: "Prospect not found" });
    }

    const updates: Partial<typeof prospectsTable.$inferInsert> & { updatedAt: Date } = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (domain !== undefined) updates.domain = domain;
    if (companyName !== undefined) updates.companyName = companyName;
    if (notes) {
      const existingNotes = existing.extractionNotes || "";
      updates.extractionNotes = existingNotes
        ? `${existingNotes}\n[${new Date().toISOString()}] ${notes}`
        : `[${new Date().toISOString()}] ${notes}`;
    }

    const [updated] = await db.update(prospectsTable).set(updates).where(eq(prospectsTable.id, id)).returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update prospect" });
  }
});

router.delete("/prospects/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid prospect ID" });
    }

    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const [existing] = await db.select().from(prospectsTable)
      .where(and(eq(prospectsTable.id, id), eq(prospectsTable.clientId, clientId)));
    if (!existing) {
      return res.status(404).json({ error: "Prospect not found" });
    }

    await db.delete(prospectsTable).where(eq(prospectsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete prospect" });
  }
});

export default router;
