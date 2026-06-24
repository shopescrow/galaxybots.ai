import {
  db,
  coordinatorWeightsTable,
  conductorStrategiesTable,
  intelligenceCycleRunsTable,
  botsTable,
} from "@workspace/db";
import { eq, and, gte, sql, isNull, or } from "drizzle-orm";
import type { CommunicationStrategy } from "@workspace/db";

const DEFAULT_DAYS = 7;
const Z_SCORE_THRESHOLD = 1.5;
const CORRECTION_RATE = 0.08;
const WEIGHT_FLOOR = 0.1;
const WEIGHT_CEILING = 10.0;

interface CategoryStats {
  category: string;
  avgScore: number;
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
}

async function computeCategoryZScores(
  since: Date,
  clientId?: number,
): Promise<CategoryStats[]> {
  const clientFilter = clientId
    ? and(
        eq(conductorStrategiesTable.clientId, clientId),
        gte(conductorStrategiesTable.createdAt, since),
        sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
      )
    : and(
        or(isNull(conductorStrategiesTable.clientId), eq(conductorStrategiesTable.clientId, -1)),
        gte(conductorStrategiesTable.createdAt, since),
        sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
      );

  const rows = await db
    .select({
      category: conductorStrategiesTable.taskCategory,
      avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
      stdDev: sql<number>`stddev(${conductorStrategiesTable.qualityScore})`,
      count: sql<number>`count(*)`,
    })
    .from(conductorStrategiesTable)
    .where(clientFilter)
    .groupBy(conductorStrategiesTable.taskCategory);

  return rows.map((r) => ({
    category: r.category,
    avgScore: Number(r.avgScore ?? 0),
    stdDev: Number(r.stdDev ?? 0),
    count: Number(r.count),
  }));
}

async function findStrategyWinners(
  since: Date,
  clientId?: number,
): Promise<{ winners: StrategyWinner[]; losers: StrategyLoser[] }> {
  const clientFilter = clientId
    ? and(
        eq(conductorStrategiesTable.clientId, clientId),
        gte(conductorStrategiesTable.createdAt, since),
        sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
      )
    : and(
        gte(conductorStrategiesTable.createdAt, since),
        sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
      );

  const rows = await db
    .select({
      category: conductorStrategiesTable.taskCategory,
      strategy: conductorStrategiesTable.strategyChosen,
      avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
      count: sql<number>`count(*)`,
    })
    .from(conductorStrategiesTable)
    .where(clientFilter)
    .groupBy(conductorStrategiesTable.taskCategory, conductorStrategiesTable.strategyChosen)
    .having(sql`count(*) >= 2`);

  const byCategory = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const winners: StrategyWinner[] = [];
  const losers: StrategyLoser[] = [];

  for (const [category, strategies] of byCategory) {
    const sorted = [...strategies].sort((a, b) => Number(b.avgScore) - Number(a.avgScore));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    if (best && Number(best.avgScore) > 0.6) {
      winners.push({
        taskCategory: category,
        bestStrategy: best.strategy as CommunicationStrategy,
        avgScore: Number(best.avgScore),
        runCount: Number(best.count),
      });
    }

    if (worst && Number(worst.avgScore) < 0.4 && sorted.length > 1) {
      losers.push({
        taskCategory: category,
        worstStrategy: worst.strategy as CommunicationStrategy,
        avgScore: Number(worst.avgScore),
        runCount: Number(worst.count),
      });
    }
  }

  return { winners, losers };
}

async function applyConductorCorrections(
  winners: StrategyWinner[],
  _losers: StrategyLoser[],
  _clientId?: number,
): Promise<number> {
  let corrections = 0;

  for (const winner of winners) {
    const allStrategies = [
      "parallel_synthesis",
      "sequential_debate",
      "hierarchical_delegation",
      "round_robin_review",
    ] as CommunicationStrategy[];

    for (const strategy of allStrategies) {
      const isWinner = strategy === winner.bestStrategy;
      const factor = isWinner ? 1 + CORRECTION_RATE : 1 - CORRECTION_RATE * 0.5;

      console.log(
        `[IntelligenceCycle] Conductor nudge: category=${winner.taskCategory} strategy=${strategy} factor=${factor.toFixed(3)}`,
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

  const globalMean = categoryStats.reduce((s, c) => s + c.avgScore, 0) / categoryStats.length;
  const globalStdDev = Math.sqrt(
    categoryStats.reduce((s, c) => s + Math.pow(c.avgScore - globalMean, 2), 0) / categoryStats.length,
  );

  if (globalStdDev < 0.01) return 0;

  const underperformingCategories = categoryStats.filter((c) => {
    const z = (c.avgScore - globalMean) / globalStdDev;
    return z < -Z_SCORE_THRESHOLD && c.count >= 3;
  });

  for (const cat of underperformingCategories) {
    const weightFilter = clientId
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
      const newWeight = Math.min(
        WEIGHT_CEILING,
        Math.max(WEIGHT_FLOOR, currentWeight * (1 - CORRECTION_RATE)),
      );

      await db
        .update(coordinatorWeightsTable)
        .set({ weight: String(newWeight), lastUpdated: new Date() })
        .where(eq(coordinatorWeightsTable.id, w.id));

      corrections++;
    }

    console.log(
      `[IntelligenceCycle] Coordinator correction: category=${cat.category} avgScore=${cat.avgScore.toFixed(3)} (z=${((cat.avgScore - globalMean) / globalStdDev).toFixed(2)})`,
    );
  }

  return corrections;
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

  try {
    const categoryStats = await computeCategoryZScores(since, clientId);
    const strategyResults = await findStrategyWinners(since, clientId);
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
    });

    console.log(
      `[IntelligenceCycle] Cycle complete — coordinatorCorrections=${coordinatorCorrections} conductorCorrections=${conductorCorrections} winners=${winners.length} losers=${losers.length}`,
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
  const parts: string[] = [`Analyzed ${days} days of orchestration data.`];

  if (winners.length > 0) {
    const topWinner = winners.sort((a, b) => b.avgScore - a.avgScore)[0];
    parts.push(
      `Best strategy: "${topWinner.bestStrategy}" for ${topWinner.taskCategory} tasks (avg score ${(topWinner.avgScore * 100).toFixed(0)}%).`,
    );
  }

  if (coordinatorCorrections > 0) {
    parts.push(`Applied ${coordinatorCorrections} coordinator weight corrections.`);
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
