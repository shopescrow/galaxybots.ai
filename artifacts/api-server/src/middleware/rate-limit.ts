/**
 * Rate limiting and tenant fair-share concurrency — Redis-backed with fallback.
 *
 * Standard rate limiters use an AdaptiveStore that checks Redis availability on
 * every increment so the store is always current — no post-construction mutation
 * needed. passOnStoreError: true ensures Redis errors degrade gracefully.
 *
 * Tenant concurrency uses a Lua script that atomically reads both the per-tenant
 * and global counters and increments them in a single round trip, eliminating
 * the race between checking and incrementing that exists in a GET→check→INCR
 * sequence.
 *
 * When Redis is absent every limiter falls back to in-memory behaviour so local
 * dev and single-instance deployments need no configuration change.
 */

import rateLimit from "express-rate-limit";
import type { Store, IncrementResponse } from "express-rate-limit";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getRedisClient, withRedis } from "../services/scaling/redis-store";

function getClientKey(req: Request): string {
  if (req.user?.clientId) {
    return `client-${req.user.clientId}`;
  }
  return req.ip || `anon-${Date.now()}`;
}

const PLAN_LLM_LIMITS: Record<string, number> = {
  single: 15,
  team: 30,
  department: 60,
  enterprise: 120,
};

const PLAN_GENERAL_LIMITS: Record<string, number> = {
  single: 100,
  team: 200,
  department: 400,
  enterprise: 800,
};

// ── Adaptive Redis store ───────────────────────────────────────────────────────
// Checks Redis availability on every operation — no fragile post-construction
// mutation, no snapshot of the client at module-load time. When Redis becomes
// available (after initRedis()) all future requests automatically use it.

interface MemoryEntry {
  count: number;
  resetTime: Date;
}

class AdaptiveStore implements Store {
  // Named _keyPrefix (not prefix) to avoid collision with Store's optional public prefix?: string.
  private readonly _keyPrefix: string;
  private readonly windowMs: number;
  private readonly memory: Map<string, MemoryEntry> = new Map();

  constructor(keyPrefix: string, windowMs: number) {
    this._keyPrefix = keyPrefix;
    this.windowMs = windowMs;
  }

