import { db, subscriptionPlansTable, accountSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ModelTier } from "./model-fallback.js";
import { ModelCapability, resolveCapability } from "./model-router.js";

/**
 * Margin-aware routing + real-time margin guard.
 *
 * Two responsibilities:
 *  1. Routing  — pick the cheapest model tier that still meets a task's quality
 *     bar, so we never burn frontier dollars on work an efficient model handles.
 *  2. Guard    — at run time, compare projected cost against the revenue this run
 *     actually earns (credits consumed × per-credit price). If projected cost
 *     eats past the margin floor, downgrade; if it exceeds revenue entirely,
 *     pause.
 */

/**
 * Minimum quality score (0..1) below which a tier is NOT acceptable for a task.
 * Higher-stakes categories demand the frontier tier; routine work can ride the
 * efficient tier. Anything not listed falls back to EFFICIENT.
 */
const CATEGORY_QUALITY_BAR: Record<string, ModelTier> = {
  legal: ModelTier.FRONTIER,
  financial: ModelTier.FRONTIER,
  incident_response: ModelTier.FRONTIER,
  analysis: ModelTier.FRONTIER,
  technical: ModelTier.FRONTIER,
  research: ModelTier.EFFICIENT,
  review: ModelTier.EFFICIENT,
  creative: ModelTier.EFFICIENT,
  execution: ModelTier.EFFICIENT,
};

/** Fraction of run revenue we insist on keeping as margin (0.25 = 25%). */
export const DEFAULT_MARGIN_FLOOR = 0.25;

/**
 * Pick the cheapest tier that meets the quality bar for a task category.
 * Returns FRONTIER only for high-stakes categories; otherwise EFFICIENT.
 */
export function selectTierForCategory(taskCategory: string): ModelTier {
  return CATEGORY_QUALITY_BAR[taskCategory?.toLowerCase()] ?? ModelTier.EFFICIENT;
}

/** Map a tier to the representative model the strategies should call. */
export function modelForTier(tier: ModelTier): string {
  switch (tier) {
    case ModelTier.FRONTIER:
      return resolveCapability(ModelCapability.REASONING_PREMIUM);
    case ModelTier.EFFICIENT:
      return resolveCapability(ModelCapability.REASONING_EFFICIENT);
    case ModelTier.LOCAL:
      return resolveCapability(ModelCapability.REASONING_EFFICIENT);
    default:
      return resolveCapability(ModelCapability.REASONING_EFFICIENT);
  }
}

/**
 * Compute the USD revenue a run earns: credits consumed × the plan's
 * per-credit overage rate. Falls back to a conservative default when the plan
 * or rate is unavailable so the guard never divides by zero.
 */
export async function getRunRevenueUsd(clientId: number, credits: number): Promise<number> {
  const DEFAULT_RATE_PER_CREDIT = 0.012;
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

    const rate = row?.rate ? parseFloat(row.rate) : DEFAULT_RATE_PER_CREDIT;
    return credits * (rate > 0 ? rate : DEFAULT_RATE_PER_CREDIT);
  } catch {
    return credits * DEFAULT_RATE_PER_CREDIT;
  }
}

export type MarginAction = "proceed" | "downgrade" | "pause";

export interface MarginDecision {
  action: MarginAction;
  projectedCostUsd: number;
  runRevenueUsd: number;
  projectedMarginUsd: number;
  marginPct: number;
  reason: string | null;
}

/**
 * Evaluate whether a run's projected cost preserves enough margin.
 *  - cost ≥ revenue            → pause (the run loses money outright)
 *  - margin < floor of revenue → downgrade (still profitable but thin)
 *  - otherwise                 → proceed
 */
export function evaluateMargin(
  projectedCostUsd: number,
  runRevenueUsd: number,
  marginFloor: number = DEFAULT_MARGIN_FLOOR,
): MarginDecision {
  const projectedMarginUsd = runRevenueUsd - projectedCostUsd;
  const marginPct = runRevenueUsd > 0 ? projectedMarginUsd / runRevenueUsd : 0;

  let action: MarginAction = "proceed";
  let reason: string | null = null;

  if (runRevenueUsd <= 0 || projectedCostUsd >= runRevenueUsd) {
    action = "pause";
    reason = `Projected cost $${projectedCostUsd.toFixed(4)} meets or exceeds run revenue $${runRevenueUsd.toFixed(4)}`;
  } else if (marginPct < marginFloor) {
    action = "downgrade";
    reason = `Projected margin ${(marginPct * 100).toFixed(1)}% below floor ${(marginFloor * 100).toFixed(0)}% (cost $${projectedCostUsd.toFixed(4)} vs revenue $${runRevenueUsd.toFixed(4)})`;
  }

  return { action, projectedCostUsd, runRevenueUsd, projectedMarginUsd, marginPct, reason };
}
