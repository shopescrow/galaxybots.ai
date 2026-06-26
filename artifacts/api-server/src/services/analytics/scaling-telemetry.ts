import {
  db,
  scalingTelemetryTable,
  llmUsageLogTable,
  accountSubscriptionsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { and, eq, gte, sql, desc } from "drizzle-orm";

/**
 * Scaling & profitability telemetry pipeline.
 *
 * Task #218 only OBSERVES and TUNES the scaling work (aggregation, adaptive
 * routing, caching, retrieval) built by other tasks. This module records the
 * signals that are actually available today — token counts, projected model
 * cost, credit revenue, conductor quality (used as a fidelity proxy) — and
 * stores NULL for any metric whose source mechanism is not yet emitting a
 * signal (cache/retrieval hit-rates, aggregation depth, tokens saved). It never
 * fabricates a value.
 */

// Mirrors middleware/credit-meter.ts CREDITS_PER_CALL — the per-call credit cost
// charged to a tenant. Kept local to avoid a middleware→service import cycle.
const CREDITS_PER_CALL: Record<string, number> = {
  "gpt-4o": 10,
  "gpt-5-mini": 3,
  "gpt-5.2": 15,
  default: 5,
};

// Fallback list-price for one credit when a tenant has no active plan row.
const DEFAULT_OVERAGE_RATE_PER_CREDIT = 0.01;

// Regression alert thresholds.
export const MARGIN_ALERT_THRESHOLD_USD = 0; // any run that loses money
export const FIDELITY_ALERT_THRESHOLD = 0.6; // quality/fidelity floor

function estimateCreditsPerCall(model?: string | null): number {
  if (!model) return CREDITS_PER_CALL.default;
  return CREDITS_PER_CALL[model] ?? CREDITS_PER_CALL.default;
}

async function getOverageRatePerCredit(clientId?: number | null): Promise<number> {
  if (!clientId) return DEFAULT_OVERAGE_RATE_PER_CREDIT;
  try {
    const [row] = await db
      .select({ rate: subscriptionPlansTable.overageRatePerCredit })
      .from(accountSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(
        and(
          eq(accountSubscriptionsTable.clientId, clientId),
          eq(accountSubscriptionsTable.status, "active"),
        ),
      )
      .limit(1);
    const rate = row?.rate != null ? Number(row.rate) : NaN;
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_OVERAGE_RATE_PER_CREDIT;
  } catch {
    return DEFAULT_OVERAGE_RATE_PER_CREDIT;
  }
}

export interface ScalingTelemetryInput {
  clientId?: number | null;
  sessionId?: string | null;
  conductorStrategyId?: number | null;
  taskCategory: string;
  strategy?: string | null;
  fleetSize: number;
  modelVersion?: string | null;
  modelTier?: string | null;
  /** Conductor quality score (0..1) used as a fidelity-vs-baseline proxy. */
  fidelityScore?: number | null;
  /** Signals emitted by the scaling mechanisms (other tasks). NULL when absent. */
  tokensSaved?: number | null;
  aggregationDepth?: number | null;
  clusterSizes?: number[] | null;
  cacheHitRate?: number | null;
  retrievalHitRate?: number | null;
  /** Where to attribute actual model cost/tokens from llm_usage_log. */
  costLookup?: {
    conversationId?: number | null;
    sessionDbId?: number | null;
    since?: Date | null;
  };
}

async function resolveCost(lookup?: ScalingTelemetryInput["costLookup"]): Promise<{
  promptTokens: number;
  completionTokens: number;
  projectedCostUsd: number;
}> {
  const empty = { promptTokens: 0, completionTokens: 0, projectedCostUsd: 0 };
  if (!lookup || (lookup.conversationId == null && lookup.sessionDbId == null)) return empty;
  try {
    const conds = [];
    if (lookup.conversationId != null) {
      conds.push(eq(llmUsageLogTable.conversationId, lookup.conversationId));
    } else if (lookup.sessionDbId != null) {
      conds.push(eq(llmUsageLogTable.sessionId, lookup.sessionDbId));
    }
    if (lookup.since) conds.push(gte(llmUsageLogTable.calledAt, lookup.since));

    const [row] = await db
      .select({
        promptTokens: sql<number>`COALESCE(SUM(${llmUsageLogTable.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${llmUsageLogTable.completionTokens}), 0)`,
        cost: sql<number>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}), 0)`,
      })
      .from(llmUsageLogTable)
      .where(and(...conds));

    return {
      promptTokens: Number(row?.promptTokens ?? 0),
      completionTokens: Number(row?.completionTokens ?? 0),
      projectedCostUsd: Number(row?.cost ?? 0),
    };
  } catch {
    return empty;
  }
}

/**
 * Record one run's scaling/profitability telemetry. Best-effort: never throws.
 * Returns the inserted row id, or -1 on failure.
 */
export async function recordScalingTelemetry(input: ScalingTelemetryInput): Promise<number> {
  try {
    const { promptTokens, completionTokens, projectedCostUsd } = await resolveCost(input.costLookup);

    const overageRate = await getOverageRatePerCredit(input.clientId);
    // List-price revenue attribution: one model call per fleet member at the
    // model's per-call credit cost, valued at the tenant's overage rate.
    const runCredits = estimateCreditsPerCall(input.modelVersion) * Math.max(1, input.fleetSize);
    const creditRevenueUsd = runCredits * overageRate;
    const marginUsd = creditRevenueUsd - projectedCostUsd;

    const [row] = await db
      .insert(scalingTelemetryTable)
      .values({
        clientId: input.clientId ?? null,
        sessionId: input.sessionId ?? null,
        conductorStrategyId: input.conductorStrategyId ?? null,
        taskCategory: input.taskCategory,
        strategy: input.strategy ?? null,
        fleetSize: Math.max(1, input.fleetSize),
        modelTier: input.modelTier ?? null,
        promptTokens,
        completionTokens,
        tokensSaved: input.tokensSaved ?? 0,
        projectedCostUsd: projectedCostUsd.toFixed(6),
        creditRevenueUsd: creditRevenueUsd.toFixed(6),
        marginUsd: marginUsd.toFixed(6),
        aggregationDepth: input.aggregationDepth ?? 0,
        clusterSizes: input.clusterSizes ?? [],
        cacheHitRate: input.cacheHitRate ?? null,
        retrievalHitRate: input.retrievalHitRate ?? null,
        fidelityScore: input.fidelityScore ?? null,
      })
      .returning({ id: scalingTelemetryTable.id });

    return row?.id ?? -1;
  } catch (err) {
    console.error("[ScalingTelemetry] recordScalingTelemetry failed:", err);
    return -1;
  }
}

export interface ScalingMarginByCategory {
  taskCategory: string;
  fleetSize: number;
  runs: number;
  avgMarginUsd: number;
  totalMarginUsd: number;
  avgCostUsd: number;
  avgRevenueUsd: number;
  avgFidelity: number | null;
  totalTokensSaved: number;
  avgCacheHitRate: number | null;
  avgRetrievalHitRate: number | null;
}

export interface ScalingAlert {
  type: "margin_regression" | "fidelity_regression";
  taskCategory: string;
  fleetSize: number;
  value: number;
  threshold: number;
  message: string;
}

export interface ScalingTelemetryReport {
  windowDays: number;
  totals: {
    runs: number;
    totalMarginUsd: number;
    avgMarginUsd: number;
    totalCostUsd: number;
    totalRevenueUsd: number;
    avgFidelity: number | null;
    totalTokensSaved: number;
    marginPositiveRate: number;
  };
  byCategory: ScalingMarginByCategory[];
  marginTrend: { date: string; avgMarginUsd: number; runs: number; avgFidelity: number | null }[];
  recentRuns: {
    id: number;
    createdAt: string;
    taskCategory: string;
    strategy: string | null;
    fleetSize: number;
    modelTier: string | null;
    marginUsd: number;
    projectedCostUsd: number;
    creditRevenueUsd: number;
    fidelityScore: number | null;
    tokensSaved: number;
  }[];
  alerts: ScalingAlert[];
}

/**
 * Aggregate scaling telemetry for the console dashboard, with margin/fidelity
 * regression alerts. Scoped to one tenant when clientId is provided, otherwise
 * platform-wide.
 */
export async function getScalingTelemetry(
  clientId?: number | null,
  windowDays = 30,
): Promise<ScalingTelemetryReport> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const scopeConds = [gte(scalingTelemetryTable.createdAt, since)];
  if (clientId != null) scopeConds.push(eq(scalingTelemetryTable.clientId, clientId));
  const where = and(...scopeConds);

  const [totalsRow] = await db
    .select({
      runs: sql<number>`count(*)`,
      totalMargin: sql<number>`COALESCE(SUM(${scalingTelemetryTable.marginUsd}), 0)`,
      avgMargin: sql<number>`COALESCE(AVG(${scalingTelemetryTable.marginUsd}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${scalingTelemetryTable.projectedCostUsd}), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${scalingTelemetryTable.creditRevenueUsd}), 0)`,
      avgFidelity: sql<number | null>`AVG(${scalingTelemetryTable.fidelityScore})`,
      tokensSaved: sql<number>`COALESCE(SUM(${scalingTelemetryTable.tokensSaved}), 0)`,
      marginPositive: sql<number>`COALESCE(SUM(CASE WHEN ${scalingTelemetryTable.marginUsd} > 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(scalingTelemetryTable)
    .where(where);

  const categoryRows = await db
    .select({
      taskCategory: scalingTelemetryTable.taskCategory,
      fleetSize: scalingTelemetryTable.fleetSize,
      runs: sql<number>`count(*)`,
      avgMargin: sql<number>`COALESCE(AVG(${scalingTelemetryTable.marginUsd}), 0)`,
      totalMargin: sql<number>`COALESCE(SUM(${scalingTelemetryTable.marginUsd}), 0)`,
      avgCost: sql<number>`COALESCE(AVG(${scalingTelemetryTable.projectedCostUsd}), 0)`,
      avgRevenue: sql<number>`COALESCE(AVG(${scalingTelemetryTable.creditRevenueUsd}), 0)`,
      avgFidelity: sql<number | null>`AVG(${scalingTelemetryTable.fidelityScore})`,
      tokensSaved: sql<number>`COALESCE(SUM(${scalingTelemetryTable.tokensSaved}), 0)`,
      avgCache: sql<number | null>`AVG(${scalingTelemetryTable.cacheHitRate})`,
      avgRetrieval: sql<number | null>`AVG(${scalingTelemetryTable.retrievalHitRate})`,
    })
    .from(scalingTelemetryTable)
    .where(where)
    .groupBy(scalingTelemetryTable.taskCategory, scalingTelemetryTable.fleetSize)
    .orderBy(scalingTelemetryTable.taskCategory, scalingTelemetryTable.fleetSize);

  const trendRows = await db
    .select({
      date: sql<string>`TO_CHAR(${scalingTelemetryTable.createdAt}, 'YYYY-MM-DD')`,
      avgMargin: sql<number>`COALESCE(AVG(${scalingTelemetryTable.marginUsd}), 0)`,
      runs: sql<number>`count(*)`,
      avgFidelity: sql<number | null>`AVG(${scalingTelemetryTable.fidelityScore})`,
    })
    .from(scalingTelemetryTable)
    .where(where)
    .groupBy(sql`TO_CHAR(${scalingTelemetryTable.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${scalingTelemetryTable.createdAt}, 'YYYY-MM-DD')`);

  const recent = await db
    .select()
    .from(scalingTelemetryTable)
    .where(where)
    .orderBy(desc(scalingTelemetryTable.createdAt))
    .limit(25);

  const byCategory: ScalingMarginByCategory[] = categoryRows.map((r) => ({
    taskCategory: r.taskCategory,
    fleetSize: Number(r.fleetSize),
    runs: Number(r.runs),
    avgMarginUsd: Number(r.avgMargin),
    totalMarginUsd: Number(r.totalMargin),
    avgCostUsd: Number(r.avgCost),
    avgRevenueUsd: Number(r.avgRevenue),
    avgFidelity: r.avgFidelity == null ? null : Number(r.avgFidelity),
    totalTokensSaved: Number(r.tokensSaved),
    avgCacheHitRate: r.avgCache == null ? null : Number(r.avgCache),
    avgRetrievalHitRate: r.avgRetrieval == null ? null : Number(r.avgRetrieval),
  }));

  // Alerts: flag any (category, fleet-size) bucket with ≥3 runs that is losing
  // money on average, or whose average fidelity has dropped below the floor.
  const alerts: ScalingAlert[] = [];
  for (const c of byCategory) {
    if (c.runs >= 3 && c.avgMarginUsd <= MARGIN_ALERT_THRESHOLD_USD) {
      alerts.push({
        type: "margin_regression",
        taskCategory: c.taskCategory,
        fleetSize: c.fleetSize,
        value: c.avgMarginUsd,
        threshold: MARGIN_ALERT_THRESHOLD_USD,
        message: `${c.taskCategory} @ fleet ${c.fleetSize}: avg margin $${c.avgMarginUsd.toFixed(4)} over ${c.runs} runs is not profitable.`,
      });
    }
    if (c.runs >= 3 && c.avgFidelity != null && c.avgFidelity < FIDELITY_ALERT_THRESHOLD) {
      alerts.push({
        type: "fidelity_regression",
        taskCategory: c.taskCategory,
        fleetSize: c.fleetSize,
        value: c.avgFidelity,
        threshold: FIDELITY_ALERT_THRESHOLD,
        message: `${c.taskCategory} @ fleet ${c.fleetSize}: avg fidelity ${(c.avgFidelity * 100).toFixed(1)}% over ${c.runs} runs is below the ${(FIDELITY_ALERT_THRESHOLD * 100).toFixed(0)}% floor.`,
      });
    }
  }

  const runs = Number(totalsRow?.runs ?? 0);
  const marginPositive = Number(totalsRow?.marginPositive ?? 0);

  return {
    windowDays,
    totals: {
      runs,
      totalMarginUsd: Number(totalsRow?.totalMargin ?? 0),
      avgMarginUsd: Number(totalsRow?.avgMargin ?? 0),
      totalCostUsd: Number(totalsRow?.totalCost ?? 0),
      totalRevenueUsd: Number(totalsRow?.totalRevenue ?? 0),
      avgFidelity: totalsRow?.avgFidelity == null ? null : Number(totalsRow.avgFidelity),
      totalTokensSaved: Number(totalsRow?.tokensSaved ?? 0),
      marginPositiveRate: runs > 0 ? marginPositive / runs : 0,
    },
    byCategory,
    marginTrend: trendRows.map((r) => ({
      date: r.date,
      avgMarginUsd: Number(r.avgMargin),
      runs: Number(r.runs),
      avgFidelity: r.avgFidelity == null ? null : Number(r.avgFidelity),
    })),
    recentRuns: recent.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      taskCategory: r.taskCategory,
      strategy: r.strategy,
      fleetSize: r.fleetSize,
      modelTier: r.modelTier,
      marginUsd: Number(r.marginUsd),
      projectedCostUsd: Number(r.projectedCostUsd),
      creditRevenueUsd: Number(r.creditRevenueUsd),
      fidelityScore: r.fidelityScore == null ? null : Number(r.fidelityScore),
      tokensSaved: r.tokensSaved,
    })),
    alerts,
  };
}

