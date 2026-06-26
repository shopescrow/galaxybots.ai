import type { TaskCategory } from "@workspace/db";

/**
 * Configuration for the aggregation fidelity guardrail.
 *
 * These knobs control when the hierarchical aggregator is allowed to collapse a
 * cluster of agent outputs into a summary versus when it must expand the branch
 * losslessly, and when an aggregated run is rejected in favour of the flat
 * baseline. Thresholds are configurable per task category because the cost of
 * losing nuance differs sharply by domain — dropping a dissenting view in a
 * legal or financial analysis is far more damaging than in a casual research
 * summary.
 */
export interface AggregationFidelityConfig {
  /**
   * Pairwise divergence (0..1) above which a cluster is considered to contain
   * genuine disagreement and is expanded losslessly instead of summarized.
   */
  divergenceEscalationThreshold: number;
  /**
   * Minimum fraction of the flat-baseline quality the hierarchical result must
   * retain (0..1). If the hierarchical answer scores below
   * `fidelityFloor * baselineScore`, the run falls back to flat synthesis.
   */
  fidelityFloor: number;
  /**
   * Fraction of aggregated runs (0..1) that are scored against a flat baseline.
   * Scoring costs an extra synthesis + two evaluations, so it is sampled.
   */
  fidelitySampleRate: number;
  /** Target number of members per cluster once clustering kicks in. */
  clusterSize: number;
  /**
   * Minimum number of perspectives required before hierarchical clustering is
   * used at all. Below this, the aggregator stays flat (no collapse, no loss).
   */
  minAgentsForClustering: number;
}

const DEFAULT_CONFIG: AggregationFidelityConfig = {
  divergenceEscalationThreshold: 0.5,
  fidelityFloor: 0.9,
  fidelitySampleRate: 0.25,
  clusterSize: 3,
  minAgentsForClustering: 4,
};

/**
 * Per-category overrides. Higher-stakes categories use a lower escalation
 * threshold (expand sooner), a higher fidelity floor (less tolerance for
 * degradation), and a higher sample rate (score more often).
 */
const PER_CATEGORY: Partial<Record<TaskCategory, Partial<AggregationFidelityConfig>>> = {
  legal: { divergenceEscalationThreshold: 0.35, fidelityFloor: 0.97, fidelitySampleRate: 1.0 },
  financial: { divergenceEscalationThreshold: 0.38, fidelityFloor: 0.95, fidelitySampleRate: 0.75 },
  review: { divergenceEscalationThreshold: 0.4, fidelityFloor: 0.93, fidelitySampleRate: 0.5 },
  analysis: { divergenceEscalationThreshold: 0.45, fidelityFloor: 0.92, fidelitySampleRate: 0.35 },
  research: { divergenceEscalationThreshold: 0.55, fidelityFloor: 0.88, fidelitySampleRate: 0.2 },
  execution: { divergenceEscalationThreshold: 0.5, fidelityFloor: 0.9, fidelitySampleRate: 0.2 },
};

/**
 * Resolve the effective config for a task category, applying per-category
 * overrides and then any explicit caller overrides on top.
 */
export function getAggregationConfig(
  taskCategory?: TaskCategory,
  overrides?: Partial<AggregationFidelityConfig>,
): AggregationFidelityConfig {
  const categoryOverrides = taskCategory ? PER_CATEGORY[taskCategory] ?? {} : {};
  return {
    ...DEFAULT_CONFIG,
    ...categoryOverrides,
    ...(overrides ?? {}),
  };
}
