/**
 * LLM provider circuit breaker — Redis-backed with in-memory fallback.
 *
 * When Redis is available, trip/recovery state is shared across every API
 * instance so a provider that starts failing is seen as unhealthy everywhere,
 * not just on the instance that observed the errors.
 *
 * When Redis is absent or temporarily unreachable, state falls back to an
 * in-process map exactly as before, so local dev and single-instance
 * deployments continue to work without any configuration change.
 *
 * Redis key layout (all prefixed "cb:"):
 *   cb:<provider>:state       STRING  "closed" | "open" | "half-open"
 *   cb:<provider>:openedAt    STRING  epoch-ms when the circuit tripped (or "")
 *   cb:<provider>:errors      ZSET    timestamps of recent errors (score = ms)
 *   cb:<provider>:successes   ZSET    timestamps of recent successes (score = ms)
 *
 * Degradation contract:
 *   Every Redis-path operation (addEventToWindow, countWindow, loadState) has an
 *   explicit fallback return value.  recordError/recordSuccess check whether the
 *   Redis operations actually succeeded and fall through to the in-memory path
 *   when they did not — so breaker logic is never silently skipped.
 */

import { randomBytes } from "node:crypto";
import { broadcastSSEToAll } from "../platform/sse";
import { createSystemNotification } from "../admin/notifications";
import { getRedisClient, withRedis } from "../scaling/redis-store";

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

const KEY_TTL_S = Math.ceil((WINDOW_MS + COOLDOWN_MS) / 1000) * 2;

const circuits = new Map<string, ProviderCircuit>();

function localCircuit(provider: string): ProviderCircuit {
  let c = circuits.get(provider);
  if (!c) {
    c = { state: "closed", errors: [], successes: [], lastStateChange: Date.now(), openedAt: null };
    circuits.set(provider, c);
  }
  return c;
}

function pruneWindow(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => t > now - WINDOW_MS);
}

function ck(provider: string, suffix: string): string {
  return `cb:${provider}:${suffix}`;
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
    body:
      newState === "open"
        ? `Provider ${provider} has been temporarily disabled due to high error rate. Auto-recovery in ${COOLDOWN_MS / 1000}s.`
        : `Provider ${provider} circuit has recovered and is now ${newState}.`,
    link: "/analytics",
    metadata: { provider, oldState, newState },
  }).catch((e) => console.error("[CircuitBreaker] notification failed:", e));

  persistState(provider, circuit).catch((e) =>
    console.warn("[CircuitBreaker] Redis persist failed:", (e as Error).message),
  );
}

async function persistState(provider: string, circuit: ProviderCircuit): Promise<void> {
  await withRedis(async (r) => {
    const multi = r.multi();
    multi.set(ck(provider, "state"), circuit.state, "EX", KEY_TTL_S);
    multi.set(
      ck(provider, "openedAt"),
      circuit.openedAt != null ? String(circuit.openedAt) : "",
      "EX",
      KEY_TTL_S,
    );
    await multi.exec();
    return true;
  }, false);
}

async function loadState(provider: string): Promise<{ state: CircuitState; openedAt: number | null } | null> {
  return withRedis(async (r) => {
    const [state, openedAt] = await r.mget(ck(provider, "state"), ck(provider, "openedAt"));
    if (!state) return null;
    return {
      state: (state as CircuitState) ?? "closed",
      openedAt: openedAt ? Number(openedAt) : null,
    };
  }, null);
}

/**
 * Append one event to the sliding-window sorted set.
 * Returns true when the Redis write succeeded, false on connection/command failure.
 * A unique member suffix prevents same-millisecond collisions that would cause
 * ZADD to overwrite an existing entry rather than add a new one.
 */
async function addEventToWindow(
  provider: string,
  kind: "errors" | "successes",
  now: number,
): Promise<boolean> {
  const member = `${now}-${randomBytes(4).toString("hex")}`;
  return withRedis(async (r) => {
    const key = ck(provider, kind);
    const cutoff = now - WINDOW_MS;
    const multi = r.multi();
    multi.zremrangebyscore(key, "-inf", cutoff);
    multi.zadd(key, now, member);
    multi.expire(key, KEY_TTL_S);
    await multi.exec();
    return true;
  }, false);
}

/**
 * Count events in the sliding window using Redis ZCOUNT.
 * Returns null when the Redis command fails (caller must fall back to local).
 */
async function countWindow(
  provider: string,
  kind: "errors" | "successes",
  now: number,
): Promise<number | null> {
  return withRedis(async (r) => {
    const cutoff = now - WINDOW_MS;
    return r.zcount(ck(provider, kind), cutoff, "+inf");
  }, null);
}

