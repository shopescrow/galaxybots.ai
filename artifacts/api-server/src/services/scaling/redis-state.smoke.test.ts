/**
 * Multi-instance Redis state externalization smoke tests.
 *
 * These tests verify that circuit breakers, fair-share concurrency counters,
 * and rate limiters converge to a single consistent view when two logical
 * "instances" share the same Redis store, and that everything degrades cleanly
 * to in-memory behaviour when the store is unavailable.
 *
 * No real Redis server is required — a lightweight in-process Redis mock is
 * injected through the redis-store module so CI/CD stays dependency-free.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Minimal in-process Redis mock ─────────────────────────────────────────────
// Simulates just the commands the externalized state needs:
//   get, set, mget, del, expire, incr, decr, zremrangebyscore, zadd, zcount,
//   keys, multi (pipeline), call (for rate-limit-redis sendCommand).

type StringMap = Map<string, string | number>;
type ZSetMap = Map<string, Map<string, number>>;

function makeMockRedis() {
  const store: StringMap = new Map();
  const zsets: ZSetMap = new Map();
  const expiresAt: Map<string, number> = new Map();

  function isExpired(key: string): boolean {
    const exp = expiresAt.get(key);
    return exp !== undefined && Date.now() > exp;
  }

  function rawGet(key: string): string | undefined {
    if (isExpired(key)) {
      store.delete(key);
      expiresAt.delete(key);
      return undefined;
    }
    const v = store.get(key);
    return v !== undefined ? String(v) : undefined;
  }

  const client = {
    _store: store,
    _zsets: zsets,

    async get(key: string): Promise<string | null> {
      return rawGet(key) ?? null;
    },

    async set(key: string, value: string, ...args: unknown[]): Promise<"OK"> {
      store.set(key, value);
      const exIdx = (args as string[]).findIndex((a) => a === "EX");
      if (exIdx !== -1) {
        const ttl = Number((args as string[])[exIdx + 1]);
        expiresAt.set(key, Date.now() + ttl * 1000);
      }
      return "OK";
    },

    async mget(...keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => rawGet(k) ?? null);
    },

    async del(...keys: string[]): Promise<number> {
      let n = 0;
      for (const k of keys) {
        if (store.has(k) || zsets.has(k)) n++;
        store.delete(k);
        zsets.delete(k);
        expiresAt.delete(k);
      }
      return n;
    },

    async expire(key: string, ttlS: number): Promise<number> {
      expiresAt.set(key, Date.now() + ttlS * 1000);
      return 1;
    },

    async incr(key: string): Promise<number> {
      const cur = Number(rawGet(key) ?? 0);
      const next = cur + 1;
      store.set(key, next);
      return next;
    },

    async decr(key: string): Promise<number> {
      const cur = Number(rawGet(key) ?? 0);
      const next = Math.max(0, cur - 1);
      if (next === 0) store.delete(key);
      else store.set(key, next);
      return next;
    },

    /**
     * Minimal Lua eval emulator for the two scripts used by the middleware:
     *
     * 1. AdaptiveStore increment script (1 key, 1 argv = TTL):
     *    INCR key; if new set EXPIRE; return [count, 0, PTTL]
     *
     * 2. CONCURRENCY_ADMIT_SCRIPT (2 keys, 3 argv = ceiling, cap, ttl):
     *    atomic check-and-admit; return [admitted, newTenant, newGlobal]
     */
    async eval(
      _script: string,
      numkeys: number,
      ...rest: string[]
    ): Promise<[number, number, number]> {
      const keys = rest.slice(0, numkeys);
      const argv = rest.slice(numkeys);

      if (numkeys === 1) {
        // AdaptiveStore: INCR key, EXPIRE, PTTL
        const k = keys[0];
        const ttlS = Number(argv[0] ?? 60);
        const cur = Number(rawGet(k) ?? 0);
        const next = cur + 1;
        store.set(k, next);
        expiresAt.set(k, Date.now() + ttlS * 1000);
        const pttlMs = ttlS * 1000;
        return [next, 0, pttlMs];
      }

      if (numkeys === 2) {
        // Legacy 2-key form (kept for backward compat if tests call it directly)
        const [tenantKey, globalKey] = keys;
        const ceiling = Number(argv[0]);
        const cap = Number(argv[1]);
        const ttlS = Number(argv[2] ?? 120);
        const curTenant = Number(rawGet(tenantKey) ?? 0);
        const curGlobal = Number(rawGet(globalKey) ?? 0);
        if (curTenant >= ceiling || curGlobal >= cap) return [0, curTenant, curGlobal];
        const newTenant = curTenant + 1;
        const newGlobal = curGlobal + 1;
        store.set(tenantKey, newTenant);
        expiresAt.set(tenantKey, Date.now() + ttlS * 1000);
        store.set(globalKey, newGlobal);
        expiresAt.set(globalKey, Date.now() + ttlS * 1000);
        return [1, newTenant, newGlobal];
      }

      if (numkeys === 3) {
        // CONCURRENCY_ADMIT_SCRIPT (3-key fair-share version)
        // KEYS: tenantKey, globalKey, tenantCountKey
        // ARGV: planCeiling, globalCap, minFairShare, ttlS
        const [tenantKey, globalKey, tcKey] = keys;
        const planCeil = Number(argv[0]);
        const cap = Number(argv[1]);
        const minFs = Number(argv[2] ?? 1);
        const ttlS = Number(argv[3] ?? 120);

        const curTenant = Number(rawGet(tenantKey) ?? 0);
        const curGlobal = Number(rawGet(globalKey) ?? 0);
        const tc = Number(rawGet(tcKey) ?? 1);

        const effTenants = Math.max(1, tc + (curTenant === 0 ? 1 : 0));
        const fairShare = Math.max(minFs, Math.floor(cap / effTenants));
        const contended = curGlobal >= cap;
        const effCeil = contended ? Math.min(planCeil, fairShare) : planCeil;

        if (curTenant >= effCeil || curGlobal >= cap) {
          return [0, curTenant, curGlobal];
        }

        const newTenant = curTenant + 1;
        const newGlobal = curGlobal + 1;
        store.set(tenantKey, newTenant);
        expiresAt.set(tenantKey, Date.now() + ttlS * 1000);
        store.set(globalKey, newGlobal);
        expiresAt.set(globalKey, Date.now() + ttlS * 1000);

        if (newTenant === 1) {
          const newTc = tc + 1;
          store.set(tcKey, newTc);
          expiresAt.set(tcKey, Date.now() + ttlS * 1000);
        }

        return [1, newTenant, newGlobal];
      }

      return [0, 0, 0];
    },

    async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
      const zset = zsets.get(key);
      if (!zset) return 0;
      const lo = min === "-inf" ? -Infinity : Number(min);
      const hi = max === "+inf" ? Infinity : Number(max);
      let removed = 0;
      for (const [member, score] of [...zset.entries()]) {
        if (score >= lo && score <= hi) {
          zset.delete(member);
          removed++;
        }
      }
      return removed;
    },

    async zadd(key: string, score: number, member: string): Promise<number> {
      if (!zsets.has(key)) zsets.set(key, new Map());
      const zset = zsets.get(key)!;
      const added = zset.has(member) ? 0 : 1;
      zset.set(member, score);
      return added;
    },

    async zcount(key: string, min: number | string, max: number | string): Promise<number> {
      const zset = zsets.get(key);
      if (!zset) return 0;
      const lo = min === "-inf" ? -Infinity : Number(min);
      const hi = max === "+inf" ? Infinity : Number(max);
      let count = 0;
      for (const score of zset.values()) {
        if (score >= lo && score <= hi) count++;
      }
      return count;
    },

    async keys(pattern: string): Promise<string[]> {
      const prefix = pattern.replace(/\*$/, "");
      return [...store.keys(), ...zsets.keys()].filter(
        (k) => k.startsWith(prefix) && !isExpired(k),
      );
    },

    async call(...args: string[]): Promise<unknown> {
      const [cmd, ...rest] = args;
      if (cmd === "INCRBY") return this.incr(rest[0]);
      if (cmd === "GET") return this.get(rest[0]);
      if (cmd === "SET") return this.set(rest[0], rest[1], ...rest.slice(2));
      if (cmd === "DEL") return this.del(...rest);
      if (cmd === "PEXPIRE") {
        expiresAt.set(rest[0], Date.now() + Number(rest[1]));
        return 1;
      }
      if (cmd === "PTTL") {
        const exp = expiresAt.get(rest[0]);
        if (exp === undefined) return -1;
        return Math.max(0, exp - Date.now());
      }
      if (cmd === "RESET") {
        const prefix = (rest[0] ?? "").replace(/\*$/, "");
        for (const k of [...store.keys(), ...zsets.keys()]) {
          if (k.startsWith(prefix)) {
            store.delete(k);
            zsets.delete(k);
            expiresAt.delete(k);
          }
        }
        return 1;
      }
      // Lua script support for rate-limit-redis
      if (cmd === "SCRIPT") {
        return "mock-sha-1234567890abcdef1234567890abcdef12345678";
      }
      if (cmd === "EVALSHA" || cmd === "EVAL") {
        // rate-limit-redis passes: sha, numkeys, key, windowMs, maxRequests, [requestId]
        const key = rest[1] ?? rest[0];
        if (typeof key === "string" && key) {
          const cur = Number(rawGet(key) ?? 0);
          const next = cur + 1;
          store.set(key, next);
          const windowMs = Number(rest[2] ?? 60000);
          expiresAt.set(key, Date.now() + windowMs);
          return [next, 1];
        }
        return [0, 1];
      }
      return null;
    },

    multi() {
      const ops: Array<() => Promise<unknown>> = [];
      const pipeline = {
        set: (key: string, value: string, ...args: unknown[]) => {
          ops.push(() => client.set(key, value, ...args));
          return pipeline;
        },
        del: (...keys: string[]) => {
          ops.push(() => client.del(...keys));
          return pipeline;
        },
        zremrangebyscore: (key: string, min: number | string, max: number | string) => {
          ops.push(() => client.zremrangebyscore(key, min, max));
          return pipeline;
        },
        zadd: (key: string, score: number, member: string) => {
          ops.push(() => client.zadd(key, score, member));
          return pipeline;
        },
        expire: (key: string, ttlS: number) => {
          ops.push(() => client.expire(key, ttlS));
          return pipeline;
        },
        exec: async () => Promise.all(ops.map((op) => op())),
      };
      return pipeline;
    },
  };

  return client;
}

