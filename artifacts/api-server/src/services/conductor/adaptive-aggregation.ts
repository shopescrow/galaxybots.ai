import { estimateTokens, getMaxAllowedTokens } from "../ai-safety/context-window.js";
import { estimateCost } from "../analytics/llm-usage.js";

/**
 * Adaptive aggregation policy (task #216).
 *
 * When many agent perspectives must be merged into one answer, there are two
 * ways to run the *aggregation* step:
 *
 *  - "flat": a single synthesis LLM call over all perspectives. Cheap when the
 *    combined perspective text is small, but prompt tokens (and latency) grow
 *    linearly with fleet size and eventually overflow the context window.
 *
 *  - "hierarchical": a tree aggregation — perspectives are split into groups,
 *    each group is summarised (these calls run in parallel), then the group
 *    summaries are merged. This adds one LLM call per group plus a merge call,
 *    but each call sees far fewer tokens, so it wins at large fleet sizes.
 *
 * A static "go hierarchical at N agents" threshold leaves money/latency on the
 * table because the crossover depends on how *long* each perspective is and on
 * the relative weight of cost vs latency. This module projects tokens, cost and
 * latency for both paths and picks the cheaper one that still fits the context
 * window (the quality/feasibility bar). When projections are unavailable it
 * falls back to "flat" — the current behaviour.
 */

export type AggregationMode = "flat" | "hierarchical";

