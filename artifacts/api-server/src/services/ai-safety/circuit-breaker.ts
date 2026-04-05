import { broadcastSSEToAll } from "../platform/sse";
import { createSystemNotification } from "../admin/notifications";

type CircuitState = "closed" | "open" | "half-open";

interface ProviderCircuit {
  state: CircuitState;
  errors: number[];
  successes: number[];
  lastStateChange: number;
  openedAt: number | null;
}

const WINDOW_MS = 5 * 60 * 1000;
const ERROR_THRESHOLD = 0.5;
const COOLDOWN_MS = 60 * 1000;

const circuits = new Map<string, ProviderCircuit>();

function getCircuit(provider: string): ProviderCircuit {
  let circuit = circuits.get(provider);
  if (!circuit) {
    circuit = {
      state: "closed",
      errors: [],
      successes: [],
      lastStateChange: Date.now(),
      openedAt: null,
    };
    circuits.set(provider, circuit);
  }
  return circuit;
}

function pruneWindow(timestamps: number[], now: number): number[] {
  const cutoff = now - WINDOW_MS;
  return timestamps.filter((t) => t > cutoff);
}

function transitionState(provider: string, circuit: ProviderCircuit, newState: CircuitState): void {
  const oldState = circuit.state;
  circuit.state = newState;
  circuit.lastStateChange = Date.now();

  if (newState === "open") {
    circuit.openedAt = Date.now();
  } else if (newState === "closed") {
    circuit.openedAt = null;
  }

  console.log(`[CircuitBreaker] ${provider}: ${oldState} → ${newState}`);

  broadcastSSEToAll("circuit_breaker", {
    provider,
    oldState,
    newState,
    timestamp: new Date().toISOString(),
  });

  createSystemNotification({
    category: "system",
    severity: newState === "open" ? "critical" : "info",
    title: `AI Provider ${provider} circuit ${newState}`,
    body: newState === "open"
      ? `Provider ${provider} has been temporarily disabled due to high error rate. Auto-recovery in ${COOLDOWN_MS / 1000}s.`
      : `Provider ${provider} circuit has recovered and is now ${newState}.`,
    link: "/analytics",
    metadata: { provider, oldState, newState },
  }).catch((e) => console.error("[CircuitBreaker] notification failed:", e));
}

export function recordSuccess(provider: string): void {
  const circuit = getCircuit(provider);
  const now = Date.now();
  circuit.successes = pruneWindow(circuit.successes, now);
  circuit.successes.push(now);

  if (circuit.state === "half-open") {
    transitionState(provider, circuit, "closed");
    circuit.errors = [];
  }
}

export function recordError(provider: string): void {
  const circuit = getCircuit(provider);
  const now = Date.now();
  circuit.errors = pruneWindow(circuit.errors, now);
  circuit.successes = pruneWindow(circuit.successes, now);
  circuit.errors.push(now);

  if (circuit.state === "closed" || circuit.state === "half-open") {
    const total = circuit.errors.length + circuit.successes.length;
    if (total >= 3 && circuit.errors.length / total >= ERROR_THRESHOLD) {
      transitionState(provider, circuit, "open");
    }
  }
}

export function isCircuitOpen(provider: string): boolean {
  const circuit = getCircuit(provider);
  const now = Date.now();

  if (circuit.state === "open" && circuit.openedAt) {
    if (now - circuit.openedAt >= COOLDOWN_MS) {
      transitionState(provider, circuit, "half-open");
      return false;
    }
    return true;
  }

  return false;
}

export function getCircuitState(provider: string): CircuitState {
  const circuit = getCircuit(provider);
  const now = Date.now();

  if (circuit.state === "open" && circuit.openedAt && now - circuit.openedAt >= COOLDOWN_MS) {
    transitionState(provider, circuit, "half-open");
  }

  return circuit.state;
}

export function resetCircuit(provider: string): void {
  circuits.delete(provider);
}
