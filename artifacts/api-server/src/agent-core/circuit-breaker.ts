import { agentMetrics } from "./metrics.js";

interface CircuitState {
  failures: number;
  lastFailureAt: number;
  isOpen: boolean;
}

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 60_000;

const states = new Map<string, CircuitState>();

function getState(key: string): CircuitState {
  if (!states.has(key)) {
    states.set(key, { failures: 0, lastFailureAt: 0, isOpen: false });
  }
  return states.get(key)!;
}

export function isCircuitOpen(key = "default"): boolean {
  const state = getState(key);
  if (!state.isOpen) return false;
  if (Date.now() - state.lastFailureAt > RESET_TIMEOUT_MS) {
    state.isOpen = false;
    state.failures = 0;
    agentMetrics.circuitBreakerState.set(0, { circuit: key });
    console.log(`[CircuitBreaker] Auto-reset circuit for "${key}"`);
    return false;
  }
  return true;
}

export function recordCircuitFailure(key = "default"): void {
  const state = getState(key);
  state.failures++;
  state.lastFailureAt = Date.now();
  if (state.failures >= FAILURE_THRESHOLD) {
    state.isOpen = true;
    agentMetrics.circuitBreakerState.set(1, { circuit: key });
    console.warn(`[CircuitBreaker] Circuit OPEN for "${key}" after ${state.failures} failures`);
  }
}

export function recordCircuitSuccess(key = "default"): void {
  const state = getState(key);
  // Any success resets the consecutive-failure counter; the circuit trips only
  // after FAILURE_THRESHOLD *consecutive* failures, so a single success breaks
  // the streak and closes a half-open circuit.
  if (state.failures > 0 || state.isOpen) {
    state.failures = 0;
    if (state.isOpen) {
      state.isOpen = false;
      agentMetrics.circuitBreakerState.set(0, { circuit: key });
      console.log(`[CircuitBreaker] Circuit CLOSED for "${key}"`);
    }
  }
}

export function getCircuitStatus(key = "default"): { open: boolean; failures: number; resetInMs?: number } {
  const state = getState(key);
  if (!state.isOpen) return { open: false, failures: state.failures };
  const resetInMs = Math.max(0, RESET_TIMEOUT_MS - (Date.now() - state.lastFailureAt));
  return { open: true, failures: state.failures, resetInMs };
}
