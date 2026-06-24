import {
  db,
  coordinatorWeightsTable,
  conductorStrategiesTable,
  sessionOutcomesTable,
  llmUsageLogTable,
  botsTable,
  intelligenceCycleRunsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, isNull, or } from "drizzle-orm";
import type { CommunicationStrategy } from "@workspace/db";

export interface BotRolePairing {
  botId: number;
  botName: string;
  taskCategory: string;
  role: string;
  weight: number;
}

export interface StrategyWinRate {
  taskCategory: string;
  strategy: CommunicationStrategy;
  avgScore: number;
  runCount: number;
  winRate: number;
}

export interface QualityTrendPoint {
  week: string;
  avgScore: number;
  sessionCount: number;
}

export interface IntelligenceReport {
  clientId?: number;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  coordinatorEfficiency: {
    topPairings: BotRolePairing[];
    avgWeightDeviation: number;
    totalWeightedBotRoles: number;
  };
  conductorStrategyWinRates: StrategyWinRate[];
  qualityTrend: QualityTrendPoint[];
  costEfficiency: {
    totalLlmCostUsd: number;
    estimatedNaiveCostUsd: number;
    estimatedSavingsUsd: number;
    savingsPct: number;
  };
  lastCycleRun: {
    ranAt: string | null;
    coordinatorCorrections: number;
    conductorCorrections: number;
    summary: string | null;
  } | null;
  weekOverWeekImprovement: number | null;
}

export async function generateIntelligenceReport(
  clientId: number | undefined,
  dateFrom: Date,
  dateTo: Date,
): Promise<IntelligenceReport> {
  const generatedAt = new Date().toISOString();

  const [topPairings, strategyWinRates, qualityTrend, costEfficiency, lastCycle] =
    await Promise.all([
      fetchTopBotRolePairings(clientId),
      fetchStrategyWinRates(clientId, dateFrom, dateTo),
      fetchQualityTrend(clientId, dateFrom, dateTo),
      fetchCostEfficiency(clientId, dateFrom, dateTo),
      fetchLastCycleRun(clientId),
    ]);

  const weekOverWeekImprovement = computeWeekOverWeekImprovement(qualityTrend);

  const avgWeightDeviation = computeAvgWeightDeviation(topPairings);

  return {
    clientId,
    generatedAt,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    coordinatorEfficiency: {
      topPairings,
      avgWeightDeviation,
      totalWeightedBotRoles: topPairings.length,
    },
    conductorStrategyWinRates: strategyWinRates,
    qualityTrend,
    costEfficiency,
    lastCycleRun: lastCycle,
    weekOverWeekImprovement,
  };
}

async function fetchTopBotRolePairings(clientId?: number): Promise<BotRolePairing[]> {
  try {
    const weightFilter = clientId
      ? eq(coordinatorWeightsTable.clientId, clientId)
      : isNull(coordinatorWeightsTable.clientId);

    const weights = await db
      .select({
        botId: coordinatorWeightsTable.botId,
        taskCategory: coordinatorWeightsTable.taskCategory,
        role: coordinatorWeightsTable.role,
        weight: coordinatorWeightsTable.weight,
        botName: botsTable.name,
      })
      .from(coordinatorWeightsTable)
      .leftJoin(botsTable, eq(botsTable.id, coordinatorWeightsTable.botId))
      .where(weightFilter)
      .orderBy(desc(coordinatorWeightsTable.weight))
      .limit(20);

    return weights.map((w) => ({
      botId: w.botId,
      botName: w.botName ?? `Bot #${w.botId}`,
      taskCategory: w.taskCategory,
      role: w.role,
      weight: parseFloat(w.weight),
    }));
  } catch {
    return [];
  }
}

async function fetchStrategyWinRates(
  clientId: number | undefined,
  dateFrom: Date,
  dateTo: Date,
): Promise<StrategyWinRate[]> {
  try {
    const baseFilter =
      clientId !== undefined
        ? and(
            eq(conductorStrategiesTable.clientId, clientId),
            gte(conductorStrategiesTable.createdAt, dateFrom),
            lte(conductorStrategiesTable.createdAt, dateTo),
            sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
          )
        : and(
            gte(conductorStrategiesTable.createdAt, dateFrom),
            lte(conductorStrategiesTable.createdAt, dateTo),
            sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
          );

    const rows = await db
      .select({
        category: conductorStrategiesTable.taskCategory,
        strategy: conductorStrategiesTable.strategyChosen,
        avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
        count: sql<number>`count(*)`,
        wins: sql<number>`count(*) filter (where ${conductorStrategiesTable.qualityScore} >= 0.7)`,
      })
      .from(conductorStrategiesTable)
      .where(baseFilter)
      .groupBy(conductorStrategiesTable.taskCategory, conductorStrategiesTable.strategyChosen)
      .orderBy(desc(sql`avg(${conductorStrategiesTable.qualityScore})`));

    return rows.map((r) => ({
      taskCategory: r.category,
      strategy: r.strategy as CommunicationStrategy,
      avgScore: Number(r.avgScore ?? 0),
      runCount: Number(r.count),
      winRate: Number(r.count) > 0 ? Number(r.wins) / Number(r.count) : 0,
    }));
  } catch {
    return [];
  }
}

