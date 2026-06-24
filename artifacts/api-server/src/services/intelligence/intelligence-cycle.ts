import {
  db,
  coordinatorWeightsTable,
  conductorStrategiesTable,
  intelligenceCycleRunsTable,
  weightSnapshotsTable,
  guardianIncidentsTable,
} from "@workspace/db";
import { eq, and, gte, sql, desc, lt } from "drizzle-orm";
import type { CommunicationStrategy, TaskCategory } from "@workspace/db";
import { detectModelVersionChange, archiveAndRebaseWeights } from "../coordinator/galaxy-coordinator";
import { deriveModelTier } from "../conductor/galaxy-conductor";

const DEFAULT_DAYS = 7;
const Z_SCORE_THRESHOLD = 1.5;
const CORRECTION_RATE = 0.08;
const WEIGHT_FLOOR = 0.1;
const WEIGHT_CEILING = 10.0;
const REGRESSION_THRESHOLD = 0.05;
const REGRESSION_LOOKBACK_HOURS = 48;

const MAX_EXPECTED_TOOLS = 20;
const MAX_ITERATIONS = 10;
const CONTEXT_WINDOW_SIZE = 128000;

const TASK_CATEGORIES: TaskCategory[] = ["research", "analysis", "execution", "review", "legal", "financial"];

interface CategoryStats {
  category: string;
  avgResidualScore: number;
  stdDev: number;
  count: number;
}

interface StrategyWinner {
  taskCategory: string;
  bestStrategy: CommunicationStrategy;
  avgScore: number;
  runCount: number;
}

interface StrategyLoser {
  taskCategory: string;
  worstStrategy: CommunicationStrategy;
  avgScore: number;
  runCount: number;
}

export interface IntelligenceCycleResult {
  clientId?: number;
  ranAt: Date;
  daysAnalyzed: number;
  coordinatorCorrections: number;
  conductorCorrections: number;
  winnerCategories: StrategyWinner[];
  loserCategories: StrategyLoser[];
  summary: string;
  cycleStatus: string;
  snapshotId?: number;
}

interface OlsCoefficients {
  betaDifficulty: number;
  betaPrompt: number;
  intercept: number;
}

function estimateOlsCoefficients(
  data: Array<{ quality: number; difficulty: number; prompt: number }>,
): OlsCoefficients {
  if (data.length < 5) {
    return { betaDifficulty: 0.2, betaPrompt: -0.1, intercept: 0.5 };
  }

  const n = data.length;
  let sumQ = 0, sumD = 0, sumP = 0;
  for (const d of data) {
    sumQ += d.quality;
    sumD += d.difficulty;
    sumP += d.prompt;
  }
  const meanQ = sumQ / n;
  const meanD = sumD / n;
  const meanP = sumP / n;

  let ssDQ = 0, ssDsq = 0, ssPQ = 0, sPsq = 0, sDsP = 0;
  for (const d of data) {
    const dq = d.quality - meanQ;
    const dd = d.difficulty - meanD;
    const dp = d.prompt - meanP;
    ssDQ += dd * dq;
    ssDsq += dd * dd;
    ssPQ += dp * dq;
    sPsq += dp * dp;
    sDsP += dd * dp;
  }

  const det = ssDsq * sPsq - sDsP * sDsP;
  if (Math.abs(det) < 1e-10) {
    return { betaDifficulty: 0.2, betaPrompt: -0.1, intercept: 0.5 };
  }

  const betaDifficulty = (ssDQ * sPsq - ssPQ * sDsP) / det;
  const betaPrompt = (ssPQ * ssDsq - ssDQ * sDsP) / det;
  const intercept = meanQ - betaDifficulty * meanD - betaPrompt * meanP;

  return { betaDifficulty, betaPrompt, intercept };
}

