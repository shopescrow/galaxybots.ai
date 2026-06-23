import { Router, type IRouter } from "express";
import { db, promptVersionsTable, botsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

router.get("/self-improvement/prompt-versions", async (req, res): Promise<void> => {
  const botId = req.query.botId ? parseInt(req.query.botId as string) : undefined;
  const status = req.query.status as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (botId) conditions.push(eq(promptVersionsTable.botId, botId));
  if (status) conditions.push(eq(promptVersionsTable.status, status));

  const versions = await db
    .select({
      id: promptVersionsTable.id,
      botId: promptVersionsTable.botId,
      botName: botsTable.name,
      versionNum: promptVersionsTable.versionNum,
      diffFromPrev: promptVersionsTable.diffFromPrev,
      evidenceSummary: promptVersionsTable.evidenceSummary,
      triggeredBy: promptVersionsTable.triggeredBy,
      activatedAt: promptVersionsTable.activatedAt,
      deactivatedAt: promptVersionsTable.deactivatedAt,
      shadowPeriodEnd: promptVersionsTable.shadowPeriodEnd,
      outcomeScoreBefore: promptVersionsTable.outcomeScoreBefore,
      outcomeScoreAfter: promptVersionsTable.outcomeScoreAfter,
      diffMagnitudePct: promptVersionsTable.diffMagnitudePct,
      status: promptVersionsTable.status,
      rollbackReason: promptVersionsTable.rollbackReason,
      createdAt: promptVersionsTable.createdAt,
    })
    .from(promptVersionsTable)
    .leftJoin(botsTable, eq(promptVersionsTable.botId, botsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(promptVersionsTable.createdAt))
    .limit(100);

  res.json(versions);
});

router.get("/self-improvement/prompt-versions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [version] = await db
    .select()
    .from(promptVersionsTable)
    .where(eq(promptVersionsTable.id, id))
    .limit(1);

  if (!version) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(version);
});

const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

router.post("/self-improvement/prompt-versions/:id/review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const { action, reason } = parsed.data;
  const now = new Date();

  if (action === "approve") {
    await db
      .update(promptVersionsTable)
      .set({ status: "shadow", shadowPeriodEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) })
      .where(eq(promptVersionsTable.id, id));
  } else {
    await db
      .update(promptVersionsTable)
      .set({ status: "rejected", rollbackReason: reason ?? "Rejected by reviewer" })
      .where(eq(promptVersionsTable.id, id));
  }

  res.json({ ok: true, action });
});

export default router;