async function fetchQualityTrend(
  clientId: number | undefined,
  dateFrom: Date,
  dateTo: Date,
): Promise<QualityTrendPoint[]> {
  try {
    const baseFilter =
      clientId !== undefined
        ? and(
            eq(conductorStrategiesTable.clientId, clientId),
            gte(conductorStrategiesTable.createdAt, dateFrom),
            lte(conductorStrategiesTable.createdAt, dateTo),
            sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
          )
        : and(
            gte(conductorStrategiesTable.createdAt, dateFrom),
            lte(conductorStrategiesTable.createdAt, dateTo),
            sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
          );

    const rows = await db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${conductorStrategiesTable.createdAt}), 'YYYY-MM-DD')`,
        avgScore: sql<number>`avg(${conductorStrategiesTable.qualityScore})`,
        count: sql<number>`count(*)`,
      })
      .from(conductorStrategiesTable)
      .where(baseFilter)
      .groupBy(sql`date_trunc('week', ${conductorStrategiesTable.createdAt})`)
      .orderBy(sql`date_trunc('week', ${conductorStrategiesTable.createdAt})`);

    return rows.map((r) => ({
      week: r.week,
      avgScore: Number(r.avgScore ?? 0),
      sessionCount: Number(r.count),
    }));
  } catch {
    return [];
  }
}

async function fetchCostEfficiency(
  clientId: number | undefined,
  dateFrom: Date,
  dateTo: Date,
): Promise<IntelligenceReport["costEfficiency"]> {
  try {
    const usageFilter =
      clientId !== undefined
        ? and(
            eq(llmUsageLogTable.clientId, clientId),
            gte(llmUsageLogTable.calledAt, dateFrom),
            lte(llmUsageLogTable.calledAt, dateTo),
          )
        : and(
            gte(llmUsageLogTable.calledAt, dateFrom),
            lte(llmUsageLogTable.calledAt, dateTo),
          );

    const [costRow] = await db
      .select({
        totalCost: sql<number>`sum(cast(${llmUsageLogTable.estimatedCostUsd} as numeric))`,
        totalTokens: sql<number>`sum(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens})`,
      })
      .from(llmUsageLogTable)
      .where(usageFilter);

    const totalLlmCostUsd = Number(costRow?.totalCost ?? 0);
    const totalTokens = Number(costRow?.totalTokens ?? 0);

    const GPT4O_COST_PER_TOKEN = 0.0000125;
    const estimatedNaiveCostUsd = totalTokens * GPT4O_COST_PER_TOKEN;
    const estimatedSavingsUsd = Math.max(0, estimatedNaiveCostUsd - totalLlmCostUsd);
    const savingsPct =
      estimatedNaiveCostUsd > 0 ? (estimatedSavingsUsd / estimatedNaiveCostUsd) * 100 : 0;

    return {
      totalLlmCostUsd: Math.round(totalLlmCostUsd * 10000) / 10000,
      estimatedNaiveCostUsd: Math.round(estimatedNaiveCostUsd * 10000) / 10000,
      estimatedSavingsUsd: Math.round(estimatedSavingsUsd * 10000) / 10000,
      savingsPct: Math.round(savingsPct * 10) / 10,
    };
  } catch {
    return {
      totalLlmCostUsd: 0,
      estimatedNaiveCostUsd: 0,
      estimatedSavingsUsd: 0,
      savingsPct: 0,
    };
  }
}

async function fetchLastCycleRun(clientId?: number): Promise<IntelligenceReport["lastCycleRun"]> {
  try {
    const filter = clientId
      ? eq(intelligenceCycleRunsTable.clientId, clientId)
      : isNull(intelligenceCycleRunsTable.clientId);

    const [run] = await db
      .select()
      .from(intelligenceCycleRunsTable)
      .where(filter)
      .orderBy(desc(intelligenceCycleRunsTable.ranAt))
      .limit(1);

    if (!run) return null;

    return {
      ranAt: run.ranAt.toISOString(),
      coordinatorCorrections: run.coordinatorCorrections,
      conductorCorrections: run.conductorCorrections,
      summary: run.summary,
    };
  } catch {
    return null;
  }
}

function computeWeekOverWeekImprovement(trend: QualityTrendPoint[]): number | null {
  if (trend.length < 2) return null;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  if (!last || !prev || prev.avgScore === 0) return null;
  return Math.round(((last.avgScore - prev.avgScore) / prev.avgScore) * 1000) / 10;
}

function computeAvgWeightDeviation(pairings: BotRolePairing[]): number {
  if (pairings.length === 0) return 0;
  const mean = pairings.reduce((s, p) => s + p.weight, 0) / pairings.length;
  const variance =
    pairings.reduce((s, p) => s + Math.pow(p.weight - mean, 2), 0) / pairings.length;
  return Math.round(Math.sqrt(variance) * 1000) / 1000;
}

export async function getCoordinatorWeightMatrix(clientId: number): Promise<{
  bots: string[];
  categories: string[];
  roles: string[];
  matrix: Record<string, Record<string, Record<string, number>>>;
}> {
  const weightFilter = and(
    eq(coordinatorWeightsTable.clientId, clientId),
  );

  const weights = await db
    .select({
      botId: coordinatorWeightsTable.botId,
      taskCategory: coordinatorWeightsTable.taskCategory,
      role: coordinatorWeightsTable.role,
      weight: coordinatorWeightsTable.weight,
      botName: botsTable.name,
    })
    .from(coordinatorWeightsTable)
    .leftJoin(botsTable, eq(botsTable.id, coordinatorWeightsTable.botId))
    .where(weightFilter);

  const botNames = [...new Set(weights.map((w) => w.botName ?? `Bot #${w.botId}`))];
  const categories = [...new Set(weights.map((w) => w.taskCategory))];
  const roles = [...new Set(weights.map((w) => w.role))];

  const matrix: Record<string, Record<string, Record<string, number>>> = {};
  for (const w of weights) {
    const name = w.botName ?? `Bot #${w.botId}`;
    if (!matrix[name]) matrix[name] = {};
    if (!matrix[name][w.taskCategory]) matrix[name][w.taskCategory] = {};
    matrix[name][w.taskCategory][w.role] = parseFloat(w.weight);
  }

  return { bots: botNames, categories, roles, matrix };
}
