import { Router, type IRouter } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { db, goldenPromptsTable, goldenEvalRunsTable } from "@workspace/db";
import { eq, desc, sql, avg, and, isNull, or } from "drizzle-orm";
import { runGoldenEval, seedGoldenPromptsIfEmpty, getLatestGoldenEvalResults } from "../../services/ai-safety/golden-eval";
import { recomputeModelReputations } from "../../services/platform/jobs/model-reputation";
import { z } from "zod/v4";

const router: IRouter = Router();

/**
 * Authorization model for golden-prompt admin routes:
 *
 * golden_prompts rows have a nullable client_id column:
 *   client_id = null  → global/platform prompt seeded at startup (cannot be
 *                        mutated or deleted via any API endpoint)
 *   client_id = N     → tenant-owned prompt; only that tenant's owner can
 *                        create / patch / delete it
 *
 * GET returns global prompts + the requester's own prompts so owners can see
 * the full evaluation set that affects their model routing.
 *
 * The on-demand eval and scheduled runner use ALL active prompts (global +
 * all tenants) intentionally — regression detection is platform-wide.
 */

// ── Golden prompt management ────────────────────────────────────────────────

router.get("/admin/golden-prompts", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  try {
    // Return global prompts (client_id IS NULL) and the requester's own prompts.
    const prompts = await db
      .select()
      .from(goldenPromptsTable)
      .where(or(isNull(goldenPromptsTable.clientId), eq(goldenPromptsTable.clientId, clientId)))
      .orderBy(goldenPromptsTable.taskCategory, goldenPromptsTable.id);
    res.json(prompts);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch golden prompts" });
  }
});

const createPromptSchema = z.object({
  taskCategory: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  prompt: z.string().min(10),
  idealResponse: z.string().optional(),
  scoringRubric: z.string().optional(),
  active: z.boolean().default(true),
});

router.post("/admin/golden-prompts", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const parsed = createPromptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const clientId = req.user!.clientId;
  try {
    // Always stamp with the requester's clientId — tenants cannot create global prompts.
    const [row] = await db
      .insert(goldenPromptsTable)
      .values({ ...parsed.data, clientId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create golden prompt" });
  }
});

router.patch("/admin/golden-prompts/:id", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { active } = req.body as { active?: boolean };
  if (active === undefined) { res.status(400).json({ error: "active field required" }); return; }
  const clientId = req.user!.clientId;
  try {
    // Row-level ownership: can only patch prompts owned by this tenant.
    // Global prompts (client_id IS NULL) are intentionally excluded.
    const [row] = await db
      .update(goldenPromptsTable)
      .set({ active: Boolean(active), updatedAt: new Date() })
      .where(and(eq(goldenPromptsTable.id, id), eq(goldenPromptsTable.clientId, clientId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Prompt not found or not owned by your account" }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update golden prompt" });
  }
});

router.delete("/admin/golden-prompts/:id", authenticate, requireRole("owner"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const clientId = req.user!.clientId;
  try {
    // Row-level ownership: can only delete prompts owned by this tenant.
    // Global prompts (client_id IS NULL) are protected from deletion via API.
    const deleted = await db
      .delete(goldenPromptsTable)
      .where(and(eq(goldenPromptsTable.id, id), eq(goldenPromptsTable.clientId, clientId)))
      .returning({ id: goldenPromptsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Prompt not found or not owned by your account" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to delete golden prompt" });
  }
});

// ── Golden eval trigger & results ───────────────────────────────────────────

router.post("/admin/golden-eval/run", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    await seedGoldenPromptsIfEmpty();
    const result = await runGoldenEval("admin");
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Golden eval failed" });
  }
});

router.get("/admin/golden-eval/results", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    const results = await getLatestGoldenEvalResults();
    const recentRuns = await db
      .select({
        runId: goldenEvalRunsTable.runId,
        triggeredBy: goldenEvalRunsTable.triggeredBy,
        runDate: sql<Date>`max(${goldenEvalRunsTable.createdAt})`,
        totalPrompts: sql<number>`count(distinct ${goldenEvalRunsTable.promptId})`,
        modelsEvaluated: sql<number>`count(distinct ${goldenEvalRunsTable.model})`,
        meanScore: avg(goldenEvalRunsTable.judgeScore),
        anyRegression: sql<boolean>`bool_or(${goldenEvalRunsTable.regressionFlag})`,
      })
      .from(goldenEvalRunsTable)
      .groupBy(goldenEvalRunsTable.runId, goldenEvalRunsTable.triggeredBy)
      .orderBy(sql`max(${goldenEvalRunsTable.createdAt}) desc`)
      .limit(20);

    res.json({
      latestByModel: results,
      recentRuns: recentRuns.map((r) => ({
        runId: r.runId,
        triggeredBy: r.triggeredBy,
        runDate: r.runDate,
        totalPrompts: Number(r.totalPrompts),
        modelsEvaluated: Number(r.modelsEvaluated),
        meanJudgeScore: r.meanScore != null ? Number(r.meanScore) : null,
        anyRegression: Boolean(r.anyRegression),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch golden eval results" });
  }
});

// ── Force a model-reputation recompute on demand ────────────────────────────

router.post("/admin/model-reputation/recompute", authenticate, requireRole("owner"), async (_req, res): Promise<void> => {
  try {
    await recomputeModelReputations();
    res.json({ ok: true, message: "Model reputation recomputed successfully" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Recompute failed" });
  }
});

export default router;
