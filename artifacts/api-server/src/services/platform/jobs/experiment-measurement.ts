import {
  db,
  experimentsTable,
  experimentAssignmentsTable,
  sessionOutcomesTable,
  toolHeuristicsTable,
  alignmentSignalsTable,
} from "@workspace/db";
import { eq, and, gte, inArray, count, sql } from "drizzle-orm";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let lastExperimentMeasureRun = 0;

function welchTTest(
  meanA: number,
  meanB: number,
  varA: number,
  varB: number,
  nA: number,
  nB: number,
): { t: number; p: number } {
  if (nA < 2 || nB < 2) return { t: 0, p: 1 };
  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { t: 0, p: 1 };
  const t = Math.abs((meanA - meanB) / se);
  // Two-tailed p-value approximation
  const p = Math.exp(-0.717 * t - 0.416 * t * t);
  return { t: parseFloat(t.toFixed(4)), p: Math.max(0.001, Math.min(1, p)) };
}

/**
 * Extracts a numeric metric value from a session outcome based on the experiment's metric name.
 */
function extractMetricValue(
  metric: string,
  row: {
    failureCategory: string | null;
    terminationReason: string | null;
    durationMinutes: string | null;
    costCents: number | null;
    loopIterations: number | null;
  },
): number | null {
  const m = metric.toLowerCase();
  if (m.includes("success_rate") || m.includes("outcome_score")) {
    return row.failureCategory === null ? 1 : 0;
  }
  if (m.includes("failure_rate")) {
    return row.failureCategory !== null ? 1 : 0;
  }
  if (m.includes("duration")) {
    return row.durationMinutes !== null ? parseFloat(row.durationMinutes) : null;
  }
  if (m.includes("cost")) {
    return row.costCents !== null ? row.costCents : null;
  }
  if (m.includes("loop_iterations") || m.includes("iteration")) {
    return row.loopIterations ?? null;
  }
  return row.failureCategory === null ? 1 : 0;
}

/**
 * Post-experiment hooks — called once when an experiment transitions to "completed".
 *
 * 1. Archives the losing variant via an alignment_signal (audit trail).
 * 2. Updates tool_heuristics belief state: if the metric is tool-related,
 *    boost the winner's success_rate to steer future sessions.
 */
async function runPostExperimentHooks(opts: {
  experimentId: number;
  winner: string | null;
  metric: string;
  meanA: number;
  meanB: number;
  nA: number;
  nB: number;
  result: string;
}) {
  const { experimentId, winner, metric, meanA, meanB, nA, nB, result } = opts;

  // 1. Loser archival — persist as alignment_signal for audit trail
  const loser = winner === "A" ? "B" : winner === "B" ? "A" : null;
  if (loser) {
    const loserMean = loser === "A" ? meanA : meanB;
    const winnerMean = loser === "A" ? meanB : meanA;
    await db.insert(alignmentSignalsTable).values({
      originalProposal: {
        experimentId,
        metric,
        loserCohort: loser,
        loserMean,
        loserN: loser === "A" ? nA : nB,
      },
      humanEdit: {
        winnerCohort: winner,
        winnerMean,
        winnerN: winner === "A" ? nA : nB,
      },
      diffSummary: `Experiment #${experimentId} completed: cohort ${winner} wins on metric '${metric}'. Loser cohort ${loser} archived. ${result}`,
      patternCategory: "experiment_loser_archival",
      sourceStakeholder: "downstream",
      softRuleStatus: "applied",
    }).onConflictDoNothing?.();
  }

  // 2. Belief state update — if metric is tool-related, update tool_heuristics
  // so that future tool selection reflects experimentally validated performance.
  const isToolMetric =
    metric.toLowerCase().includes("tool") ||
    metric.toLowerCase().includes("success_rate") ||
    metric.toLowerCase().includes("outcome_score");

  if (winner && isToolMetric) {
    const winnerImprovement = winner === "B" ? meanB - meanA : meanA - meanB;
    if (winnerImprovement > 0.01) {
      // Find existing tool_heuristics for the general context and boost top-ranked tool
      const existingHeuristics = await db
        .select({ id: toolHeuristicsTable.id, successRate: toolHeuristicsTable.successRate })
        .from(toolHeuristicsTable)
        .where(eq(toolHeuristicsTable.rankInContext, 1))
        .limit(5);

      for (const h of existingHeuristics) {
        const newRate = Math.min(1.0, (h.successRate ?? 0) + winnerImprovement * 0.1);
        await db
          .update(toolHeuristicsTable)
          .set({
            successRate: newRate,
            lastComputedAt: new Date(),
          })
          .where(eq(toolHeuristicsTable.id, h.id));
      }

      console.log(
        `[experiments] Post-processing #${experimentId}: belief state updated — ` +
          `boosted ${existingHeuristics.length} top tool heuristics by ${(winnerImprovement * 0.1).toFixed(4)}`,
      );
    }
  }

  console.log(`[experiments] Post-processing #${experimentId}: archival and belief state update complete.`);
}

