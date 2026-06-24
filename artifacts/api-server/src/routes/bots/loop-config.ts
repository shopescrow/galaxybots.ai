import { Router, type IRouter } from "express";
import { db, botLoopConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { sendValidationError } from "../../utils/validation";

const router: IRouter = Router();

const UpdateLoopConfigBody = z.object({
  maxIterations: z.number().int().min(1).max(100).optional(),
  timeBudgetMs: z.number().int().min(1000).max(600_000).optional(),
  costBudgetCents: z.number().int().min(0).max(100_000).optional(),
  qualityThreshold: z.number().min(0).max(1).optional(),
  enableSelfEvaluation: z.boolean().optional(),
  enableBrowserAgent: z.boolean().optional(),
  model: z.string().min(1).max(100).optional(),
  fallbackModel: z.string().max(100).nullable().optional(),
  networkAllowList: z.array(z.string()).max(50).optional(),
});

router.get("/bots/:id/loop-config", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.id);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot id" });
    return;
  }

  const clientId = req.user?.clientId;

  try {
    const conditions = clientId
      ? and(eq(botLoopConfigTable.botId, botId), eq(botLoopConfigTable.clientId, clientId))
      : eq(botLoopConfigTable.botId, botId);

    const [row] = await db.select().from(botLoopConfigTable).where(conditions).limit(1);

    if (!row) {
      res.json({
        botId,
        clientId: clientId ?? null,
        isDefault: true,
        maxIterations: 10,
        timeBudgetMs: 120000,
        costBudgetCents: 500,
        qualityThreshold: 0.7,
        enableSelfEvaluation: true,
        enableBrowserAgent: false,
        model: "gpt-5-mini",
        fallbackModel: null,
        networkAllowList: [],
      });
      return;
    }

    res.json({
      id: row.id,
      botId: row.botId,
      clientId: row.clientId,
      isDefault: false,
      maxIterations: row.maxIterations,
      timeBudgetMs: row.timeBudgetMs,
      costBudgetCents: row.costBudgetCents,
      qualityThreshold: parseFloat(String(row.qualityThreshold)),
      enableSelfEvaluation: row.enableSelfEvaluation,
      enableBrowserAgent: row.enableBrowserAgent,
      model: row.model,
      fallbackModel: row.fallbackModel ?? null,
      networkAllowList: row.networkAllowList ?? [],
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
    });
  } catch (err) {
    console.error("[loop-config GET] Error:", err);
    res.status(500).json({ error: "Failed to fetch loop config" });
  }
});

router.put("/bots/:id/loop-config", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.id);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot id" });
    return;
  }

  const role = req.user?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Only owners and admins can update loop config" });
    return;
  }

  const clientId = req.user?.clientId;

  const parsed = UpdateLoopConfigBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const data = parsed.data;

  try {
    const conditions = clientId
      ? and(eq(botLoopConfigTable.botId, botId), eq(botLoopConfigTable.clientId, clientId))
      : eq(botLoopConfigTable.botId, botId);

    const [existing] = await db.select().from(botLoopConfigTable).where(conditions).limit(1);

    if (existing) {
      const [updated] = await db
        .update(botLoopConfigTable)
        .set({
          ...(data.maxIterations !== undefined && { maxIterations: data.maxIterations }),
          ...(data.timeBudgetMs !== undefined && { timeBudgetMs: data.timeBudgetMs }),
          ...(data.costBudgetCents !== undefined && { costBudgetCents: data.costBudgetCents }),
          ...(data.qualityThreshold !== undefined && { qualityThreshold: String(data.qualityThreshold) }),
          ...(data.enableSelfEvaluation !== undefined && { enableSelfEvaluation: data.enableSelfEvaluation }),
          ...(data.enableBrowserAgent !== undefined && { enableBrowserAgent: data.enableBrowserAgent }),
          ...(data.model !== undefined && { model: data.model }),
          ...(data.fallbackModel !== undefined && { fallbackModel: data.fallbackModel }),
          ...(data.networkAllowList !== undefined && { networkAllowList: data.networkAllowList }),
        })
        .where(eq(botLoopConfigTable.id, existing.id))
        .returning();

      res.json({
        success: true,
        id: updated.id,
        botId: updated.botId,
        clientId: updated.clientId,
        isDefault: false,
        maxIterations: updated.maxIterations,
        timeBudgetMs: updated.timeBudgetMs,
        costBudgetCents: updated.costBudgetCents,
        qualityThreshold: parseFloat(String(updated.qualityThreshold)),
        enableSelfEvaluation: updated.enableSelfEvaluation,
        enableBrowserAgent: updated.enableBrowserAgent,
        model: updated.model,
        fallbackModel: updated.fallbackModel ?? null,
        networkAllowList: updated.networkAllowList ?? [],
        updatedAt: updated.updatedAt,
      });
    } else {
      const [inserted] = await db
        .insert(botLoopConfigTable)
        .values({
          botId,
          clientId: clientId ?? null,
          maxIterations: data.maxIterations ?? 10,
          timeBudgetMs: data.timeBudgetMs ?? 120000,
          costBudgetCents: data.costBudgetCents ?? 500,
          qualityThreshold: data.qualityThreshold !== undefined ? String(data.qualityThreshold) : "0.7",
          enableSelfEvaluation: data.enableSelfEvaluation ?? true,
          enableBrowserAgent: data.enableBrowserAgent ?? false,
          model: data.model ?? "gpt-5-mini",
          fallbackModel: data.fallbackModel ?? null,
          networkAllowList: data.networkAllowList ?? [],
        })
        .returning();

      res.json({
        success: true,
        id: inserted.id,
        botId: inserted.botId,
        clientId: inserted.clientId,
        isDefault: false,
        maxIterations: inserted.maxIterations,
        timeBudgetMs: inserted.timeBudgetMs,
        costBudgetCents: inserted.costBudgetCents,
        qualityThreshold: parseFloat(String(inserted.qualityThreshold)),
        enableSelfEvaluation: inserted.enableSelfEvaluation,
        enableBrowserAgent: inserted.enableBrowserAgent,
        model: inserted.model,
        fallbackModel: inserted.fallbackModel ?? null,
        networkAllowList: inserted.networkAllowList ?? [],
        updatedAt: inserted.updatedAt,
      });
    }
  } catch (err) {
    console.error("[loop-config PUT] Error:", err);
    res.status(500).json({ error: "Failed to update loop config" });
  }
});

export default router;
