import { Router } from "express";
import {
  db,
  botBeliefsTable,
  clientBeliefsTable,
  episodicSummariesTable,
  securityEventsTable,
  pendingBeliefUpdatesTable,
  botsTable,
} from "@workspace/db";
import { eq, and, isNull, isNotNull, desc, asc, not } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { corroboratePendingUpdate } from "../../services/ai-safety/belief-anomaly.js";

const router = Router();

router.get(
  "/admin/beliefs/bots/:botId",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    if (isNaN(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }

    const [active, archived, contradicted] = await Promise.all([
      db.select().from(botBeliefsTable).where(
        and(eq(botBeliefsTable.botId, botId), isNull(botBeliefsTable.archivedAt)),
      ).orderBy(desc(botBeliefsTable.confidence)),
      db.select({ id: botBeliefsTable.id }).from(botBeliefsTable).where(
        and(eq(botBeliefsTable.botId, botId), isNotNull(botBeliefsTable.archivedAt)),
      ),
      db.select().from(botBeliefsTable).where(
        and(
          eq(botBeliefsTable.botId, botId),
          isNull(botBeliefsTable.archivedAt),
          isNotNull(botBeliefsTable.contradictedById),
        ),
      ),
    ]);

    const categories: Record<string, number> = {};
    for (const b of active) {
      categories[b.category] = (categories[b.category] ?? 0) + 1;
    }

    const avgConfidence = active.length > 0
      ? active.reduce((acc, b) => acc + Number(b.confidence), 0) / active.length
      : 0;

    const now = Date.now();
    const stale = active.filter((b) => {
      const daysSince = (now - b.lastConfirmedAt.getTime()) / (24 * 60 * 60 * 1000);
      return daysSince > b.halfLifeDays;
    });

    res.json({
      active,
      archivedCount: archived.length,
      contradicted,
      staleCount: stale.length,
      avgConfidence,
      categoryDistribution: categories,
    });
  },
);

router.get(
  "/admin/beliefs/episodic/:botId",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const botId = Number(req.params.botId);
    if (isNaN(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }

    const summaries = await db
      .select()
      .from(episodicSummariesTable)
      .where(eq(episodicSummariesTable.botId, botId))
      .orderBy(desc(episodicSummariesTable.periodEnd))
      .limit(12);

    res.json(summaries);
  },
);

router.get(
  "/admin/security-events",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const unreviewed = req.query.unreviewed === "true";

    const conditions = unreviewed ? [isNull(securityEventsTable.reviewedAt)] : [];

    const events = await db
      .select()
      .from(securityEventsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(securityEventsTable.createdAt))
      .limit(limit);

    res.json(events);
  },
);

router.patch(
  "/admin/security-events/:id/review",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [updated] = await db
      .update(securityEventsTable)
      .set({ reviewedAt: new Date(), reviewedByUserId: req.user!.userId })
      .where(eq(securityEventsTable.id, id))
      .returning();

    res.json(updated);
  },
);

router.get(
  "/admin/beliefs/anomaly-queue",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const pending = await db
      .select()
      .from(pendingBeliefUpdatesTable)
      .where(eq(pendingBeliefUpdatesTable.status, "pending"))
      .orderBy(desc(pendingBeliefUpdatesTable.createdAt))
      .limit(100);

    res.json(pending);
  },
);

router.post(
  "/admin/beliefs/anomaly-queue/:id/approve",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    await corroboratePendingUpdate(id);
    res.json({ success: true });
  },
);

router.post(
  "/admin/beliefs/anomaly-queue/:id/reject",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { reason } = req.body as { reason?: string };

    await db
      .update(pendingBeliefUpdatesTable)
      .set({
        status: "rejected",
        rejectedAt: new Date(),
        reviewNote: reason ?? "Rejected by admin",
      })
      .where(eq(pendingBeliefUpdatesTable.id, id));

    res.json({ success: true });
  },
);

router.get(
  "/admin/beliefs/bots",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const bots = await db
      .select({
        id: botsTable.id,
        name: botsTable.name,
        isAvailable: botsTable.isAvailable,
      })
      .from(botsTable)
      .where(eq(botsTable.isAvailable, true));

    res.json(bots);
  },
);

export default router;