  private redisKey(key: string): string {
    return `${this._keyPrefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const client = getRedisClient();
    if (client) {
      try {
        const rk = this.redisKey(key);
        const windowS = Math.ceil(this.windowMs / 1000);
        // Atomically increment and set expiry if this is the first hit.
        const [count, , ttl] = await (client as unknown as {
          eval: (script: string, numkeys: number, ...args: string[]) => Promise<[number, number, number]>;
        }).eval(
          `local v=redis.call('INCR',KEYS[1])
           if v==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end
           local pttl=redis.call('PTTL',KEYS[1])
           return {v,0,pttl}`,
          1,
          rk,
          String(windowS),
        );
        const resetTimeMs = Date.now() + (ttl > 0 ? ttl : this.windowMs);
        return { totalHits: count, resetTime: new Date(resetTimeMs) };
      } catch (err) {
        console.warn("[AdaptiveStore] Redis increment failed — using memory fallback:", (err as Error).message);
      }
    }

    // In-memory fallback.
    const now = Date.now();
    const existing = this.memory.get(key);
    if (existing && existing.resetTime.getTime() > now) {
      existing.count += 1;
      return { totalHits: existing.count, resetTime: existing.resetTime };
    }
    const resetTime = new Date(now + this.windowMs);
    this.memory.set(key, { count: 1, resetTime });
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await (client as unknown as { decr: (k: string) => Promise<number> }).decr(this.redisKey(key));
        return;
      } catch {
        // fall through to memory
      }
    }
    const entry = this.memory.get(key);
    if (entry && entry.count > 0) {
      entry.count -= 1;
    }
  }

  async resetKey(key: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await (client as unknown as { del: (k: string) => Promise<number> }).del(this.redisKey(key));
        return;
      } catch {
        // fall through to memory
      }
    }
    this.memory.delete(key);
  }
}

export const llmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const plan = req.user?.plan || "single";
    return PLAN_LLM_LIMITS[plan] ?? PLAN_LLM_LIMITS.single;
  },
  keyGenerator: getClientKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  message: { error: "Too many requests. Please try again later." },
  store: new AdaptiveStore("rl:llm:", 60 * 1000),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  message: { error: "Too many authentication attempts. Please try again later." },
  store: new AdaptiveStore("rl:auth:", 15 * 60 * 1000),
});

export const portalPinRequestLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: (req: Request) => {
    const body = req.body as { email?: string; phone?: string } | undefined;
    const identifier = body?.email?.toLowerCase() ?? body?.phone;
    return identifier ? `portal-req:${identifier}` : `portal-req-ip:${req.ip ?? "unknown"}`;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  message: { error: "Too many PIN requests for this account. Please try again later." },
  store: new AdaptiveStore("rl:portal-req:", 15 * 60 * 1000),
});

export const portalPinVerifyLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req: Request) => {
    const body = req.body as { email?: string; phone?: string } | undefined;
    const identifier = body?.email?.toLowerCase() ?? body?.phone;
    return identifier ? `portal-ver:${identifier}` : `portal-ver-ip:${req.ip ?? "unknown"}`;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  message: { error: "Too many PIN attempts. Please request a new PIN and try again." },
  store: new AdaptiveStore("rl:portal-ver:", 10 * 60 * 1000),
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: Request) => {
    const plan = req.user?.plan || "single";
    return PLAN_GENERAL_LIMITS[plan] ?? PLAN_GENERAL_LIMITS.single;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  validate: false,
  passOnStoreError: true,
  message: { error: "Too many requests. Please try again later." },
  store: new AdaptiveStore("rl:general:", 60 * 1000),
});

// No longer needed — AdaptiveStore checks Redis availability on each request.
export function rebuildRateLimiters(): void {
  // intentional no-op: AdaptiveStore queries getRedisClient() lazily.
}

// ── Tenant fair-share concurrency ─────────────────────────────────────────────
// Per-plan hard ceiling on concurrent expensive requests.
const PLAN_CONCURRENCY_LIMITS: Record<string, number> = {
  single: 3,
  team: 6,
  department: 12,
  enterprise: 24,
};

// Total concurrent expensive requests the server will run across all tenants
// before fair-share throttling kicks in.
const GLOBAL_CONCURRENCY_CAP = 60;
// Every tenant is always allowed at least this many, even under contention.
const MIN_FAIR_SHARE = 1;

// Redis key prefix for per-tenant active-request counters.
const REDIS_CONC_PREFIX = "conc:";
// Redis key for the global active-request counter.
const REDIS_GLOBAL_KEY = "conc:__global__";
// Redis key tracking how many distinct tenants currently hold at least one slot.
// Used inside the Lua script to compute contention-aware fair-share ceilings.
const REDIS_TENANT_COUNT_KEY = "conc:__tenant_count__";
// Safety TTL — if a server crashes mid-request, counters self-heal after this.
const COUNTER_TTL_S = 120;

/**
 * Atomically check-and-admit a concurrency slot with cluster-wide fair-share.
 *
 * KEYS[1] = tenant key       KEYS[2] = global key   KEYS[3] = tenant-count key
 * ARGV[1] = plan ceiling     ARGV[2] = global cap
 * ARGV[3] = min fair share   ARGV[4] = TTL seconds
 *
 * Returns: {1, newTenant, newGlobal} if admitted
 *          {0, curTenant, curGlobal} if rejected
 *
 * Fair-share computation (mirrors in-memory path):
 *   Under contention (glob >= cap):
 *     fair_share = max(min_fair_share, floor(cap / active_tenants))
 *     eff_ceil   = min(plan_ceil, fair_share)
 *   Without contention: eff_ceil = plan_ceil
 *
 * The tenant-count key is incremented when a tenant's first slot is admitted
 * (counter 0→1) and decremented when its last slot is released (handled in
 * the decrement path below).
 */
const CONCURRENCY_ADMIT_SCRIPT = `
local cur  = tonumber(redis.call('GET',KEYS[1]) or 0)
local glob = tonumber(redis.call('GET',KEYS[2]) or 0)
local tc   = tonumber(redis.call('GET',KEYS[3]) or 1)
local plan = tonumber(ARGV[1])
local cap  = tonumber(ARGV[2])
local min_fs = tonumber(ARGV[3])
local ttl  = tonumber(ARGV[4])

local eff_tenants = math.max(1, tc + (cur == 0 and 1 or 0))
local fair_share  = math.max(min_fs, math.floor(cap / eff_tenants))
local contended   = (glob >= cap)
local eff_ceil    = contended and math.min(plan, fair_share) or plan

if cur >= eff_ceil or glob >= cap then
  return {0, cur, glob}
end

local nt = redis.call('INCR',KEYS[1])
redis.call('EXPIRE',KEYS[1],ttl)
local ng = redis.call('INCR',KEYS[2])
redis.call('EXPIRE',KEYS[2],ttl)

if nt == 1 then
  redis.call('INCR',KEYS[3])
  redis.call('EXPIRE',KEYS[3],ttl)
end

return {1, nt, ng}
`;

// In-memory fallback (single-instance behaviour, unchanged from before).
const activeByTenant = new Map<string, number>();
let globalActive = 0;

function planCeiling(plan: string | undefined): number {
  return PLAN_CONCURRENCY_LIMITS[plan ?? "single"] ?? PLAN_CONCURRENCY_LIMITS.single;
}

async function redisDecr(key: string): Promise<void> {
  await withRedis(async (r) => {
    const val = await r.decr(key);
    if (val <= 0) await r.del(key);
    return true;
  }, false);
}

/**
 * Release a tenant concurrency slot.
 * When the tenant counter drops to 0, also decrement the cluster-wide
 * active-tenant count so fair-share ceilings shrink back correctly.
 */
async function redisConcRelease(tenantKey: string): Promise<void> {
  await withRedis(async (r) => {
    const tenantVal = await r.decr(tenantKey);
    if (tenantVal <= 0) {
      await r.del(tenantKey);
      // This tenant is no longer active — shrink the active-tenant counter.
      const tc = await r.decr(REDIS_TENANT_COUNT_KEY);
      if (tc <= 0) await r.del(REDIS_TENANT_COUNT_KEY);
    }
    return true;
  }, false);
}

/**
 * Bound concurrent in-flight expensive requests per tenant with fair sharing.
 *
 * Redis path: a single Lua script atomically checks the tenant and global
 * counters and increments both only if admission is granted — no race between
 * reading and writing. Slots release via res.finish/close events with a 120 s
 * TTL safety net for crash recovery.
 *
 * In-memory path (Redis absent): unchanged from original implementation.
 *
 * Returns 429 when the tenant is at its effective ceiling.
 */
export const tenantFairShareConcurrency: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const key = getClientKey(req);
  const plan = req.user?.plan;

  const redisClient = getRedisClient();

  if (redisClient) {
    // ── Redis-backed path (cluster-wide, atomic) ──────────────────────────────
    const tenantKey = `${REDIS_CONC_PREFIX}${key}`;
    const ceiling = planCeiling(plan);

    try {
      const result = await (redisClient as unknown as {
        eval: (script: string, numkeys: number, ...args: string[]) => Promise<[number, number, number]>;
      }).eval(
        CONCURRENCY_ADMIT_SCRIPT,
        3,
        tenantKey,
        REDIS_GLOBAL_KEY,
        REDIS_TENANT_COUNT_KEY,
        String(ceiling),
        String(GLOBAL_CONCURRENCY_CAP),
        String(MIN_FAIR_SHARE),
        String(COUNTER_TTL_S),
      );

      const [admitted] = result;
      if (!admitted) {
        res.setHeader("Retry-After", "2");
        res.status(429).json({
          error: "Your account has too many concurrent requests in progress. Please wait for them to finish and retry.",
        });
        return;
      }

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        Promise.all([
          redisConcRelease(tenantKey),
          redisDecr(REDIS_GLOBAL_KEY),
        ]).catch((e) =>
          console.warn("[Concurrency] Redis release failed:", (e as Error).message),
        );
      };
      res.on("finish", release);
      res.on("close", release);
      next();
      return;
    } catch (err) {
      // Redis error — degrade to in-memory for this request.
      console.warn("[Concurrency] Redis eval failed — degrading to in-memory:", (err as Error).message);
    }
  }

  // ── In-memory fallback (single-instance, unchanged behaviour) ───────────────
  const current = activeByTenant.get(key) ?? 0;
  const contended = globalActive >= GLOBAL_CONCURRENCY_CAP;
  const activeTenants = activeByTenant.size + (current === 0 ? 1 : 0);
  const fairShare = Math.max(MIN_FAIR_SHARE, Math.floor(GLOBAL_CONCURRENCY_CAP / Math.max(1, activeTenants)));
  const ceiling = contended ? Math.min(planCeiling(plan), fairShare) : planCeiling(plan);

  if (current >= ceiling) {
    res.setHeader("Retry-After", "2");
    res.status(429).json({
      error: "Your account has too many concurrent requests in progress. Please wait for them to finish and retry.",
    });
    return;
  }

  activeByTenant.set(key, current + 1);
  globalActive += 1;

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (activeByTenant.get(key) ?? 1) - 1;
    if (n <= 0) activeByTenant.delete(key);
    else activeByTenant.set(key, n);
    globalActive = Math.max(0, globalActive - 1);
  };

  res.on("finish", release);
  res.on("close", release);
  next();
};
