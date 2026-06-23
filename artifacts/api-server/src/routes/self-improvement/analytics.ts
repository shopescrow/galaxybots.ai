import { Router, type IRouter } from "express";
import {
  db,
  calibrationCheckpointsTable,
  promptVersionsTable,
  experimentsTable,
  toolHeuristicsTable,
  alignmentSignalsTable,
} from "@workspace/db";
import { desc, gte, and, eq, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/self-improvement/analytics/overview", async (req, res): Promise<void> => {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [calibrations, promptVersions, experiments, toolHeuristics, alignmentSignals] =
    await Promise.all([
      db
        .select()
        .from(calibrationCheckpointsTable)
        .where(gte(calibrationCheckpointsTable.periodEnd, since30d))
        .orderBy(desc(calibrationCheckpointsTable.periodEnd))
        .limit(200),

      db
        .select()
        .from(promptVersionsTable)
        .where(gte(promptVersionsTable.createdAt, since30d))
        .orderBy(desc(promptVersionsTable.createdAt))
        .limit(200),

      db
        .select()
        .from(experimentsTable)
        .orderBy(desc(experimentsTable.startedAt))
        .limit(50),

      db
        .select()
        .from(toolHeuristicsTable)
        .orderBy(desc(toolHeuristicsTable.lastComputedAt))
        .limit(100),

      db
        .select()
        .from(alignmentSignalsTable)
        .where(gte(alignmentSignalsTable.createdAt, since30d))
        .limit(500),
    ]);

  const avgCalibrationError =
    calibrations.length > 0
      ? calibrations.reduce((s, c) => s + c.calibrationError, 0) / calibrations.length
      : 0;

  const promptStats = {
    total: promptVersions.length,
    active: promptVersions.filter((p) => p.status === "active").length,
    shadow: promptVersions.filter((p) => p.status === "shadow").length,
    pendingReview: promptVersions.filter((p) => p.status === "pending_review").length,
    rolledBack: promptVersions.filter((p) => p.status === "rolled_back").length,
    avgScoreBefore:
      promptVersions.filter((p) => p.outcomeScoreBefore != null).reduce(
        (s, p) => s + (p.outcomeScoreBefore ?? 0), 0,
      ) / Math.max(promptVersions.filter((p) => p.outcomeScoreBefore != null).length, 1),
  };

  const experimentStats = {
    total: experiments.length,
    running: experiments.filter((e) => e.status === "running").length,
    completed: experiments.filter((e) => e.status === "completed").length,
    winRate:
      experiments.filter((e) => e.status === "completed").length > 0
        ? experiments.filter((e) => e.status === "completed" && e.winner != null).length /
          experiments.filter((e) => e.status === "completed").length
        : 0,
  };

  const alignmentStats = {
    totalSignals: alignmentSignals.length,
    proposedRules: alignmentSignals.filter((s) => s.softRuleStatus === "proposed").length,
    activeRules: alignmentSignals.filter((s) => s.softRuleStatus === "active").length,
    adoptionRate:
      alignmentSignals.filter((s) => s.extractedSoftRule != null).length > 0
        ? alignmentSignals.filter((s) => s.softRuleStatus === "active").length /
          alignmentSignals.filter((s) => s.extractedSoftRule != null).length
        : 0,
  };

  const toolStats = {
    totalHeuristics: toolHeuristics.length,
    avgSuccessRate:
      toolHeuristics.length > 0
        ? toolHeuristics.reduce((s, h) => s + h.successRate, 0) / toolHeuristics.length
        : 0,
    counterfactualAdjusted: toolHeuristics.filter((h) => h.isCounterfactualAdjusted).length,
  };

  res.json({
    calibration: {
      avgError: parseFloat(avgCalibrationError.toFixed(4)),
      checkpointsCount: calibrations.length,
    },
    promptVersions: promptStats,
    experiments: experimentStats,
    alignment: alignmentStats,
    toolHeuristics: toolStats,
  });
});

router.get("/self-improvement/analytics/prompt-timeline", async (req, res): Promise<void> => {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const versions = await db
    .select({
      id: promptVersionsTable.id,
      botId: promptVersionsTable.botId,
      versionNum: promptVersionsTable.versionNum,
      status: promptVersionsTable.status,
      outcomeScoreBefore: promptVersionsTable.outcomeScoreBefore,
      outcomeScoreAfter: promptVersionsTable.outcomeScoreAfter,
      diffMagnitudePct: promptVersionsTable.diffMagnitudePct,
      createdAt: promptVersionsTable.createdAt,
      activatedAt: promptVersionsTable.activatedAt,
    })
    .from(promptVersionsTable)
    .where(gte(promptVersionsTable.createdAt, since))
    .orderBy(promptVersionsTable.createdAt)
    .limit(200);

  res.json(versions);
});

router.get("/self-improvement/analytics/tool-heuristics", async (req, res): Promise<void> => {
  const heuristics = await db
    .select()
    .from(toolHeuristicsTable)
    .orderBy(desc(toolHeuristicsTable.successRate))
    .limit(50);

  const byContext: Record<string, typeof heuristics> = {};
  for (const h of heuristics) {
    if (!byContext[h.contextType]) byContext[h.contextType] = [];
    byContext[h.contextType].push(h);
  }

  res.json({ heuristics, byContext });
});

export default router;