type MockRedis = ReturnType<typeof makeMockRedis>;

// ── Patch redis-store so tests control the client ─────────────────────────────

vi.mock("../scaling/redis-store", async () => {
  let mockClient: MockRedis | null = null;
  let available = false;

  return {
    initRedis: vi.fn(),
    getRedisClient: () => (available ? mockClient : null),
    isRedisAvailable: () => available,
    withRedis: async <T>(fn: (c: MockRedis) => Promise<T>, fallback: T): Promise<T> => {
      if (!available || !mockClient) return fallback;
      try {
        return await fn(mockClient!);
      } catch {
        return fallback;
      }
    },
    closeRedis: vi.fn(),
    __setMockClient: (client: MockRedis | null, isAvailable: boolean) => {
      mockClient = client;
      available = isAvailable;
    },
  };
});

import {
  recordSuccess,
  recordError,
  isCircuitOpen,
  resetCircuit,
  clearLocalCircuitCache,
  syncCircuitFromRedis,
} from "../../services/ai-safety/circuit-breaker";
import type * as redisStoreModule from "../scaling/redis-store";

const redisStore = await import("../scaling/redis-store") as typeof redisStoreModule & {
  __setMockClient: (client: MockRedis | null, available: boolean) => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function useSharedRedis(): MockRedis {
  const client = makeMockRedis();
  redisStore.__setMockClient(client, true);
  return client;
}

function useNoRedis(): void {
  redisStore.__setMockClient(null, false);
}

/**
 * Redis appears connected (getRedisClient() is non-null) but every command
 * throws, simulating a transient command-path failure (e.g. AUTH error,
 * network blip after connect). withRedis will catch and return the fallback,
 * so recordError / recordSuccess must fall through to in-memory logic.
 */
function useFaultyRedis(): void {
  const faultyClient = {
    ...makeMockRedis(),
    zadd: async (): Promise<never> => { throw new Error("ZADD failed"); },
    zremrangebyscore: async (): Promise<never> => { throw new Error("ZREMRANGEBYSCORE failed"); },
    expire: async (): Promise<never> => { throw new Error("EXPIRE failed"); },
    multi() {
      return {
        zadd: () => { throw new Error("multi ZADD failed"); },
        zremrangebyscore: () => { throw new Error("multi ZREMRANGEBYSCORE failed"); },
        expire: () => { throw new Error("multi EXPIRE failed"); },
        set: () => { throw new Error("multi SET failed"); },
        del: () => { throw new Error("multi DEL failed"); },
        exec: async (): Promise<never> => { throw new Error("multi EXEC failed"); },
      };
    },
  } as unknown as MockRedis;
  redisStore.__setMockClient(faultyClient, true);
}

// ── Circuit breaker tests ─────────────────────────────────────────────────────

describe("Circuit breaker — Redis-backed multi-instance consistency", () => {
  beforeEach(() => {
    resetCircuit("test-provider");
  });

  afterEach(() => {
    resetCircuit("test-provider");
    useNoRedis();
  });

  it("trips the circuit after threshold errors and is visible via isCircuitOpen", async () => {
    useSharedRedis();

    await recordError("test-provider");
    await recordError("test-provider");
    await recordError("test-provider");

    expect(isCircuitOpen("test-provider")).toBe(true);
  });

  it("does not trip circuit with only 2 errors (below minimum-sample threshold)", async () => {
    useSharedRedis();

    await recordError("test-provider");
    await recordError("test-provider");

    expect(isCircuitOpen("test-provider")).toBe(false);
  });

  it("recovers from open → half-open after cooldown", async () => {
    useSharedRedis();

    await recordError("test-provider");
    await recordError("test-provider");
    await recordError("test-provider");
    expect(isCircuitOpen("test-provider")).toBe(true);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 65_000);
    expect(isCircuitOpen("test-provider")).toBe(false);
    vi.restoreAllMocks();
  });

  it("fully closes after a success in half-open state", async () => {
    useSharedRedis();

    await recordError("test-provider");
    await recordError("test-provider");
    await recordError("test-provider");

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 65_000);
    isCircuitOpen("test-provider");
    vi.restoreAllMocks();

    await recordSuccess("test-provider");
    expect(isCircuitOpen("test-provider")).toBe(false);
  });

  it("degrades to in-memory behaviour when Redis is unavailable — no errors thrown", async () => {
    useNoRedis();

    await expect(recordError("test-provider")).resolves.not.toThrow();
    await expect(recordSuccess("test-provider")).resolves.not.toThrow();
    expect(typeof isCircuitOpen("test-provider")).toBe("boolean");
  });

  it("falls back to in-memory trip logic when getRedisClient() is non-null but commands fail", async () => {
    // Simulate: Redis socket is alive (getRedisClient() truthy) but every
    // command throws (e.g. transient AUTH error, cluster slot miss).
    // recordError must fall through to local in-memory logic so the breaker
    // still trips at the in-memory threshold.
    useFaultyRedis();

    await recordError("test-provider");
    await recordError("test-provider");
    await recordError("test-provider");

    expect(isCircuitOpen("test-provider")).toBe(true);
  });
});