async function clearWindow(provider: string, kind: "errors" | "successes"): Promise<void> {
  await withRedis(async (r) => {
    await r.del(ck(provider, kind));
    return true;
  }, false);
}

export async function recordSuccess(provider: string): Promise<void> {
  const now = Date.now();

  if (getRedisClient()) {
    // Redis path — falls through to local only when the write itself fails.
    const wroteToRedis = await addEventToWindow(provider, "successes", now);
    if (wroteToRedis) {
      const remote = await loadState(provider);
      const local = localCircuit(provider);
      local.state = remote?.state ?? local.state;
      local.openedAt = remote?.openedAt ?? local.openedAt;

      if (local.state === "half-open") {
        await clearWindow(provider, "errors");
        transitionState(provider, local, "closed");
        local.errors = [];
      }
      return;
    }
    // Redis write failed — fall through to local.
  }

  // ── In-memory fallback ─────────────────────────────────────────────────────
  const circuit = localCircuit(provider);
  circuit.successes = pruneWindow(circuit.successes, now);
  circuit.successes.push(now);

  if (circuit.state === "half-open") {
    transitionState(provider, circuit, "closed");
    circuit.errors = [];
  }
}

export async function recordError(provider: string): Promise<void> {
  const now = Date.now();

  if (getRedisClient()) {
    // Redis path — evaluate trip threshold using the SHARED window counts so
    // errors from every instance accumulate together.  Falls through to local
    // only when a Redis command fails mid-path.
    const wroteToRedis = await addEventToWindow(provider, "errors", now);
    if (wroteToRedis) {
      const remote = await loadState(provider);
      const local = localCircuit(provider);
      local.state = remote?.state ?? "closed";
      local.openedAt = remote?.openedAt ?? null;

      if (local.state === "closed" || local.state === "half-open") {
        const [errCount, sucCount] = await Promise.all([
          countWindow(provider, "errors", now),
          countWindow(provider, "successes", now),
        ]);

        if (errCount !== null) {
          // Both reads succeeded — use shared counts.
          const total = errCount + (sucCount ?? 0);
          if (total >= 3 && errCount / total >= ERROR_THRESHOLD) {
            transitionState(provider, local, "open");
          }
          return;
        }
        // countWindow failed — fall through to local.
      } else {
        // Circuit already open or half-open; no trip evaluation needed.
        return;
      }
    }
    // Redis write failed — fall through to local.
  }

  // ── In-memory fallback ─────────────────────────────────────────────────────
  const circuit = localCircuit(provider);
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
  const local = localCircuit(provider);
  const now = Date.now();

  if (local.state === "open" && local.openedAt) {
    if (now - local.openedAt >= COOLDOWN_MS) {
      transitionState(provider, local, "half-open");
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Cluster-aware circuit-open check — reads Redis state first (if available),
 * updates the local cache, then returns the result.
 *
 * Use this on the request path (e.g. before calling a provider) so that a
 * breaker tripped by any other instance is immediately respected here too.
 * Falls back to the local sync check if Redis is unavailable.
 */
export async function isCircuitOpenAsync(provider: string): Promise<boolean> {
  await syncCircuitFromRedis(provider);
  return isCircuitOpen(provider);
}

export function getCircuitState(provider: string): CircuitState {
  const local = localCircuit(provider);
  const now = Date.now();

  if (local.state === "open" && local.openedAt && now - local.openedAt >= COOLDOWN_MS) {
    transitionState(provider, local, "half-open");
  }

  return local.state;
}

/**
 * Sync circuit state from Redis into the local in-process cache.
 * Called lazily by the heartbeat / health-check path to keep local state fresh.
 */
export async function syncCircuitFromRedis(provider: string): Promise<void> {
  const remote = await loadState(provider);
  if (!remote) return;
  const local = localCircuit(provider);
  local.state = remote.state;
  local.openedAt = remote.openedAt;
}

export function resetCircuit(provider: string): void {
  circuits.delete(provider);
  withRedis(async (r) => {
    await r.del(
      ck(provider, "state"),
      ck(provider, "openedAt"),
      ck(provider, "errors"),
      ck(provider, "successes"),
    );
    return true;
  }, false).catch(() => {});
}

/**
 * Clear only the in-process local cache for a provider without touching Redis.
 * Used in tests to simulate a fresh instance that hasn't seen any traffic yet.
 */
export function clearLocalCircuitCache(provider: string): void {
  circuits.delete(provider);
}
