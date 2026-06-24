import { db, strategyCacheTable, guardianIncidentsTable } from "@workspace/db";
import { eq, avg, sql } from "drizzle-orm";
import { conductorStrategiesTable } from "@workspace/db";
import { writeAuditEntry } from "../audit/audit-ledger.js";
import type { CommunicationStrategy } from "@workspace/db";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Rolling window for P95 calculation in ms (default: 2 minutes) */
  rollingWindowMs: number;
  /** P95 latency threshold in ms above which circuit opens (default: 8000) */
  p95ThresholdMs: number;
  /** Cooldown before transitioning to half-open in ms (default: 5 minutes) */
  halfOpenDelayMs: number;
  /** Consecutive healthy P95 checks before closing circuit (default: 5) */
  consecutiveHealthyRequired: number;
  /** Maximum samples in rolling buffer (default: 200) */
  maxBufferSize: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  rollingWindowMs: 2 * 60 * 1000,
  p95ThresholdMs: 8_000,
  halfOpenDelayMs: 5 * 60 * 1000,
  consecutiveHealthyRequired: 5,
  maxBufferSize: 200,
};

let config: CircuitBreakerConfig = { ...DEFAULT_CONFIG };

/** Override circuit breaker configuration. Useful for testing and client-tier tuning. */
export function setCircuitBreakerConfig(overrides: Partial<CircuitBreakerConfig>): void {
  config = { ...DEFAULT_CONFIG, ...overrides };
}

/** Reset circuit breaker configuration to defaults. */
export function resetCircuitBreakerConfig(): void {
  config = { ...DEFAULT_CONFIG };
}

// Keep module-level constants as aliases for readability within the module
const ROLLING_WINDOW_MS = () => config.rollingWindowMs;
const P95_THRESHOLD_MS = () => config.p95ThresholdMs;
const HALF_OPEN_DELAY_MS = () => config.halfOpenDelayMs;
const CONSECUTIVE_HEALTHY_REQUIRED = () => config.consecutiveHealthyRequired;
const MAX_BUFFER_SIZE = () => config.maxBufferSize;

interface LatencyRecord {
  ms: number;
  at: number;
}

let circuitState: CircuitState = "closed";
let openedAt: number | null = null;
let consecutiveHealthyChecks = 0;
let latencyBuffer: LatencyRecord[] = [];
let halfOpenProbeInFlight = false;

function pruneOldEntries(): void {
  const cutoff = Date.now() - ROLLING_WINDOW_MS();
  latencyBuffer = latencyBuffer.filter((r) => r.at >= cutoff);
  if (latencyBuffer.length > MAX_BUFFER_SIZE()) {
    latencyBuffer = latencyBuffer.slice(-MAX_BUFFER_SIZE());
  }
}

function computeP95(): number | null {
  if (latencyBuffer.length < 5) return null;
  const sorted = [...latencyBuffer].sort((a, b) => a.ms - b.ms);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)]!.ms;
}

export function recordLatency(ms: number, options?: { isProbe?: boolean }): void {
  const isProbe = options?.isProbe ?? false;
  pruneOldEntries();
  latencyBuffer.push({ ms, at: Date.now() });

  const p95 = computeP95();
  if (p95 === null) return;

  if (circuitState === "closed" && p95 > P95_THRESHOLD_MS()) {
    openCircuit(p95);
  } else if (circuitState === "open") {
    if (openedAt && Date.now() - openedAt >= HALF_OPEN_DELAY_MS()) {
      transitionToHalfOpen();
    }
  } else if (circuitState === "half-open") {
    // Only the designated probe request can drive recovery — bypass traffic is
    // fast by construction and must not satisfy the consecutive-healthy counter.
    if (!isProbe) return;

    // Evaluate the rolling-window P95 (which now includes this probe), not the
    // raw probe latency alone.  This ensures 5 consecutive healthy P95 readings,
    // not just 5 lucky single-request timings.
    const currentP95 = computeP95();
    if (currentP95 !== null && currentP95 <= P95_THRESHOLD_MS()) {
      consecutiveHealthyChecks++;
      if (consecutiveHealthyChecks >= CONSECUTIVE_HEALTHY_REQUIRED()) {
        closeCircuit(currentP95);
      }
    } else {
      consecutiveHealthyChecks = 0;
      // Re-open using latest P95 so audit entry is accurate; fall back to
      // the raw probe ms when there aren't enough samples yet.
      openCircuit(currentP95 ?? ms);
    }
  }
}

