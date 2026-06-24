/**
 * Platform Intelligence Score — weekly computation job.
 *
 * Computes 5 dimensions:
 *   1. reasoning_depth    — median loop iterations to success (inverted)
 *   2. memory_coherence   — avg belief confidence weighted by evidence_count
 *   3. goal_autonomy      — % goals autonomous vs. human-assigned
 *   4. self_improvement_rate — mean prompt_version score_delta per 30-day period
 *   5. alignment_fidelity — multi-stakeholder approval rate
 *
 * Composite = geometric mean of normalized scores.
 * Stored in oracle_reports.dimension_scores (appended to latest report if same week).
 */

import {
  db,
  sessionOutcomesTable,
  calibrationCheckpointsTable,
  promptVersionsTable,
  alignmentSignalsTable,
  oracleReportsTable,
} from "@workspace/db";
import { eq, and, gte, desc, sql } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastIntelligenceScoreRun = 0;

export async function runPlatformIntelligenceScore() {
  const now = Date.now();
  if (now - lastIntelligenceScoreRun < SEVEN_DAYS_MS) return;
  lastIntelligenceScoreRun = now;

  console.log("[platform-intelligence] Computing weekly platform intelligence score...");

  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    const [loopStats] = await db
      .select({
        medianIterations: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${sessionOutcomesTable.loopIterations})`,
        avgIterations: sql<number>`AVG(${sessionOutcomesTable.loopIterations})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(sessionOutcomesTable)
      .where(
        and(
          gte(sessionOutcomesTable.createdAt, since30d),
          sql`${sessionOutcomesTable.loopIterations} IS NOT NULL`,
        ),
      );

    const medianIterations = loopStats?.medianIterations ?? 5;
    const MAX_ITERATIONS = 12;
    const reasoningDepth = Math.min(1, Math.max(0, 1 - (medianIterations - 1) / (MAX_ITERATIONS - 1)));

    const [beliefStats] = await db
      .select({
        weightedConfidence: sql<number>`
          SUM(${calibrationCheckpointsTable.predictedAvg} * ${calibrationCheckpointsTable.sampleSize}) /
          NULLIF(SUM(${calibrationCheckpointsTable.sampleSize}), 0)
        `,
      })
      .from(calibrationCheckpointsTable)
      .where(gte(calibrationCheckpointsTable.createdAt, since30d));

    const memoryCoherence = Math.min(1, Math.max(0, beliefStats?.weightedConfidence ?? 0.5));

    // goal_autonomy: % of bot_assignments initiated autonomously (generated_by != 'human')
    // Raw SQL with fallback in case the generated_by column does not exist on all deployments.
    let goalAutonomy = 0.5;
    try {
      const gaRows = await db.execute<{ autonomous: string; total: string }>(
        sql`SELECT
          COUNT(*) FILTER (WHERE generated_by IS DISTINCT FROM 'human') AS autonomous,
          COUNT(*) AS total
        FROM bot_assignments
        WHERE created_at >= ${since30d}`,
      );
      const gaRow = gaRows.rows?.[0] ?? gaRows[0];
      const autonomous = Number(gaRow?.autonomous ?? 0);
      const total = Number(gaRow?.total ?? 0);
      if (total > 0) goalAutonomy = Math.min(1, autonomous / total);
    } catch {
      goalAutonomy = 0.5;
    }

    const [promptStats] = await db
      .select({
        avgDelta: sql<number>`AVG(${promptVersionsTable.outcomeScoreAfter} - ${promptVersionsTable.outcomeScoreBefore})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(promptVersionsTable)
      .where(
        and(
          gte(promptVersionsTable.createdAt, since30d),
          sql`${promptVersionsTable.outcomeScoreAfter} IS NOT NULL`,
          sql`${promptVersionsTable.outcomeScoreBefore} IS NOT NULL`,
        ),
      );

    const rawDelta = promptStats?.avgDelta ?? 0;
    const selfImprovementRate = Math.min(1, Math.max(0, 0.5 + rawDelta * 5));

    const [totalSignals] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alignmentSignalsTable)
      .where(gte(alignmentSignalsTable.createdAt, since30d));

    const [appliedSignals] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alignmentSignalsTable)
      .where(
        and(
          gte(alignmentSignalsTable.createdAt, since30d),
          eq(alignmentSignalsTable.softRuleStatus, "applied"),
        ),
      );

    const totalSig = totalSignals?.count ?? 0;
    const appliedSig = appliedSignals?.count ?? 0;
    const alignmentFidelity = totalSig > 0 ? Math.min(1, appliedSig / totalSig) : 0.5;

    const dimensionScores = {
      reasoningDepth: parseFloat(reasoningDepth.toFixed(3)),
      memoryCoherence: parseFloat(memoryCoherence.toFixed(3)),
      goalAutonomy: parseFloat(goalAutonomy.toFixed(3)),
      selfImprovementRate: parseFloat(selfImprovementRate.toFixed(3)),
      alignmentFidelity: parseFloat(alignmentFidelity.toFixed(3)),
    };

    const scores = Object.values(dimensionScores);
    const geometricMean = Math.pow(
      scores.reduce((a, b) => a * Math.max(0.001, b), 1),
      1 / scores.length,
    );
    const intelligenceScore = parseFloat((geometricMean * 100).toFixed(1));

    const latestReport = await db
      .select({ id: oracleReportsTable.id, reportDate: oracleReportsTable.reportDate })
      .from(oracleReportsTable)
      .orderBy(desc(oracleReportsTable.reportDate))
      .limit(1);

    const weekStart = new Date(now - SEVEN_DAYS_MS);

    if (
      latestReport.length > 0 &&
      latestReport[0].reportDate &&
      new Date(latestReport[0].reportDate) > weekStart
    ) {
      await db
        .update(oracleReportsTable)
        .set({ intelligenceScore, dimensionScores })
        .where(eq(oracleReportsTable.id, latestReport[0].id));

      console.log(
        `[platform-intelligence] Updated latest Oracle report #${latestReport[0].id}: score=${intelligenceScore}`,
      );
    } else {
      await db.insert(oracleReportsTable).values({
        reportDate: new Date(),
        reportJson: {
          findings: [],
          recommendations: [],
          anomalies: [],
          topPerformingBotConfigs: [],
          underperformingRoles: [],
          experimentOutcomes: [],
          alignmentRuleEffectiveness: alignmentFidelity,
          consequenceModelAccuracy: null,
        },
        intelligenceScore,
        dimensionScores,
        modelVersion: "1.0",
      });

      console.log(`[platform-intelligence] New Oracle report created: score=${intelligenceScore}`);
    }

    console.log(
      `[platform-intelligence] Dimensions: reasoning=${dimensionScores.reasoningDepth}, ` +
      `coherence=${dimensionScores.memoryCoherence}, autonomy=${dimensionScores.goalAutonomy}, ` +
      `improvement=${dimensionScores.selfImprovementRate}, fidelity=${dimensionScores.alignmentFidelity}`,
    );
  } catch (err) {
    console.error("[platform-intelligence] Error computing score:", err);
  }
}