export async function getConfoundCoefficients(
  since: Date,
  clientId?: number,
): Promise<OlsCoefficients> {
  try {
    const filterClauses = [
      gte(conductorStrategiesTable.createdAt, since),
      sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
      sql`${conductorStrategiesTable.taskDifficultyScore} IS NOT NULL`,
      sql`${conductorStrategiesTable.promptQualityScore} IS NOT NULL`,
    ];
    if (clientId != null) {
      filterClauses.push(eq(conductorStrategiesTable.clientId, clientId));
    }

    const rows = await db
      .select({
        qualityScore: conductorStrategiesTable.qualityScore,
        taskDifficultyScore: conductorStrategiesTable.taskDifficultyScore,
        promptQualityScore: conductorStrategiesTable.promptQualityScore,
      })
      .from(conductorStrategiesTable)
      .where(and(...filterClauses))
      .limit(500);

    const data = rows
      .filter((r) => r.qualityScore != null && r.taskDifficultyScore != null && r.promptQualityScore != null)
      .map((r) => ({
        quality: Number(r.qualityScore),
        difficulty: Number(r.taskDifficultyScore),
        prompt: Number(r.promptQualityScore),
      }));

    return estimateOlsCoefficients(data);
  } catch {
    return { betaDifficulty: 0.2, betaPrompt: -0.1, intercept: 0.5 };
  }
}

export function computeResidualQuality(
  qualityScore: number,
  taskDifficultyScore: number | null,
  promptQualityScore: number | null,
  coeffs: OlsCoefficients,
): number {
  if (taskDifficultyScore == null || promptQualityScore == null) return qualityScore;
  const predicted = coeffs.intercept + coeffs.betaDifficulty * taskDifficultyScore + coeffs.betaPrompt * promptQualityScore;
  return Math.max(0, Math.min(1, qualityScore - predicted + 0.5));
}

async function computeCategoryZScores(
  since: Date,
  clientId?: number,
  modelVersion?: string,
  coeffs?: OlsCoefficients,
  modelTier?: string,
): Promise<CategoryStats[]> {
  const filterClauses = [
    gte(conductorStrategiesTable.createdAt, since),
    sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
  ];

  if (clientId != null) {
    filterClauses.push(eq(conductorStrategiesTable.clientId, clientId));
  } else {
    filterClauses.push(sql`(${conductorStrategiesTable.clientId} IS NULL OR ${conductorStrategiesTable.clientId} = -1)`);
  }
  if (modelVersion) {
    filterClauses.push(eq(conductorStrategiesTable.modelVersion, modelVersion));
  }
  if (modelTier) {
    filterClauses.push(eq(conductorStrategiesTable.modelTier, modelTier));
  }

  const rows = await db
    .select({
      category: conductorStrategiesTable.taskCategory,
      qualityScore: conductorStrategiesTable.qualityScore,
      taskDifficultyScore: conductorStrategiesTable.taskDifficultyScore,
      promptQualityScore: conductorStrategiesTable.promptQualityScore,
    })
    .from(conductorStrategiesTable)
    .where(and(...filterClauses));

  const byCategory = new Map<string, number[]>();
  for (const row of rows) {
    const residual = coeffs
      ? computeResidualQuality(
          Number(row.qualityScore),
          row.taskDifficultyScore ?? null,
          row.promptQualityScore ?? null,
          coeffs,
        )
      : Number(row.qualityScore);

    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(residual);
  }

  const stats: CategoryStats[] = [];
  for (const [category, scores] of byCategory.entries()) {
    const n = scores.length;
    const avg = scores.reduce((s, v) => s + v, 0) / n;
    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    stats.push({ category, avgResidualScore: avg, stdDev, count: n });
  }

  return stats;
}

