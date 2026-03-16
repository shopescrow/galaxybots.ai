import { Router } from "express";
import { db, prospectsTable, prospectOutreachLogTable, prospectOutreachTemplatesTable, clientsTable } from "@workspace/db";
import { eq, and, desc, sql, gte, isNotNull } from "drizzle-orm";
import { z } from "zod";

const router = Router();

type ProspectStatus = "new" | "enriched" | "review_needed" | "qualified" | "contacted" | "rejected" | "responded" | "converted";

const VALID_STATUSES: ProspectStatus[] = ["new", "enriched", "review_needed", "qualified", "contacted", "rejected", "responded", "converted"];

const PatchProspectSchema = z.object({
  status: z.enum(["new", "enriched", "review_needed", "qualified", "contacted", "rejected", "responded", "converted"]).optional(),
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

router.get("/prospects/funnel", async (req, res) => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const allProspects = await db.select({
      id: prospectsTable.id,
      status: prospectsTable.status,
      outreachSentCount: prospectsTable.outreachSentCount,
      createdAt: prospectsTable.createdAt,
      convertedAt: prospectsTable.convertedAt,
      updatedAt: prospectsTable.updatedAt,
    }).from(prospectsTable)
      .where(eq(prospectsTable.clientId, clientId));

    const totalDiscovered = allProspects.length;

    const enrichedStatuses = ["enriched", "review_needed", "qualified", "contacted", "responded", "converted"];
    const enrichedCount = allProspects.filter(p => enrichedStatuses.includes(p.status)).length;

    const qualifiedStatuses = ["qualified", "contacted", "responded", "converted"];
    const qualifiedCount = allProspects.filter(p => qualifiedStatuses.includes(p.status)).length;

    const outreachSent = allProspects.filter(p => p.outreachSentCount > 0).length;

    const respondedStatuses = ["responded", "converted"];
    const respondedCount = allProspects.filter(p => respondedStatuses.includes(p.status)).length;

    const convertedCount = allProspects.filter(p => p.status === "converted").length;

    function avgDaysInStage(statusList: string[]): number | null {
      const matching = allProspects.filter(p => statusList.includes(p.status));
      if (matching.length === 0) return null;
      const now = Date.now();
      const totalDays = matching.reduce((sum, p) => {
        const enteredAt = new Date(p.updatedAt).getTime();
        const days = (now - enteredAt) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      return Math.round((totalDays / matching.length) * 10) / 10;
    }

    const stages = [
      { stage: "Discovered", count: totalDiscovered, avgDays: avgDaysInStage(["new"]) },
      { stage: "Enriched", count: enrichedCount, avgDays: avgDaysInStage(["enriched", "review_needed"]) },
      { stage: "Qualified", count: qualifiedCount, avgDays: avgDaysInStage(["qualified"]) },
      { stage: "Outreach Sent", count: outreachSent, avgDays: avgDaysInStage(["contacted"]) },
      { stage: "Responded", count: respondedCount, avgDays: avgDaysInStage(["responded"]) },
      { stage: "Converted", count: convertedCount, avgDays: null as number | null },
    ];

    const stagesWithRates = stages.map((s, i) => ({
      ...s,
      conversionRate: i === 0 ? 100 : (stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 100) : 0),
    }));

    let avgDaysToConversion: number | null = null;
    const convertedProspects = allProspects.filter(p => p.status === "converted" && p.convertedAt);
    if (convertedProspects.length > 0) {
      const totalDays = convertedProspects.reduce((sum, p) => {
        const days = (new Date(p.convertedAt!).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      avgDaysToConversion = Math.round((totalDays / convertedProspects.length) * 10) / 10;
    }

    res.json({ stages: stagesWithRates, avgDaysToConversion });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch funnel data" });
  }
});

router.get("/prospects/roi", async (req, res) => {
  try {
    const clientId = getEffectiveClientId(req);
    if (!clientId) {
      return res.status(403).json({ error: "Client context required" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentProspects = await db.select().from(prospectsTable)
      .where(and(
        eq(prospectsTable.clientId, clientId),
        gte(prospectsTable.createdAt, thirtyDaysAgo),
      ));

    const prospectSourced = recentProspects.length;

    const outreachLogs = await db.select({
      cnt: sql<number>`count(*)::int`,
    }).from(prospectOutreachLogTable)
      .innerJoin(prospectsTable, eq(prospectOutreachLogTable.prospectId, prospectsTable.id))
      .where(and(
        eq(prospectsTable.clientId, clientId),
        gte(prospectOutreachLogTable.sentAt, thirtyDaysAgo),
      ));

    const outreachSent = outreachLogs[0]?.cnt || 0;

    const responseLogs = await db.select({
      cnt: sql<number>`count(*)::int`,
    }).from(prospectOutreachLogTable)
      .innerJoin(prospectsTable, eq(prospectOutreachLogTable.prospectId, prospectsTable.id))
      .where(and(
        eq(prospectsTable.clientId, clientId),
        gte(prospectOutreachLogTable.sentAt, thirtyDaysAgo),
        isNotNull(prospectOutreachLogTable.responseReceivedAt),
      ));

    const responsesReceived = responseLogs[0]?.cnt || 0;
    const responseRate = outreachSent > 0 ? Math.round((responsesReceived / outreachSent) * 100) : 0;

    const planMonthlyRevenue: Record<string, number> = {
      single: 497,
      growth: 997,
      agency: 2497,
    };

    const convertedInWindow = await db.select({
      plan: clientsTable.plan,
    }).from(prospectsTable)
      .innerJoin(clientsTable, eq(prospectsTable.convertedClientId, clientsTable.id))
      .where(and(
        eq(prospectsTable.clientId, clientId),
        eq(prospectsTable.status, "converted"),
        isNotNull(prospectsTable.convertedAt),
        gte(prospectsTable.convertedAt, thirtyDaysAgo),
      ));

    const conversions = convertedInWindow.length;

    let estimatedRevenue = 0;
    for (const cp of convertedInWindow) {
      const monthlyRate = planMonthlyRevenue[cp.plan] ?? planMonthlyRevenue.single;
      estimatedRevenue += monthlyRate * 12;
    }

    res.json({
      prospectSourced,
      outreachSent,
      responsesReceived,
      responseRate,
      conversions,
      estimatedRevenue: Math.round(estimatedRevenue),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch prospector ROI data" });
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
