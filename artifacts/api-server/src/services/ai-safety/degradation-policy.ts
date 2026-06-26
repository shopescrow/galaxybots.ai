/**
 * Graceful degradation policy — tie orchestration aggressiveness to live
 * provider health. When AI provider circuits are open (or half-open) the
 * system is under stress, so the conductor should do LESS work per request:
 * smaller fleets, cheaper model tier, and a flat (single-pass) communication
 * strategy. The goal is to degrade — not fail — when providers are unhealthy.
 *
 * Health is read from the same circuit breakers model-fallback uses to route
 * calls, so this policy reflects the actual backends in trouble.
 */

import { getCircuitState } from "./circuit-breaker";

// Provider circuit keys tracked by model-fallback / ollama-adapter.
const TRACKED_PROVIDERS = ["openai", "anthropic"];

export type DegradationLevel = "none" | "partial" | "severe";

export interface DegradationPolicy {
  degraded: boolean;
  level: DegradationLevel;
  /** Hard cap on fleet size; undefined means no cap. */
  maxFleetSize?: number;
  /** Prefer the cheaper/efficient model tier to relieve load and cost. */
  preferCheaperTier: boolean;
  /** Collapse multi-agent strategies to a single flat synthesis pass. */
  forceFlatSynthesis: boolean;
  /** Human-readable explanation for audit/logging. */
  reason: string;
  /** Providers whose circuits are not closed. */
  unhealthyProviders: string[];
}

const HEALTHY_POLICY: DegradationPolicy = {
  degraded: false,
  level: "none",
  preferCheaperTier: false,
  forceFlatSynthesis: false,
  reason: "all providers healthy",
  unhealthyProviders: [],
};

/**
 * Compute the current degradation policy from provider circuit health.
 *
 * - 0 unhealthy providers   → none (full orchestration).
 * - some unhealthy          → partial (cap fleet, prefer cheaper tier).
 * - all tracked unhealthy   → severe (flat synthesis, minimal fleet).
 */
export function getDegradationPolicy(providers: string[] = TRACKED_PROVIDERS): DegradationPolicy {
  const unhealthyProviders = providers.filter((p) => getCircuitState(p) !== "closed");

  if (unhealthyProviders.length === 0) {
    return HEALTHY_POLICY;
  }

  const allUnhealthy = unhealthyProviders.length >= providers.length;

  if (allUnhealthy) {
    return {
      degraded: true,
      level: "severe",
      maxFleetSize: 1,
      preferCheaperTier: true,
      forceFlatSynthesis: true,
      reason: `All AI providers degraded (${unhealthyProviders.join(", ")}) — collapsing to single-agent flat synthesis on cheaper tier`,
      unhealthyProviders,
    };
  }

  return {
    degraded: true,
    level: "partial",
    maxFleetSize: 2,
    preferCheaperTier: true,
    forceFlatSynthesis: false,
    reason: `Provider(s) degraded (${unhealthyProviders.join(", ")}) — reducing fleet and preferring cheaper tier`,
    unhealthyProviders,
  };
}