export async function runExperimentMeasurement() {
  const now = Date.now();
  if (now - lastExperimentMeasureRun < ONE_DAY_MS) return;
  lastExperimentMeasureRun = now;

  console.log("[experiments] Running daily experiment measurement...");

  const running = await db
    .select()
    .from(experimentsTable)
    .where(eq(experimentsTable.status, "running"));

  for (const experiment of running) {
    try {
      // Fetch all persisted assignments for this experiment
      const assignments = await db
        .select({
          sessionId: experimentAssignmentsTable.sessionId,
          conversationId: experimentAssignmentsTable.conversationId,
          cohort: experimentAssignmentsTable.cohort,
        })
        .from(experimentAssignmentsTable)
        .where(eq(experimentAssignmentsTable.experimentId, experiment.id))
        .limit(5000);

      if (assignments.length === 0) {
        console.log(`[experiments] Experiment #${experiment.id}: no assignments yet`);
        continue;
      }

      // Partition assignments by cohort
      const sessionIdsA = assignments
        .filter((a) => a.cohort === "A" && a.sessionId !== null)
        .map((a) => a.sessionId as number);
      const sessionIdsB = assignments
        .filter((a) => a.cohort === "B" && a.sessionId !== null)
        .map((a) => a.sessionId as number);

      if (sessionIdsA.length === 0 && sessionIdsB.length === 0) {
        console.log(`[experiments] Experiment #${experiment.id}: no session-linked assignments`);
        continue;
      }

      // Fetch session outcomes for each cohort
      const fetchOutcomesForSessions = async (sessionIds: number[]) => {
        if (sessionIds.length === 0) return [];
        return db
          .select({
            sessionId: sessionOutcomesTable.sessionId,
            failureCategory: sessionOutcomesTable.failureCategory,
            terminationReason: sessionOutcomesTable.terminationReason,
            durationMinutes: sessionOutcomesTable.durationMinutes,
            costCents: sessionOutcomesTable.costCents,
            loopIterations: sessionOutcomesTable.loopIterations,
          })
          .from(sessionOutcomesTable)
          .where(
            // Use IN clause via raw SQL to avoid Drizzle inArray type issues with large arrays
            sql`${sessionOutcomesTable.sessionId} = ANY(${sessionIds}::int[])`,
          );
      };

      const outcomesA = await fetchOutcomesForSessions(sessionIdsA);
      const outcomesB = await fetchOutcomesForSessions(sessionIdsB);

      const valuesA = outcomesA
        .map((o) => extractMetricValue(experiment.metric, o))
        .filter((v): v is number => v !== null);
      const valuesB = outcomesB
        .map((o) => extractMetricValue(experiment.metric, o))
        .filter((v): v is number => v !== null);

      const nA = valuesA.length;
      const nB = valuesB.length;

      const meanA = nA > 0 ? valuesA.reduce((a, b) => a + b, 0) / nA : 0;
      const meanB = nB > 0 ? valuesB.reduce((a, b) => a + b, 0) / nB : 0;

      const varA =
        nA > 1
          ? valuesA.reduce((acc, v) => acc + Math.pow(v - meanA, 2), 0) / (nA - 1)
          : Math.max(0.01, meanA * (1 - meanA));
      const varB =
        nB > 1
          ? valuesB.reduce((acc, v) => acc + Math.pow(v - meanB, 2), 0) / (nB - 1)
          : Math.max(0.01, meanB * (1 - meanB));

      const { t, p } = welchTTest(meanA, meanB, varA, varB, Math.max(nA, 2), Math.max(nB, 2));
      const significant = nA >= 10 && nB >= 10 && p < (experiment.significanceThreshold ?? 0.05);

      const maxDays = 14;
      const daysSinceStart = (now - new Date(experiment.startedAt).getTime()) / ONE_DAY_MS;
      const timedOut = daysSinceStart > maxDays;

      if (significant || timedOut) {
        let winner: string | null = null;
        let result: string;

        if (significant) {
          winner = meanB > meanA ? "B" : "A";
          result = `${winner} wins (meanA=${meanA.toFixed(3)}, meanB=${meanB.toFixed(3)}, nA=${nA}, nB=${nB}, p=${p.toFixed(3)})`;
        } else {
          result = `Inconclusive after ${Math.round(daysSinceStart)} days (meanA=${meanA.toFixed(3)}, meanB=${meanB.toFixed(3)}, nA=${nA}, nB=${nB}, p=${p.toFixed(3)})`;
        }

        await db
          .update(experimentsTable)
          .set({
            currentSampleSizeA: nA,
            currentSampleSizeB: nB,
            metricValueA: meanA,
            metricValueB: meanB,
            tStatistic: t,
            pValue: p,
            significanceReached: significant,
            winner,
            result,
            status: "completed",
            endedAt: new Date(),
          })
          .where(eq(experimentsTable.id, experiment.id));

        console.log(`[experiments] Experiment #${experiment.id}: ${result}`);

        // ── Post-experiment processing ──────────────────────────────────────
        // 1. Loser archival — mark losing cohort in a new alignment_signal so
        //    analysts can audit which variant was deprecated and why.
        // 2. Belief state update — if the experiment proved a tool is superior
        //    in this metric context, bump its success_rate in tool_heuristics
        //    to steer future sessions toward the proven winner.
        await runPostExperimentHooks({
          experimentId: experiment.id,
          winner,
          metric: experiment.metric,
          meanA,
          meanB,
          nA,
          nB,
          result,
        }).catch((err) => {
          console.error(`[experiments] Post-processing error for #${experiment.id}:`, err);
        });
      } else {
        await db
          .update(experimentsTable)
          .set({
            currentSampleSizeA: nA,
            currentSampleSizeB: nB,
            metricValueA: meanA,
            metricValueB: meanB,
            tStatistic: t,
            pValue: p,
          })
          .where(eq(experimentsTable.id, experiment.id));

        console.log(
          `[experiments] Experiment #${experiment.id}: interim nA=${nA}, nB=${nB}, t=${t}, p=${p.toFixed(3)}`,
        );
      }
    } catch (err) {
      console.error(`[experiments] Error measuring experiment ${experiment.id}:`, err);
    }
  }

  console.log("[experiments] Daily measurement complete.");
}