function openCircuit(p95: number): void {
  const wasOpen = circuitState === "open";
  circuitState = "open";
  openedAt = Date.now();
  consecutiveHealthyChecks = 0;

  if (!wasOpen) {
    console.warn(`[OrchestrationCircuitBreaker] CIRCUIT OPENED — P95 latency ${p95}ms exceeds ${P95_THRESHOLD_MS()}ms threshold`);

    writeAuditEntry({
      engine: "circuit_breaker",
      decisionType: "circuit_open",
      payload: { p95LatencyMs: p95, thresholdMs: P95_THRESHOLD_MS(), openedAt: new Date().toISOString() },
    }).catch(() => {});

    db.insert(guardianIncidentsTable).values({
      title: "Orchestration Pipeline P95 Latency Exceeded",
      description: `JointPlanExecutor P95 latency reached ${p95}ms, exceeding the ${P95_THRESHOLD_MS()}ms threshold. Circuit opened — sessions now bypass Arbitration and use cached strategies.`,
      domain: "ai_infrastructure",
      severity: 45,
      blastRadius: 35,
      status: "open",
      affectedComponent: "joint_plan_executor",
      errorFingerprint: "orchestration_circuit_open",
      recurrenceRate: 0,
    }).catch(() => {});
  }
}

function transitionToHalfOpen(): void {
  circuitState = "half-open";
  consecutiveHealthyChecks = 0;
  halfOpenProbeInFlight = false;
  console.log("[OrchestrationCircuitBreaker] Transitioning to HALF-OPEN — testing pipeline recovery");
}

function closeCircuit(p95: number): void {
  circuitState = "closed";
  openedAt = null;
  consecutiveHealthyChecks = 0;
  halfOpenProbeInFlight = false;
  console.log(`[OrchestrationCircuitBreaker] CIRCUIT CLOSED — P95 latency ${p95}ms restored below threshold`);

  writeAuditEntry({
    engine: "circuit_breaker",
    decisionType: "circuit_close",
    payload: { p95LatencyMs: p95, thresholdMs: P95_THRESHOLD_MS, closedAt: new Date().toISOString() },
  }).catch(() => {});
}

export function checkCircuit(): CircuitState {
  pruneOldEntries();

  if (circuitState === "open" && openedAt && Date.now() - openedAt >= HALF_OPEN_DELAY_MS()) {
    transitionToHalfOpen();
  }

  return circuitState;
}

/**
 * For half-open state: only ONE probe request is allowed through at a time.
 * Returns true if this caller should run the full pipeline (probe), false if it should bypass.
 */
export function acquireHalfOpenProbe(): boolean {
  if (circuitState !== "half-open") return true;
  if (halfOpenProbeInFlight) return false;
  halfOpenProbeInFlight = true;
  return true;
}

export function releaseHalfOpenProbe(): void {
  halfOpenProbeInFlight = false;
}

export function getCircuitMetrics(): { state: CircuitState; p95Ms: number | null; sampleCount: number; openedAt: number | null } {
  pruneOldEntries();
  return {
    state: circuitState,
    p95Ms: computeP95(),
    sampleCount: latencyBuffer.length,
    openedAt,
  };
}

export async function getCachedStrategy(taskCategory: string): Promise<CommunicationStrategy> {
  try {
    const [row] = await db
      .select()
      .from(strategyCacheTable)
      .where(eq(strategyCacheTable.taskCategory, taskCategory))
      .limit(1);

    if (row?.bestStrategy) {
      return row.bestStrategy as CommunicationStrategy;
    }
  } catch {
  }
  return "parallel_synthesis";
}

export async function updateStrategyCache(taskCategory: string, strategy: CommunicationStrategy, qualityScore: number): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(strategyCacheTable)
      .where(eq(strategyCacheTable.taskCategory, taskCategory))
      .limit(1);

    if (existing) {
      const newCount = existing.sampleCount + 1;
      const newAvg = (existing.avgQualityScore * existing.sampleCount + qualityScore) / newCount;
      // Only promote a new bestStrategy when its running average strictly exceeds
      // the current best's average — never demote to a lower-quality strategy.
      const shouldUpdateBest = strategy === existing.bestStrategy || newAvg > existing.avgQualityScore;

      await db
        .update(strategyCacheTable)
        .set({
          bestStrategy: shouldUpdateBest ? strategy : existing.bestStrategy,
          avgQualityScore: newAvg,
          sampleCount: newCount,
          updatedAt: new Date(),
        })
        .where(eq(strategyCacheTable.taskCategory, taskCategory));
    } else {
      await db.insert(strategyCacheTable).values({
        taskCategory,
        bestStrategy: strategy,
        avgQualityScore: qualityScore,
        sampleCount: 1,
        updatedAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[OrchestrationCircuitBreaker] updateStrategyCache failed:", err);
  }
}