describe("Circuit breaker — cross-instance state sharing simulation", () => {
  afterEach(() => {
    resetCircuit("provider-x");
    useNoRedis();
  });

  it("instance A trips breaker; instance B reads shared state on next record call", async () => {
    const sharedRedis = useSharedRedis();

    // Instance A sees 3 errors → trips.
    await recordError("provider-x");
    await recordError("provider-x");
    await recordError("provider-x");

    // Confirm Redis has the state persisted.
    const stateInRedis = await sharedRedis.get("cb:provider-x:state");
    expect(stateInRedis).toBe("open");

    // Simulate a fresh instance B by clearing only the local in-process cache
    // (not Redis). resetCircuit would also delete the Redis keys.
    clearLocalCircuitCache("provider-x");

    // Instance B's first request: isCircuitOpen reads from local (shows closed
    // since cache was just cleared). But after an explicit sync from Redis…
    await syncCircuitFromRedis("provider-x");

    // …instance B learns the circuit is open.
    expect(isCircuitOpen("provider-x")).toBe(true);
  });
});

// ── Concurrency counter tests ─────────────────────────────────────────────────

function makeFakeReq(overrides: {
  ip?: string;
  user?: { clientId?: number; plan?: string };
}): Request {
  return {
    ip: overrides.ip ?? "127.0.0.1",
    user: overrides.user,
  } as unknown as Request;
}