export interface AggregationConfig {
  /** Perspectives per group in the hierarchical path. */
  groupSize: number;
  /** Below this many perspectives, always use flat (tree overhead never pays off). */
  minPerspectivesForHierarchical: number;
  /** Expected completion tokens for a final synthesis / merge call. */
  synthesisCompletionTokens: number;
  /** Expected completion tokens for a per-group summary call. */
  groupSummaryCompletionTokens: number;
  /** Latency model: ms per prompt token (prefill) and per completion token (decode). */
  msPerPromptToken: number;
  msPerCompletionToken: number;
  /** Fixed per-call latency overhead (network + queueing), ms. */
  perCallOverheadMs: number;
  /** Relative weighting of cost vs latency when scoring the two paths (must sum-agnostic). */
  costWeight: number;
  latencyWeight: number;
  /** Fixed prompt overhead (instructions) added to every aggregation call, tokens. */
  promptOverheadTokens: number;
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAggregationConfig(): AggregationConfig {
  return {
    groupSize: envNum("ADAPTIVE_AGG_GROUP_SIZE", 4),
    minPerspectivesForHierarchical: envNum("ADAPTIVE_AGG_MIN_PERSPECTIVES", 4),
    synthesisCompletionTokens: envNum("ADAPTIVE_AGG_SYNTHESIS_TOKENS", 900),
    groupSummaryCompletionTokens: envNum("ADAPTIVE_AGG_GROUP_TOKENS", 500),
    msPerPromptToken: envNum("ADAPTIVE_AGG_MS_PER_PROMPT_TOKEN", 0.05),
    msPerCompletionToken: envNum("ADAPTIVE_AGG_MS_PER_COMPLETION_TOKEN", 8),
    perCallOverheadMs: envNum("ADAPTIVE_AGG_PER_CALL_OVERHEAD_MS", 350),
    costWeight: envNum("ADAPTIVE_AGG_COST_WEIGHT", 1),
    latencyWeight: envNum("ADAPTIVE_AGG_LATENCY_WEIGHT", 1),
    promptOverheadTokens: envNum("ADAPTIVE_AGG_PROMPT_OVERHEAD_TOKENS", 250),
  };
}

export interface AggregationProjection {
  mode: AggregationMode;
  llmCalls: number;
  /** Sequential dependency depth — parallelisable calls collapse to one round. */
  sequentialRounds: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  /** True when the path cannot run as-is (e.g. flat prompt exceeds context window). */
  infeasible: boolean;
}

export interface AggregationDecision {
  mode: AggregationMode;
  flat: AggregationProjection;
  hierarchical: AggregationProjection;
  groupSize: number;
  groupCount: number;
  rationale: string;
  /** Cost we avoid by choosing `mode` instead of the rejected path (>= 0). */
  savingsUsd: number;
  /** Latency we avoid by choosing `mode` instead of the rejected path (>= 0). */
  savingsMs: number;
  /** True when projections were unavailable and we fell back to flat. */
  fellBack: boolean;
}

function latencyForCall(promptTokens: number, completionTokens: number, cfg: AggregationConfig): number {
  return cfg.perCallOverheadMs + promptTokens * cfg.msPerPromptToken + completionTokens * cfg.msPerCompletionToken;
}

function projectFlat(perspectiveTokens: number[], model: string, cfg: AggregationConfig): AggregationProjection {
  const promptTokens = perspectiveTokens.reduce((a, b) => a + b, 0) + cfg.promptOverheadTokens;
  const completionTokens = cfg.synthesisCompletionTokens;
  const infeasible = promptTokens + completionTokens > getMaxAllowedTokens(model);
  return {
    mode: "flat",
    llmCalls: 1,
    sequentialRounds: 1,
    promptTokens,
    completionTokens,
    costUsd: estimateCost(model, promptTokens, completionTokens),
    latencyMs: latencyForCall(promptTokens, completionTokens, cfg),
    infeasible,
  };
}

function projectHierarchical(
  perspectiveTokens: number[],
  groupSize: number,
  model: string,
  cfg: AggregationConfig,
): { projection: AggregationProjection; groupCount: number } {
  const groups: number[][] = [];
  for (let i = 0; i < perspectiveTokens.length; i += groupSize) {
    groups.push(perspectiveTokens.slice(i, i + groupSize));
  }
  const groupCount = groups.length;

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  let maxGroupLatency = 0;
  let anyGroupInfeasible = false;

  for (const group of groups) {
    const groupPrompt = group.reduce((a, b) => a + b, 0) + cfg.promptOverheadTokens;
    const groupCompletion = cfg.groupSummaryCompletionTokens;
    totalPromptTokens += groupPrompt;
    totalCompletionTokens += groupCompletion;
    totalCostUsd += estimateCost(model, groupPrompt, groupCompletion);
    maxGroupLatency = Math.max(maxGroupLatency, latencyForCall(groupPrompt, groupCompletion, cfg));
    if (groupPrompt + groupCompletion > getMaxAllowedTokens(model)) anyGroupInfeasible = true;
  }

  // Merge call consumes the group summaries.
  const mergePrompt = groupCount * cfg.groupSummaryCompletionTokens + cfg.promptOverheadTokens;
  const mergeCompletion = cfg.synthesisCompletionTokens;
  totalPromptTokens += mergePrompt;
  totalCompletionTokens += mergeCompletion;
  totalCostUsd += estimateCost(model, mergePrompt, mergeCompletion);
  const mergeLatency = latencyForCall(mergePrompt, mergeCompletion, cfg);
  const mergeInfeasible = mergePrompt + mergeCompletion > getMaxAllowedTokens(model);

  return {
    projection: {
      mode: "hierarchical",
      llmCalls: groupCount + 1,
      sequentialRounds: 2, // groups (parallel) then merge
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      costUsd: totalCostUsd,
      // Group calls run in parallel, so only the slowest group counts, then merge.
      latencyMs: maxGroupLatency + mergeLatency,
      infeasible: anyGroupInfeasible || mergeInfeasible,
    },
    groupCount,
  };
}

function combinedScore(p: AggregationProjection, flat: AggregationProjection, hier: AggregationProjection, cfg: AggregationConfig): number {
  // Normalise cost and latency against the larger of the two paths so the
  // weights are comparable regardless of absolute magnitudes.
  const maxCost = Math.max(flat.costUsd, hier.costUsd) || 1;
  const maxLatency = Math.max(flat.latencyMs, hier.latencyMs) || 1;
  return cfg.costWeight * (p.costUsd / maxCost) + cfg.latencyWeight * (p.latencyMs / maxLatency);
}

/**
 * Decide flat vs hierarchical aggregation for a set of perspectives.
 *
 * @param perspectives  The agent outputs to be aggregated (used for token sizing).
 * @param model         The model that will run the aggregation calls.
 * @param taskCategory  Used only for rationale/telemetry context.
 */
export function decideAggregationMode(
  perspectives: string[],
  model: string,
  taskCategory?: string,
  configOverride?: Partial<AggregationConfig>,
): AggregationDecision {
  const cfg = { ...getAggregationConfig(), ...configOverride };
  const perspectiveTokens = perspectives.map((p) => estimateTokens(p)).filter((t) => t > 0);

  // Projections unavailable (no usable perspective text) → fall back to flat.
  if (perspectiveTokens.length === 0) {
    const empty: AggregationProjection = {
      mode: "flat", llmCalls: 1, sequentialRounds: 1, promptTokens: 0,
      completionTokens: 0, costUsd: 0, latencyMs: 0, infeasible: false,
    };
    return {
      mode: "flat",
      flat: empty,
      hierarchical: { ...empty, mode: "hierarchical" },
      groupSize: cfg.groupSize,
      groupCount: 0,
      rationale: "No projectable perspective tokens — falling back to flat synthesis (current behaviour).",
      savingsUsd: 0,
      savingsMs: 0,
      fellBack: true,
    };
  }

  const flat = projectFlat(perspectiveTokens, model, cfg);
  const { projection: hierarchical, groupCount } = projectHierarchical(perspectiveTokens, cfg.groupSize, model, cfg);

  let mode: AggregationMode;
  let rationale: string;

  if (perspectiveTokens.length < cfg.minPerspectivesForHierarchical && !flat.infeasible) {
    mode = "flat";
    rationale = `Fleet size ${perspectiveTokens.length} below hierarchical floor ${cfg.minPerspectivesForHierarchical}; flat synthesis is cheapest.`;
  } else if (flat.infeasible && !hierarchical.infeasible) {
    mode = "hierarchical";
    rationale = `Flat synthesis prompt (${flat.promptTokens} tok) exceeds the context window; hierarchical aggregation required to meet the quality bar.`;
  } else if (hierarchical.infeasible && !flat.infeasible) {
    mode = "flat";
    rationale = "Hierarchical groups would themselves overflow the context window; flat synthesis selected.";
  } else {
    const flatScore = combinedScore(flat, flat, hierarchical, cfg);
    const hierScore = combinedScore(hierarchical, flat, hierarchical, cfg);
    mode = hierScore < flatScore ? "hierarchical" : "flat";
    rationale =
      `Projected flat=$${flat.costUsd.toFixed(5)}/${Math.round(flat.latencyMs)}ms vs ` +
      `hierarchical=$${hierarchical.costUsd.toFixed(5)}/${Math.round(hierarchical.latencyMs)}ms ` +
      `(${groupCount} groups); chose ${mode} as cheaper weighted path.`;
  }

  const chosen = mode === "flat" ? flat : hierarchical;
  const rejected = mode === "flat" ? hierarchical : flat;

  return {
    mode,
    flat,
    hierarchical,
    groupSize: cfg.groupSize,
    groupCount,
    rationale: taskCategory ? `[${taskCategory}] ${rationale}` : rationale,
    savingsUsd: Math.max(0, rejected.costUsd - chosen.costUsd),
    savingsMs: Math.max(0, rejected.latencyMs - chosen.latencyMs),
    fellBack: false,
  };
}
