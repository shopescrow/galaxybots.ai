/**
 * Centralized configuration for the sub-quadratic scaling enhancements applied to
 * the live agent coordination layer. Every enhancement is independently toggleable
 * via an environment-driven feature flag and is inert below its configured threshold,
 * so small runs behave exactly as they did before these enhancements existed.
 */

function boolEnv(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return def;
}

function intEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

export interface ScalingFlag {
  /** Master switch — when false the enhancement is never used regardless of count. */
  enabled: boolean;
  /** The enhancement only activates once the relevant item count is STRICTLY above this. */
  threshold: number;
}

export interface ScalingConfig {
  /** Hierarchical √n tree-aggregation of agent outputs in the conductor strategies. */
  synthesisAggregation: ScalingFlag;
  /** Bounded / clustered candidate shortlisting before UCB1 + softmax role selection. */
  roleSelection: ScalingFlag;
  /** Top-k vector-similarity retrieval for role memory instead of a full scan. */
  memoryRetrieval: ScalingFlag;
  /** Hierarchical aggregation of Guardian swarm bee findings. */
  guardianAggregation: ScalingFlag;
  /** Fan-in bound: max items handed to a single aggregation/synthesis prompt before re-clustering. */
  aggregationFanIn: number;
  /** Default number of memory entries retrieved via vector similarity. */
  memoryTopK: number;
}

/**
 * Live, mutable config object. Defaults keep enhancements ON but with thresholds high
 * enough that typical small runs (2–5 agents/bots/memories) never cross them, guaranteeing
 * zero behavioral change for the common case. Tests may mutate these fields directly.
 */
export const scalingConfig: ScalingConfig = {
  synthesisAggregation: {
    enabled: boolEnv("SCALING_SYNTHESIS_ENABLED", true),
    threshold: intEnv("SCALING_SYNTHESIS_THRESHOLD", 6),
  },
  roleSelection: {
    enabled: boolEnv("SCALING_ROLE_SELECTION_ENABLED", true),
    threshold: intEnv("SCALING_ROLE_SELECTION_THRESHOLD", 12),
  },
  memoryRetrieval: {
    enabled: boolEnv("SCALING_MEMORY_RETRIEVAL_ENABLED", true),
    threshold: intEnv("SCALING_MEMORY_RETRIEVAL_THRESHOLD", 24),
  },
  guardianAggregation: {
    enabled: boolEnv("SCALING_GUARDIAN_ENABLED", true),
    threshold: intEnv("SCALING_GUARDIAN_THRESHOLD", 6),
  },
  aggregationFanIn: intEnv("SCALING_AGGREGATION_FAN_IN", 8),
  memoryTopK: intEnv("SCALING_MEMORY_TOP_K", 12),
};

/** A scaling enhancement is active only when its flag is enabled AND the count exceeds its threshold. */
export function isScalingActive(flag: ScalingFlag, count: number): boolean {
  return flag.enabled && count > flag.threshold;
}