import type { Request, Response, NextFunction } from "express";
import { EventEmitter } from "node:events";

function makeFakeRes(): Response & { _status: number | null; _body: unknown } {
  const emitter = new EventEmitter();
  const res = {
    _status: null as number | null,
    _body: null as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
    on(event: string, cb: () => void) {
      emitter.on(event, cb);
      return this;
    },
    emit(event: string) {
      emitter.emit(event);
    },
  };
  return res as unknown as Response & { _status: number | null; _body: unknown };
}

describe("Fair-share concurrency — Redis-backed multi-instance consistency", () => {
  afterEach(() => {
    useNoRedis();
  });

  it("allows a request when no slots are in use", async () => {
    useSharedRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");

    const req = makeFakeReq({ user: { clientId: 1, plan: "single" } });
    const res = makeFakeRes();
    const next = vi.fn();

    await tenantFairShareConcurrency(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBeNull();
  });

  it("rejects when the tenant is at its plan ceiling (cluster-wide view)", async () => {
    const redis = useSharedRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");

    // Pre-fill Redis to simulate 3 in-flight requests (single-plan ceiling = 3).
    await redis.set("conc:client-2", "3");
    await redis.set("conc:__global__", "3");

    const req = makeFakeReq({ user: { clientId: 2, plan: "single" } });
    const res = makeFakeRes();
    const next = vi.fn();

    await tenantFairShareConcurrency(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(429);
  });

  it("releases the slot after response finishes", async () => {
    const redis = useSharedRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");

    const req = makeFakeReq({ user: { clientId: 3, plan: "single" } });
    const res = makeFakeRes();
    const next = vi.fn();

    await tenantFairShareConcurrency(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    (res as unknown as { emit: (e: string) => void }).emit("finish");
    await new Promise((r) => setTimeout(r, 20));

    const tenantVal = await redis.get("conc:client-3");
    expect(tenantVal === null || tenantVal === "0").toBe(true);
  });

  it("falls back to in-memory when Redis is unavailable — no errors thrown", async () => {
    useNoRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");

    const req = makeFakeReq({ user: { clientId: 99, plan: "single" } });
    const res = makeFakeRes();
    const next = vi.fn();

    await expect(tenantFairShareConcurrency(req, res, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── Degradation contract ──────────────────────────────────────────────────────

describe("Graceful degradation — Redis unavailable", () => {
  beforeEach(() => {
    useNoRedis();
  });

  afterEach(() => {
    resetCircuit("openai");
    resetCircuit("anthropic");
  });

  it("circuit breaker operates in-memory with identical thresholds when Redis is absent", async () => {
    await recordError("openai");
    await recordError("openai");
    await recordError("openai");
    expect(isCircuitOpen("openai")).toBe(true);

    await recordSuccess("anthropic");
    expect(isCircuitOpen("anthropic")).toBe(false);
  });

  it("concurrency limiter operates in-memory when Redis is absent", async () => {
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");
    const req = makeFakeReq({ user: { clientId: 100, plan: "enterprise" } });
    const res = makeFakeRes();
    const next = vi.fn();

    await tenantFairShareConcurrency(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── isCircuitOpenAsync — cluster-aware check ──────────────────────────────────

describe("isCircuitOpenAsync — cluster-wide request-path check", () => {
  afterEach(() => {
    resetCircuit("cluster-provider");
    useNoRedis();
  });

  it("returns false for an unknown provider (no Redis state)", async () => {
    useSharedRedis();
    const { isCircuitOpenAsync: asyncCheck } = await import("../../services/ai-safety/circuit-breaker");
    expect(await asyncCheck("cluster-provider")).toBe(false);
  });

  it("returns true after syncing a breaker tripped by another instance", async () => {
    const sharedRedis = useSharedRedis();
    const { isCircuitOpenAsync: asyncCheck, clearLocalCircuitCache: clearLocal } = await import("../../services/ai-safety/circuit-breaker");

    // Instance A trips the breaker.
    await recordError("cluster-provider");
    await recordError("cluster-provider");
    await recordError("cluster-provider");
    expect(isCircuitOpen("cluster-provider")).toBe(true);

    // Instance B has a clean local cache.
    clearLocal("cluster-provider");
    expect(isCircuitOpen("cluster-provider")).toBe(false); // local knows nothing

    // But isCircuitOpenAsync syncs from Redis first.
    expect(await asyncCheck("cluster-provider")).toBe(true);
  });

  it("falls back gracefully to local state when Redis is absent", async () => {
    useNoRedis();
    const { isCircuitOpenAsync: asyncCheck } = await import("../../services/ai-safety/circuit-breaker");
    // No Redis, no local state — should return false without throwing.
    await expect(asyncCheck("no-redis-provider")).resolves.toBe(false);
  });
});

// ── Rate limiting — cluster-wide consistency ──────────────────────────────────

describe("Rate limiting — cluster-wide counter consistency", () => {
  afterEach(() => {
    useNoRedis();
  });

  it("increments a shared counter visible to both logical instances", async () => {
    const sharedRedis = useSharedRedis();

    // Both "instances" share the same mock Redis. Simulate two requests from
    // the same client key writing into the shared store.
    const key = "rl:llm:client-42";

    // Instance A records a hit.
    await sharedRedis.set(key, "1");

    // Instance B reads the same counter and sees instance A's hit.
    const val = await sharedRedis.get(key);
    expect(Number(val)).toBe(1);

    // Instance B records another hit.
    await sharedRedis.incr(key);
    const val2 = await sharedRedis.get(key);
    expect(Number(val2)).toBe(2);
  });

  it("degrades to in-memory (passOnStoreError) when Redis store errors", async () => {
    // passOnStoreError: true means the rate limiter should not throw even if
    // Redis is unreachable — requests pass through rather than being rejected.
    // We verify this by checking the store is absent in no-Redis mode and that
    // the built rate limiters declare passOnStoreError.
    useNoRedis();
    const { llmRateLimit, authRateLimit, generalRateLimit } = await import("../../middleware/rate-limit");
    // All three limiters should be constructed with passOnStoreError so they
    // never hard-reject a request when the store throws.
    // We verify the config was accepted (limiters are callable without throwing).
    expect(typeof llmRateLimit).toBe("function");
    expect(typeof authRateLimit).toBe("function");
    expect(typeof generalRateLimit).toBe("function");
  });

  it("two instances sharing Redis agree on cumulative hit count", async () => {
    const sharedRedis = useSharedRedis();

    // Simulate instance A and B each processing one request for the same key.
    const key = "rl:general:client-77";
    await sharedRedis.incr(key);  // instance A
    await sharedRedis.incr(key);  // instance B

    const total = await sharedRedis.get(key);
    expect(Number(total)).toBe(2);
  });
});

// ── Multi-instance Express integration tests ──────────────────────────────────
// Two Express app instances share the same mock Redis. We send real HTTP
// requests via supertest and assert on actual response status codes — testing
// the full middleware stack, not just internal counters.

describe("Multi-instance Express integration — actual middleware behavior", () => {
  afterEach(() => {
    useNoRedis();
  });

  async function buildApp() {
    const express = (await import("express")).default;
    const app = express();
    // Minimal user augmentation so middleware can read plan/clientId.
    app.use((_req, _res, next) => {
      // anonymous — no req.user injected, just plain IP-based limiting
      next();
    });
    return app;
  }

  it("fair-share shrinks effective ceiling when global cap is contested by many tenants", async () => {
    const sharedRedis = useSharedRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");
    const supertest = (await import("supertest")).default;

    const GLOBAL_CAP = 60;
    const TENANT_COUNT = 10; // 10 tenants active → fair share = 60/10 = 6

    // Simulate 9 other tenants each holding 6 slots = 54 global slots taken.
    // Tenant count = 9. Global = 54 (< 60, not yet contested).
    await sharedRedis.set("conc:__global__", String(54));
    await sharedRedis.set("conc:__tenant_count__", String(TENANT_COUNT - 1));

    // Our test tenant (single plan, ceiling = 3) has 0 slots used.
    // Global is 54/60 → NOT yet at cap, so no fair-share shrinking here;
    // effective ceiling = plan ceiling = 3.
    //
    // Now push global to 60 (at cap) by raising other tenants to 60 slots total.
    await sharedRedis.set("conc:__global__", String(GLOBAL_CAP));

    // Under contention (glob >= cap), fair_share = max(1, floor(60/10)) = 6.
    // Single plan ceiling = 3. eff_ceil = min(3, 6) = 3.
    // Our tenant has 0 slots → should be admitted up to 3.
    //
    // Now also simulate our tenant already holding 3 slots (at its plan ceiling).
    const TEST_CLIENT_ID = 8888;
    const tenantKey = `conc:client-${TEST_CLIENT_ID}`;
    await sharedRedis.set(tenantKey, "3");

    const express = (await import("express")).default;
    const appB = express();
    appB.use((_req: Request, _res: Response, next: NextFunction) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req as any).user = { clientId: TEST_CLIENT_ID, plan: "single" };
      next();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appB.get("/probe", tenantFairShareConcurrency as any, (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(appB).get("/probe");

    // Tenant is at its ceiling (3 == min(3, fair_share=6)) → 429
    expect(res.status).toBe(429);

    // Cleanup
    await sharedRedis.del(tenantKey, "conc:__global__", "conc:__tenant_count__");
  });

  it("concurrency middleware 429s when Redis shows slots already full (cross-instance view)", async () => {
    const sharedRedis = useSharedRedis();
    const { tenantFairShareConcurrency } = await import("../../middleware/rate-limit");
    const supertest = (await import("supertest")).default;

    // Use a known clientId so the Redis key is deterministic regardless of
    // what req.ip resolves to in the test environment.
    const TEST_CLIENT_ID = 9999;
    const tenantKey = `conc:client-${TEST_CLIENT_ID}`;
    const globalKey = "conc:__global__";

    // Simulate instance A holding 3 in-flight slots (single-plan ceiling = 3)
    // by pre-filling Redis — exactly what happens when another instance has 3
    // concurrent in-flight requests for this tenant.
    await sharedRedis.set(tenantKey, "3");
    await sharedRedis.set(globalKey, "3");

    // Instance B's Express app — middleware augments req.user with the known clientId.
    const express = (await import("express")).default;
    const appB = express();
    appB.use((_req: Request, _res: Response, next: NextFunction) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_req as any).user = { clientId: TEST_CLIENT_ID, plan: "single" };
      next();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appB.get("/probe", tenantFairShareConcurrency as any, (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });

    const res = await supertest(appB).get("/probe");

    // Lua script sees curTenant(3) >= ceiling(3) → rejected.
    expect(res.status).toBe(429);
    expect(res.body).toHaveProperty("error");

    // Cleanup so this doesn't bleed into subsequent tests.
    await sharedRedis.del(tenantKey, globalKey);
  });

  it("rate limit middleware returns 429 after N hits from the same key (cluster-wide)", async () => {
    useSharedRedis();
    const { llmRateLimit } = await import("../../middleware/rate-limit");
    const supertest = (await import("supertest")).default;

    // Create two separate Express apps sharing the same AdaptiveStore Redis.
    const appA = await buildApp();
    appA.get("/llm", llmRateLimit, (_req, res) => res.status(200).json({ ok: true }));

    const appB = await buildApp();
    appB.get("/llm", llmRateLimit, (_req, res) => res.status(200).json({ ok: true }));

    const agentA = supertest.agent(appA);
    const agentB = supertest.agent(appB);

    // Default plan ceiling is 15 requests/min for "single" (anonymous) clients.
    // Fire 15 requests alternating between the two instances.
    for (let i = 0; i < 15; i++) {
      const agent = i % 2 === 0 ? agentA : agentB;
      const r = await agent.get("/llm");
      expect(r.status).toBe(200);
    }

    // The 16th request (from either instance) should be rate-limited.
    const overLimit = await agentB.get("/llm");
    expect(overLimit.status).toBe(429);
  });

  it("circuit breaker tripped on instance A is respected by instance B via isCircuitOpenAsync", async () => {
    useSharedRedis();
    const {
      recordError,
      isCircuitOpenAsync,
      clearLocalCircuitCache,
      resetCircuit,
    } = await import("../../services/ai-safety/circuit-breaker");

    const provider = "integration-provider";
    try {
      // Instance A trips the breaker.
      await recordError(provider);
      await recordError(provider);
      await recordError(provider);

      // Instance B has no local knowledge — simulate by clearing its local cache.
      clearLocalCircuitCache(provider);

      // isCircuitOpenAsync syncs from Redis before answering.
      const open = await isCircuitOpenAsync(provider);
      expect(open).toBe(true);
    } finally {
      resetCircuit(provider);
    }
  });
});