async function findStrategyWinners(
  since: Date,
  clientId?: number,
  modelVersion?: string,
  coeffs?: OlsCoefficients,
  modelTier?: string,
): Promise<{ winners: StrategyWinner[]; losers: StrategyLoser[] }> {
  const filterClauses = [
    gte(conductorStrategiesTable.createdAt, since),
    sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
  ];

  if (clientId != null) {
    filterClauses.push(eq(conductorStrategiesTable.clientId, clientId));
  } else {
    filterClauses.push(sql`(${conductorStrategiesTable.clientId} IS NULL OR ${conductorStrategiesTable.clientId} = -1)`);
  }
  if (modelVersion) {
    filterClauses.push(eq(conductorStrategiesTable.modelVersion, modelVersion));
  }
  if (modelTier) {
    filterClauses.push(eq(conductorStrategiesTable.modelTier, modelTier));
  }

  const rows = await db
    .select({
      category: conductorStrategiesTable.taskCategory,
      strategy: conductorStrategiesTable.strategyChosen,
      qualityScore: conductorStrategiesTable.qualityScore,
      taskDifficultyScore: conductorStrategiesTable.taskDifficultyScore,
      promptQualityScore: conductorStrategiesTable.promptQualityScore,
    })
    .from(conductorStrategiesTable)
    .where(and(...filterClauses));

  const grouped = new Map<string, Map<string, number[]>>();
  for (const row of rows) {
    const residual = coeffs
      ? computeResidualQuality(
          Number(row.qualityScore),
          row.taskDifficultyScore ?? null,
          row.promptQualityScore ?? null,
          coeffs,
        )
      : Number(row.qualityScore);

    if (!grouped.has(row.category)) grouped.set(row.category, new Map());
    const catMap = grouped.get(row.category)!;
    if (!catMap.has(row.strategy)) catMap.set(row.strategy, []);
    catMap.get(row.strategy)!.push(residual);
  }

  const winners: StrategyWinner[] = [];
  const losers: StrategyLoser[] = [];

  for (const [category, strategies] of grouped.entries()) {
    const summary = Array.from(strategies.entries())
      .filter(([, scores]) => scores.length >= 2)
      .map(([strategy, scores]) => ({
        strategy,
        avgScore: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const best = summary[0];
    const worst = summary[summary.length - 1];

    if (best && best.avgScore > 0.6) {
      winners.push({
        taskCategory: category,
        bestStrategy: best.strategy as CommunicationStrategy,
        avgScore: best.avgScore,
        runCount: best.count,
      });
    }

    if (worst && worst.avgScore < 0.4 && summary.length > 1) {
      losers.push({
        taskCategory: category,
        worstStrategy: worst.strategy as CommunicationStrategy,
        avgScore: worst.avgScore,
        runCount: worst.count,
      });
    }
  }

  return { winners, losers };
}

function getActiveModelVersion(): string {
  return process.env.LLM_MODEL_VERSION ?? "gpt-4o-mini";
}

async function computeAvgQuality(since: Date, until: Date, clientId?: number): Promise<number | null> {
  try {
    const filterClauses = [
      gte(conductorStrategiesTable.createdAt, since),
      lt(conductorStrategiesTable.createdAt, until),
      sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
    ];
    if (clientId != null) {
      filterClauses.push(eq(conductorStrategiesTable.clientId, clientId));
    }

    const [row] = await db
      .select({ avg: sql<number>`avg(${conductorStrategiesTable.qualityScore})`, count: sql<number>`count(*)` })
      .from(conductorStrategiesTable)
      .where(and(...filterClauses));

    if (Number(row?.count ?? 0) < 3) return null;
    return Number(row?.avg ?? null) || null;
  } catch {
    return null;
  }
}

async function takeWeightSnapshot(
  clientId: number | undefined,
  avgQuality: number | null,
  snapshotType: "pre_cycle" | "rollback",
): Promise<number | undefined> {
  try {
    const filterClauses = clientId != null
      ? [eq(coordinatorWeightsTable.clientId, clientId)]
      : [];

    const weights = await db
      .select()
      .from(coordinatorWeightsTable)
      .where(filterClauses.length > 0 ? and(...filterClauses) : sql`1=1`);

    const conductorStrategyFilter = clientId != null
      ? [eq(conductorStrategiesTable.clientId, clientId), sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`]
      : [sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`];

    const conductorRows = await db
      .select({
        taskCategory: conductorStrategiesTable.taskCategory,
        strategy: conductorStrategiesTable.strategyChosen,
        avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
        runCount: sql<number>`count(*)`,
      })
      .from(conductorStrategiesTable)
      .where(and(...conductorStrategyFilter))
      .groupBy(conductorStrategiesTable.taskCategory, conductorStrategiesTable.strategyChosen);

    const snapshotData = {
      coordinator: weights.map((w) => ({
        id: w.id,
        botId: w.botId,
        taskCategory: w.taskCategory,
        role: w.role,
        weight: w.weight,
        sampleCount: w.sampleCount,
        modelVersion: w.modelVersion,
      })),
      conductorPriors: conductorRows.map((r) => ({
        taskCategory: r.taskCategory,
        strategy: r.strategy,
        avgScore: Number(r.avgScore ?? 0),
        runCount: Number(r.runCount),
      })),
      capturedAt: new Date().toISOString(),
    };

    const [snapshot] = await db
      .insert(weightSnapshotsTable)
      .values({
        clientId: clientId ?? null,
        snapshotType,
        data: snapshotData as unknown as Record<string, unknown>,
        avgQualityAtTime: avgQuality ?? null,
        createdAt: new Date(),
      })
      .returning({ id: weightSnapshotsTable.id });

    return snapshot.id;
  } catch (err) {
    console.error("[IntelligenceCycle] takeWeightSnapshot failed:", err);
    return undefined;
  }
}

async function restoreWeightSnapshot(snapshotId: number): Promise<void> {
  try {
    const [snapshot] = await db
      .select()
      .from(weightSnapshotsTable)
      .where(eq(weightSnapshotsTable.id, snapshotId));

    if (!snapshot) {
      console.error(`[IntelligenceCycle] Snapshot ${snapshotId} not found for rollback`);
      return;
    }

    const data = snapshot.data as {
      coordinator?: Array<{
        id: number; botId: number; taskCategory: string; role: string;
        weight: string; sampleCount: number; modelVersion: string | null;
      }>;
      capturedAt?: string;
    };

    if (!data.coordinator?.length) return;

    for (const w of data.coordinator) {
      const naturalKeyConditions = snapshot.clientId != null
        ? and(
            eq(coordinatorWeightsTable.clientId, snapshot.clientId),
            eq(coordinatorWeightsTable.botId, w.botId),
            eq(coordinatorWeightsTable.taskCategory, w.taskCategory),
            eq(coordinatorWeightsTable.role, w.role),
          )
        : and(
            sql`${coordinatorWeightsTable.clientId} IS NULL`,
            eq(coordinatorWeightsTable.botId, w.botId),
            eq(coordinatorWeightsTable.taskCategory, w.taskCategory),
            eq(coordinatorWeightsTable.role, w.role),
          );
      await db
        .update(coordinatorWeightsTable)
        .set({
          weight: w.weight,
          sampleCount: w.sampleCount,
          modelVersion: w.modelVersion,
          lastUpdated: new Date(),
        })
        .where(naturalKeyConditions);
    }

    if (data.capturedAt && snapshot.clientId) {
      const capturedAt = new Date(data.capturedAt);
      await db
        .delete(conductorStrategiesTable)
        .where(
          and(
            eq(conductorStrategiesTable.clientId, snapshot.clientId),
            sql`${conductorStrategiesTable.createdAt} > ${capturedAt}`,
          ),
        );
      console.log(`[IntelligenceCycle] Reverted conductor strategies to snapshot state at ${data.capturedAt}`);
    }

    console.log(`[IntelligenceCycle] Restored ${data.coordinator.length} coordinator weights from snapshot ${snapshotId}`);
  } catch (err) {
    console.error("[IntelligenceCycle] restoreWeightSnapshot failed:", err);
  }
}

async function applyConductorCorrections(
  winners: StrategyWinner[],
  _losers: StrategyLoser[],
  clientId?: number,
): Promise<number> {
  let corrections = 0;

  for (const winner of winners) {
    const allStrategies = [
      "parallel_synthesis",
      "sequential_debate",
      "hierarchical_delegation",
      "round_robin_review",
    ] as CommunicationStrategy[];

    // Fetch sample count for the winning strategy to compute Bayesian learning rate.
    let winnerSampleCount = 0;
    try {
      const filterClauses = [
        eq(conductorStrategiesTable.strategyChosen, winner.bestStrategy),
        eq(conductorStrategiesTable.taskCategory, winner.taskCategory),
      ];
      if (clientId != null) filterClauses.push(eq(conductorStrategiesTable.clientId, clientId));
      const [winnerRow] = await db
        .select({ sampleCount: conductorStrategiesTable.sampleCount })
        .from(conductorStrategiesTable)
        .where(and(...filterClauses))
        .orderBy(desc(conductorStrategiesTable.createdAt))
        .limit(1);
      winnerSampleCount = winnerRow?.sampleCount ?? 0;
    } catch {
      winnerSampleCount = 0;
    }

    // Bayesian-scaled learning rate: shrinks as we accumulate more evidence.
    const bayesianRate = CORRECTION_RATE / Math.sqrt(winnerSampleCount + 1);

    for (const strategy of allStrategies) {
      const isWinner = strategy === winner.bestStrategy;
      const factor = isWinner ? 1 + bayesianRate : 1 - bayesianRate * 0.5;

      console.log(
        `[IntelligenceCycle] Conductor Bayesian nudge: category=${winner.taskCategory} strategy=${strategy} factor=${factor.toFixed(4)} (n=${winnerSampleCount} lr=${bayesianRate.toFixed(4)})`,
      );
      corrections++;
    }
  }

  return corrections;
}

async function applyCoordinatorCorrections(
  categoryStats: CategoryStats[],
  clientId?: number,
): Promise<number> {
  let corrections = 0;

  if (categoryStats.length < 2) return 0;

  const globalMean = categoryStats.reduce((s, c) => s + c.avgResidualScore, 0) / categoryStats.length;
  const globalStdDev = Math.sqrt(
    categoryStats.reduce((s, c) => s + Math.pow(c.avgResidualScore - globalMean, 2), 0) / categoryStats.length,
  );

  if (globalStdDev < 0.01) return 0;

  const underperformingCategories = categoryStats.filter((c) => {
    const z = (c.avgResidualScore - globalMean) / globalStdDev;
    return z < -Z_SCORE_THRESHOLD && c.count >= 3;
  });

  for (const cat of underperformingCategories) {
    const weightFilter = clientId != null
      ? and(
          eq(coordinatorWeightsTable.taskCategory, cat.category),
          eq(coordinatorWeightsTable.clientId, clientId),
        )
      : eq(coordinatorWeightsTable.taskCategory, cat.category);

    const weights = await db
      .select()
      .from(coordinatorWeightsTable)
      .where(weightFilter);

    for (const w of weights) {
      const currentWeight = parseFloat(w.weight);
      const currentSampleCount = w.sampleCount ?? 0;
      const bayesianRate = CORRECTION_RATE / Math.sqrt(currentSampleCount + 1);
      const newWeight = Math.min(
        WEIGHT_CEILING,
        Math.max(WEIGHT_FLOOR, currentWeight * (1 - bayesianRate)),
      );

      await db
        .update(coordinatorWeightsTable)
        .set({ weight: String(newWeight), lastUpdated: new Date() })
        .where(eq(coordinatorWeightsTable.id, w.id));

      corrections++;
    }

    const z = (cat.avgResidualScore - globalMean) / globalStdDev;
    console.log(
      `[IntelligenceCycle] Coordinator correction (confound-adjusted): category=${cat.category} residualScore=${cat.avgResidualScore.toFixed(3)} (z=${z.toFixed(2)})`,
    );
  }

  return corrections;
}

async function verifyWeightUpdate(
  snapshotId: number,
  cycleRunId: number,
  clientId?: number,
): Promise<{ regressed: boolean; delta: number }> {
  try {
    const [snapshot] = await db
      .select({ avgQualityAtTime: weightSnapshotsTable.avgQualityAtTime, createdAt: weightSnapshotsTable.createdAt })
      .from(weightSnapshotsTable)
      .where(eq(weightSnapshotsTable.id, snapshotId));

    if (!snapshot?.avgQualityAtTime) return { regressed: false, delta: 0 };

    const preAvg = snapshot.avgQualityAtTime;
    const postWindowStart = new Date(snapshot.createdAt);
    const postWindowEnd = new Date(snapshot.createdAt.getTime() + REGRESSION_LOOKBACK_HOURS * 60 * 60 * 1000);

    const postAvg = await computeAvgQuality(postWindowStart, postWindowEnd, clientId);
    if (postAvg === null) return { regressed: false, delta: 0 };

    const delta = postAvg - preAvg;
    const regressed = delta < -REGRESSION_THRESHOLD;

    await db
      .update(intelligenceCycleRunsTable)
      .set({
        postAvgQuality: postAvg,
        cycleStatus: regressed ? "REGRESSED" : "completed",
      })
      .where(eq(intelligenceCycleRunsTable.id, cycleRunId));

    if (regressed) {
      const fp = `intelligence_regression_${clientId ?? "global"}_${cycleRunId}`;
      console.warn(
        `[IntelligenceCycle] REGRESSION DETECTED: pre=${preAvg.toFixed(3)} post=${postAvg.toFixed(3)} delta=${delta.toFixed(3)} threshold=${REGRESSION_THRESHOLD}`,
      );

      const [existing] = await db
        .select({ id: guardianIncidentsTable.id })
        .from(guardianIncidentsTable)
        .where(eq(guardianIncidentsTable.errorFingerprint, fp))
        .limit(1);

      if (!existing) {
        await db.insert(guardianIncidentsTable).values({
          domain: "intelligence",
          title: `Intelligence Cycle Regression (${clientId ? `client ${clientId}` : "global"})`,
          description:
            `Weight update cycle #${cycleRunId} caused quality regression. ` +
            `Pre-cycle avg: ${preAvg.toFixed(3)}, post-48h avg: ${postAvg.toFixed(3)}, delta: ${delta.toFixed(3)}. ` +
            `Snapshot #${snapshotId} has been used to auto-rollback coordinator weights.`,
          severity: 2,
          blastRadius: clientId ? 1 : 5,
          recurrenceRate: 0,
          status: "open",
          affectedComponent: "galaxy-coordinator",
          errorFingerprint: fp,
          sourcePayload: { cycleRunId, snapshotId, clientId, preAvg, postAvg, delta } as unknown as Record<string, unknown>,
        }).catch((err) => console.error("[IntelligenceCycle] Guardian incident creation failed:", err));
      }
    }

    return { regressed, delta };
  } catch (err) {
    console.error("[IntelligenceCycle] verifyWeightUpdate failed:", err);
    return { regressed: false, delta: 0 };
  }
}

export async function runPendingRegressionChecks(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - REGRESSION_LOOKBACK_HOURS * 60 * 60 * 1000);

    const pending = await db
      .select()
      .from(intelligenceCycleRunsTable)
      .where(
        and(
          eq(intelligenceCycleRunsTable.cycleStatus, "pending_verify"),
          lt(intelligenceCycleRunsTable.ranAt, cutoff),
        ),
      )
      .limit(20);

    for (const run of pending) {
      if (!run.snapshotId) {
        await db
          .update(intelligenceCycleRunsTable)
          .set({ cycleStatus: "completed" })
          .where(eq(intelligenceCycleRunsTable.id, run.id));
        continue;
      }

      const { regressed, delta } = await verifyWeightUpdate(
        run.snapshotId,
        run.id,
        run.clientId ?? undefined,
      );

      if (regressed && run.snapshotId) {
        console.warn(`[IntelligenceCycle] Deferred rollback: cycleRun=${run.id} delta=${delta.toFixed(3)}`);
        await restoreWeightSnapshot(run.snapshotId);
        await db
          .update(intelligenceCycleRunsTable)
          .set({ cycleStatus: "REGRESSED" })
          .where(eq(intelligenceCycleRunsTable.id, run.id));
      }
    }

    if (pending.length > 0) {
      console.log(`[IntelligenceCycle] Processed ${pending.length} pending regression checks`);
    }
  } catch (err) {
    console.error("[IntelligenceCycle] runPendingRegressionChecks failed:", err);
  }
}

export async function runIntelligenceCycle(
  clientId?: number,
  days = DEFAULT_DAYS,
  triggeredBy: "scheduled" | "manual" = "scheduled",
): Promise<IntelligenceCycleResult> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const ranAt = new Date();

  console.log(
    `[IntelligenceCycle] Starting cycle — clientId=${clientId ?? "global"} days=${days} triggeredBy=${triggeredBy}`,
  );

  let coordinatorCorrections = 0;
  let conductorCorrections = 0;
  let winners: StrategyWinner[] = [];
  let losers: StrategyLoser[] = [];
  let cycleStatus = "pending_verify";
  let snapshotId: number | undefined;

  try {
    const activeModelVersion = await getActiveModelVersion();
    console.log(`[IntelligenceCycle] Active model version: ${activeModelVersion ?? "unknown"}`);

    if (activeModelVersion) {
      let rebasedCount = 0;
      for (const category of TASK_CATEGORIES) {
        const changed = await detectModelVersionChange(category, activeModelVersion, clientId).catch(() => false);
        if (changed) {
          const [latestRow] = await db
            .select({ modelVersion: coordinatorWeightsTable.modelVersion })
            .from(coordinatorWeightsTable)
            .where(
              and(
                eq(coordinatorWeightsTable.taskCategory, category),
                ...(clientId != null ? [eq(coordinatorWeightsTable.clientId, clientId)] : []),
              ),
            )
            .limit(1);
          const oldVersion = latestRow?.modelVersion ?? "unknown";
          await archiveAndRebaseWeights(category, oldVersion, activeModelVersion, clientId);
          rebasedCount++;
        }
      }
      if (rebasedCount > 0) {
        console.log(`[IntelligenceCycle] Model version change detected — rebased ${rebasedCount} categories to ${activeModelVersion}`);
      }
    }

    const preAvgQuality = await computeAvgQuality(
      new Date(ranAt.getTime() - REGRESSION_LOOKBACK_HOURS * 60 * 60 * 1000),
      ranAt,
      clientId,
    );

    snapshotId = await takeWeightSnapshot(clientId, preAvgQuality, "pre_cycle");
    console.log(`[IntelligenceCycle] Pre-cycle snapshot: id=${snapshotId}, avgQuality=${preAvgQuality?.toFixed(3) ?? "n/a"}`);

    const olsSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const coeffs = await getConfoundCoefficients(olsSince, clientId);
    console.log(
      `[IntelligenceCycle] OLS coefficients (30-day window): betaDifficulty=${coeffs.betaDifficulty.toFixed(3)} betaPrompt=${coeffs.betaPrompt.toFixed(3)} intercept=${coeffs.intercept.toFixed(3)}`,
    );

    const activeModelTier = activeModelVersion ? deriveModelTier(activeModelVersion) : undefined;
    const categoryStats = await computeCategoryZScores(since, clientId, activeModelVersion, coeffs, activeModelTier);
    const strategyResults = await findStrategyWinners(since, clientId, activeModelVersion, coeffs, activeModelTier);
    winners = strategyResults.winners;
    losers = strategyResults.losers;

    coordinatorCorrections = await applyCoordinatorCorrections(categoryStats, clientId);
    conductorCorrections = await applyConductorCorrections(winners, losers, clientId);

    const summary = buildSummary(coordinatorCorrections, conductorCorrections, winners, losers, days);

    await db.insert(intelligenceCycleRunsTable).values({
      clientId: clientId ?? null,
      ranAt,
      daysAnalyzed: days,
      coordinatorCorrections,
      conductorCorrections,
      winnerCategories: winners as unknown as Record<string, unknown>[],
      loserCategories: losers as unknown as Record<string, unknown>[],
      summary,
      triggeredBy,
      cycleStatus,
      preAvgQuality: preAvgQuality ?? null,
      snapshotId: snapshotId ?? null,
    });

    console.log(
      `[IntelligenceCycle] Cycle complete — coordinatorCorrections=${coordinatorCorrections} conductorCorrections=${conductorCorrections} ` +
      `winners=${winners.length} losers=${losers.length} snapshotId=${snapshotId} — regression check deferred 48h`,
    );

    return {
      clientId,
      ranAt,
      daysAnalyzed: days,
      coordinatorCorrections,
      conductorCorrections,
      winnerCategories: winners,
      loserCategories: losers,
      summary,
      cycleStatus,
      snapshotId,
    };
  } catch (err) {
    console.error("[IntelligenceCycle] Cycle error:", err);
    const summary = `Intelligence cycle failed: ${err instanceof Error ? err.message : "unknown error"}`;
    return {
      clientId,
      ranAt,
      daysAnalyzed: days,
      coordinatorCorrections,
      conductorCorrections,
      winnerCategories: winners,
      loserCategories: losers,
      summary,
      cycleStatus: "failed",
      snapshotId,
    };
  }
}

function buildSummary(
  coordinatorCorrections: number,
  conductorCorrections: number,
  winners: StrategyWinner[],
  losers: StrategyLoser[],
  days: number,
): string {
  const parts: string[] = [`Analyzed ${days} days of orchestration data (confound-adjusted residual quality scores).`];

  if (winners.length > 0) {
    const topWinner = winners.sort((a, b) => b.avgScore - a.avgScore)[0];
    parts.push(
      `Best strategy: "${topWinner.bestStrategy}" for ${topWinner.taskCategory} tasks (residual score ${(topWinner.avgScore * 100).toFixed(0)}%).`,
    );
  }

  if (coordinatorCorrections > 0) {
    parts.push(`Applied ${coordinatorCorrections} Bayesian coordinator weight corrections.`);
  }

  if (conductorCorrections > 0) {
    parts.push(`Nudged ${conductorCorrections} conductor strategy priors.`);
  }

  if (losers.length > 0) {
    parts.push(`Identified ${losers.length} underperforming strategy-category pair(s) for deprioritization.`);
  }

  if (coordinatorCorrections === 0 && conductorCorrections === 0) {
    parts.push("Orchestration performance is within expected range — no corrections needed.");
  }

  return parts.join(" ");
}
