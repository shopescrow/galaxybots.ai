import { Router, type IRouter } from "express";
import {
  db,
  causalOutcomesTable,
  syntheticControlsTable,
  goalConflictsTable,
  opportunitySignalsTable,
  botAssignmentsTable,
} from "@workspace/db";
import { eq, desc, gte, and, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics/causal/patterns", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const limit = parseInt(req.query.limit as string ?? "20");

  const patterns = await db
    .select()
    .from(causalOutcomesTable)
    .where(
      and(
        eq(causalOutcomesTable.clientId, clientId),
        isNotNull(causalOutcomesTable.attributionConfidence),
      ),
    )
    .orderBy(desc(causalOutcomesTable.attributionConfidence))
    .limit(Math.min(limit, 50));

  res.json(patterns);
});

router.get("/analytics/causal/summary", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const [patterns, controls, conflicts, signals, autonomousGoals] = await Promise.all([
    db
      .select()
      .from(causalOutcomesTable)
      .where(eq(causalOutcomesTable.clientId, clientId))
      .orderBy(desc(causalOutcomesTable.attributionConfidence))
      .limit(20),

    db
      .select()
      .from(syntheticControlsTable)
      .where(eq(syntheticControlsTable.clientId, clientId))
      .orderBy(desc(syntheticControlsTable.computedAt))
      .limit(20),

    db
      .select()
      .from(goalConflictsTable)
      .where(eq(goalConflictsTable.clientId, clientId))
      .orderBy(desc(goalConflictsTable.createdAt))
      .limit(10),

    db
      .select()
      .from(opportunitySignalsTable)
      .where(eq(opportunitySignalsTable.clientId, clientId))
      .orderBy(desc(opportunitySignalsTable.detectedAt))
      .limit(20),

    db
      .select()
      .from(botAssignmentsTable)
      .where(
        and(
          eq(botAssignmentsTable.clientId, clientId),
          eq(botAssignmentsTable.generatedBy, "autonomous"),
        ),
      )
      .limit(50),
  ]);

  const avgAttributionConfidence =
    patterns.length > 0
      ? patterns.reduce((s, p) => s + (p.attributionConfidence ?? 0), 0) / patterns.length
      : 0;

  const avgMatchQuality =
    controls.length > 0
      ? controls.reduce((s, c) => s + (c.matchScore ?? 0), 0) / controls.length
      : 0;

  const autoApproved = autonomousGoals.filter((g) => g.isActive !== "pending").length;
  const pendingApproval = autonomousGoals.filter((g) => g.isActive === "pending").length;

  const signalsApproved = signals.filter((s) => s.status === "approved").length;
  const signalsDismissed = signals.filter((s) => s.status === "dismissed").length;
  const signalsPending = signals.filter((s) => s.status === "pending").length;

  const conflictsAutoResolved = conflicts.filter((c) => c.resolvedBy === "system" && !c.escalatedToHuman).length;
  const conflictsEscalated = conflicts.filter((c) => c.escalatedToHuman).length;

  res.json({
    patterns: {
      total: patterns.length,
      avgAttributionConfidence: parseFloat(avgAttributionConfidence.toFixed(3)),
      topPatterns: patterns.slice(0, 5).map((p) => ({
        id: p.id,
        toolName: p.toolName,
        metricName: p.metricName,
        treatmentEffect: p.treatmentEffect,
        attributionConfidence: p.attributionConfidence,
        causalPatternSummary: p.causalPatternSummary,
        measuredAt: p.measuredAt,
      })),
    },
    controls: {
      total: controls.length,
      avgMatchQuality: parseFloat(avgMatchQuality.toFixed(3)),
      matchQualityDistribution: controls.map((c) => c.matchScore ?? 0),
    },
    opportunities: {
      total: signals.length,
      pending: signalsPending,
      approved: signalsApproved,
      dismissed: signalsDismissed,
      hitRate: signals.length > 0 ? parseFloat(((signalsApproved / Math.max(signalsApproved + signalsDismissed, 1)) * 100).toFixed(1)) : 0,
      signals: signals.slice(0, 10),
    },
    goals: {
      totalAutonomous: autonomousGoals.length,
      autoApproved,
      pendingApproval,
    },
    conflicts: {
      total: conflicts.length,
      autoResolved: conflictsAutoResolved,
      escalatedToHuman: conflictsEscalated,
      history: conflicts.slice(0, 10),
    },
  });
});

router.get("/analytics/causal/match-quality", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const controls = await db
    .select({ matchScore: syntheticControlsTable.matchScore })
    .from(syntheticControlsTable)
    .where(eq(syntheticControlsTable.clientId, clientId))
    .orderBy(desc(syntheticControlsTable.computedAt))
    .limit(100);

  const scores = controls.map((c) => c.matchScore ?? 0);
  const buckets = [0, 0, 0, 0, 0];
  for (const s of scores) {
    const bucket = Math.min(Math.floor(s * 5), 4);
    buckets[bucket]++;
  }

  res.json({
    total: scores.length,
    buckets: buckets.map((count, i) => ({
      range: `${i * 20}–${(i + 1) * 20}%`,
      count,
    })),
    average: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
  });
});

export default router;