/**
 * Profit-and-quality priors per strategy for a (taskCategory, fleet bucket),
 * consumed by the self-tuning conductor. Returns a normalized margin score in
 * 0..1 per strategy plus the run count, derived purely from recorded outcomes.
 */
export interface StrategyProfitPrior {
  strategy: string;
  avgMarginUsd: number;
  normalizedMargin: number; // 0..1 within the bucket
  runCount: number;
}

export async function getStrategyProfitPriors(
  taskCategory: string,
  fleetSize: number,
  windowDays = 30,
): Promise<StrategyProfitPrior[]> {
  try {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const { lo, hi } = fleetSizeBucketRange(fleetSize);
    const rows = await db
      .select({
        strategy: scalingTelemetryTable.strategy,
        avgMargin: sql<number>`COALESCE(AVG(${scalingTelemetryTable.marginUsd}), 0)`,
        runCount: sql<number>`count(*)`,
      })
      .from(scalingTelemetryTable)
      .where(
        and(
          eq(scalingTelemetryTable.taskCategory, taskCategory),
          gte(scalingTelemetryTable.createdAt, since),
          gte(scalingTelemetryTable.fleetSize, lo),
          sql`${scalingTelemetryTable.fleetSize} <= ${hi}`,
          sql`${scalingTelemetryTable.strategy} IS NOT NULL`,
        ),
      )
      .groupBy(scalingTelemetryTable.strategy);

    const margins = rows.map((r) => Number(r.avgMargin));
    const min = Math.min(...margins, 0);
    const max = Math.max(...margins, 0);
    const span = max - min;

    return rows.map((r) => {
      const avgMargin = Number(r.avgMargin);
      const normalizedMargin = span > 1e-9 ? (avgMargin - min) / span : 0.5;
      return {
        strategy: r.strategy as string,
        avgMarginUsd: avgMargin,
        normalizedMargin,
        runCount: Number(r.runCount),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fleet-size buckets keep self-tuning stable: a 3-agent run and a 9-agent run
 * have very different economics, so we tune them separately.
 */
export function fleetSizeBucket(fleetSize: number): "small" | "medium" | "large" {
  if (fleetSize <= 3) return "small";
  if (fleetSize <= 6) return "medium";
  return "large";
}

function fleetSizeBucketRange(fleetSize: number): { lo: number; hi: number } {
  const bucket = fleetSizeBucket(fleetSize);
  if (bucket === "small") return { lo: 1, hi: 3 };
  if (bucket === "medium") return { lo: 4, hi: 6 };
  return { lo: 7, hi: 1000 };
}
