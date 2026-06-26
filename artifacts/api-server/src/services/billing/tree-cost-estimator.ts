import { ModelTier } from "../ai-safety/model-fallback.js";
import { estimateCost } from "../analytics/llm-usage.js";
import type { CommunicationStrategy } from "@workspace/db";

/**
 * Tree-aware credit & cost estimation for multi-agent coordination runs.
 *
 * The legacy estimator (`credit-meter.estimateCredits`) charged a flat
 * per-model amount regardless of how many internal LLM calls a coordination
 * strategy actually fans out into.  A `parallel_synthesis` run with 5 agents
 * makes 6 frontier calls + distillation + strategy selection — charging it the
 * same as a single call leaks margin on every run.
 *
 * This module projects the full call tree for a strategy + agent count and
 * returns both a USD cost estimate (for margin/budget guards) and a credit
 * estimate (for pre-deduction).  After the run, `run-reconciliation` trues this
 * up against the actual logged usage.
 */

/** Representative model used to price each tier when projecting cost. */
const TIER_PRICING_MODEL: Record<ModelTier, string | null> = {
  [ModelTier.FRONTIER]: "gpt-4o",
  [ModelTier.EFFICIENT]: "gpt-5-mini",
  [ModelTier.LOCAL]: null,
};

/**
 * Credits charged per internal call by tier. Kept in lock-step with
 * `credit-meter.CREDITS_PER_CALL` (gpt-4o=10, gpt-5-mini=3) so the tree
 * estimate and the single-call middleware estimate use the same unit basis.
 */
const TIER_CREDITS_PER_CALL: Record<ModelTier, number> = {
  [ModelTier.FRONTIER]: 10,
  [ModelTier.EFFICIENT]: 3,
  [ModelTier.LOCAL]: 0,
};

/**
 * USD cost basis of one credit. Chosen so that a typical frontier call
 * (~$0.0088 at ~1.5k prompt / ~0.6k completion tokens) maps to ~10 credits,
 * matching `TIER_CREDITS_PER_CALL`. Used to convert reconciled actual USD cost
 * back into integer credits.
 */
export const COST_USD_PER_CREDIT = 0.0009;

/** Default token sizing for a single internal call when no measurement exists. */
const DEFAULT_PROMPT_TOKENS = 1500;
const DEFAULT_COMPLETION_TOKENS = 600;

export interface CallTier {
  tier: ModelTier;
  count: number;
  /** Human-readable label of what these calls are (e.g. "synthesis"). */
  label: string;
}

export interface TreeEstimate {
  strategy: CommunicationStrategy;
  agentCount: number;
  tiers: CallTier[];
  totalCalls: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  estimatedCredits: number;
}

export interface TreeEstimateOptions {
  strategy: CommunicationStrategy;
  agentCount: number;
  avgPromptTokens?: number;
  avgCompletionTokens?: number;
  /**
   * Whether per-agent context distillation summaries are expected. Distillation
   * only fires when context exceeds the per-agent budget, so this is an upper
   * bound; defaults to true to stay margin-safe (over-estimate, then reconcile).
   */
  includeDistillation?: boolean;
}

/**
 * Projects the per-tier call breakdown for a strategy. Mirrors the actual
 * fan-out shape implemented in `conductor/strategies/index.ts`.
 */
function planCallTree(
  strategy: CommunicationStrategy,
  agentCount: number,
  includeDistillation: boolean,
): CallTier[] {
  const n = Math.max(agentCount, 1);
  const tiers: CallTier[] = [];

  // Strategy selection (galaxy-conductor) — one efficient/local reasoning call.
  tiers.push({ tier: ModelTier.EFFICIENT, count: 1, label: "strategy_selection" });

  // Per-agent context distillation summaries (upper bound).
  if (includeDistillation) {
    tiers.push({ tier: ModelTier.EFFICIENT, count: n, label: "context_distillation" });
  }

  switch (strategy) {
    case "parallel_synthesis":
      tiers.push({ tier: ModelTier.FRONTIER, count: n, label: "agent_perspectives" });
      tiers.push({ tier: ModelTier.FRONTIER, count: 1, label: "synthesis" });
      break;
    case "sequential_debate":
      tiers.push({ tier: ModelTier.FRONTIER, count: n, label: "debate_turns" });
      break;
    case "hierarchical_delegation":
      if (n < 2) {
        tiers.push({ tier: ModelTier.FRONTIER, count: n, label: "agent_perspectives" });
        tiers.push({ tier: ModelTier.FRONTIER, count: 1, label: "synthesis" });
      } else {
        tiers.push({ tier: ModelTier.EFFICIENT, count: 1, label: "decomposition" });
        tiers.push({ tier: ModelTier.FRONTIER, count: n - 1, label: "specialist_subtasks" });
        tiers.push({ tier: ModelTier.FRONTIER, count: 1, label: "integration" });
      }
      break;
    case "round_robin_review":
      tiers.push({ tier: ModelTier.FRONTIER, count: n, label: "round_robin_turns" });
      break;
    default:
      tiers.push({ tier: ModelTier.FRONTIER, count: n, label: "agent_perspectives" });
      tiers.push({ tier: ModelTier.FRONTIER, count: 1, label: "synthesis" });
  }

  return tiers;
}

export function estimateRunTree(options: TreeEstimateOptions): TreeEstimate {
  const {
    strategy,
    agentCount,
    avgPromptTokens = DEFAULT_PROMPT_TOKENS,
    avgCompletionTokens = DEFAULT_COMPLETION_TOKENS,
    includeDistillation = true,
  } = options;

  const tiers = planCallTree(strategy, agentCount, includeDistillation);

  let totalCalls = 0;
  let estimatedTokens = 0;
  let estimatedCostUsd = 0;
  let estimatedCredits = 0;

  for (const tier of tiers) {
    totalCalls += tier.count;
    const tokensPerCall = avgPromptTokens + avgCompletionTokens;
    estimatedTokens += tier.count * tokensPerCall;

    const pricingModel = TIER_PRICING_MODEL[tier.tier];
    if (pricingModel) {
      estimatedCostUsd += tier.count * estimateCost(pricingModel, avgPromptTokens, avgCompletionTokens);
    }
    estimatedCredits += tier.count * TIER_CREDITS_PER_CALL[tier.tier];
  }

  return {
    strategy,
    agentCount: Math.max(agentCount, 1),
    tiers,
    totalCalls,
    estimatedTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
    estimatedCredits,
  };
}

/** Convert a USD cost figure into integer credits (rounded up, margin-safe). */
export function usdToCredits(costUsd: number): number {
  if (costUsd <= 0) return 0;
  return Math.ceil(costUsd / COST_USD_PER_CREDIT);
}
