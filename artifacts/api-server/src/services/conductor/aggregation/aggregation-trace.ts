/**
 * Per-run trace of how the hierarchical aggregator handled a set of agent
 * outputs. Surfaced into the coordinator/audit trace so operators can see, for
 * any run, whether aggregation was used, how deep the tree went, which branches
 * were expanded for disagreement, and the measured fidelity vs the flat
 * baseline.
 */

export interface AggregationClusterTrace {
  clusterId: number;
  /** Indices (into the original perspective array) of this cluster's members. */
  memberIndices: number[];
  size: number;
  /** Mean pairwise divergence among this cluster's members (0..1). */
  divergence: number;
  /**
   * true = branch expanded losslessly (full member outputs kept) because
   * divergence exceeded the threshold; false = branch summarized.
   */
  escalated: boolean;
}

export interface AggregationTrace {
  /** Whether hierarchical aggregation actually ran (vs flat pass-through). */
  aggregationUsed: boolean;
  strategy: "flat" | "hierarchical";
  agentCount: number;
  /** 1 = flat synthesis, 2 = clustered (cluster → synthesis). */
  treeDepth: number;
  clusterCount: number;
  clusters: AggregationClusterTrace[];
  escalatedClusterCount: number;
  meanDivergence: number;
  maxDivergence: number;
  divergenceThreshold: number;
  /** Whether fidelity scoring ran for this run (sampled). */
  fidelityScored: boolean;
  /** Quality (0..1) of the hierarchical answer. */
  fidelityScore?: number;
  /** Quality (0..1) of the flat-synthesis baseline. */
  baselineScore?: number;
  /** fidelityScore / baselineScore (1.0 = no degradation vs baseline). */
  fidelityRatio?: number;
  fidelityFloor: number;
  /** Whether the run fell back to flat synthesis after failing the floor. */
  fellBackToFlat: boolean;
  /** Whether the run was flagged for human review. */
  flaggedForReview: boolean;
  taskCategory?: string;
  notes: string[];
}

export function emptyAggregationTrace(agentCount: number): AggregationTrace {
  return {
    aggregationUsed: false,
    strategy: "flat",
    agentCount,
    treeDepth: 1,
    clusterCount: 0,
    clusters: [],
    escalatedClusterCount: 0,
    meanDivergence: 0,
    maxDivergence: 0,
    divergenceThreshold: 0,
    fidelityScored: false,
    fidelityFloor: 0,
    fellBackToFlat: false,
    flaggedForReview: false,
    notes: [],
  };
}
