/**
 * Per-tenant token quota enforcement — Redis-backed, in-memory fallback.
 *
 * Two layers of enforcement using atomic "reserve-first" admission:
 *
 * 1. PER-MINUTE THROUGHPUT CAP (burst protection — shared capacity fairness)
 *    Redis key: quota:rpm:{clientId}:{minuteBucket}   STRING  INCRBY at ADMISSION
 *    Derived cap: ceil(monthlyTokenCap / 1000) tokens/minute.
 *    Tokens are incremented BEFORE dispatch, then rolled back if ALL retries fail.
 *    This prevents concurrent burst traffic from all passing admission before any
 *    counter update lands.
 *
 * 2. MONTHLY QUOTA (hard ceiling)
 *    Redis key: quota:tokens:{clientId}:{YYYY-MM}   STRING  INCRBY at ADMISSION
 *    The admission function increments FIRST, then checks against the cap.
 *    If over cap: DECRBY (rollback) before returning denied/degraded result.
 *    This ensures concurrent requests cannot all slip through on a stale GET.
 *    Bootstrapped from llm_usage_log on key-miss so Redis flush does not reset
 *    the counter to 0.
 *    After call: reconcileTokenUsage() adjusts by (actual - estimated).
 *
 * Degradation policies (applied at monthly hard-cap):
 *   "downgrade" : continue on EFFICIENT tier (default)
 *   "shed"      : same as downgrade — shed expensive models, serve on EFFICIENT tier
 *   "reject"    : return allowed=false; caller throws QuotaExceededError
 *
 * When Redis is absent: checks fall through to DB read (monthly) or are skipped
 * (per-minute), preserving backward compatibility on single-instance deployments.
 */

import { db, clientTokenQuotasTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { withRedis, getRedisClient } from "../scaling/redis-store";
import type { ModelTier } from "./model-fallback";
import { llmUsageLogTable } from "@workspace/db";

export type DegradationPolicy = "downgrade" | "shed" | "reject";

export interface TokenQuotaConfig {
  clientId: number;
  monthlyTokenCap: number;
  softLimitPct: number;
  degradationPolicy: DegradationPolicy;
  alertAt80Pct: boolean;
  /** Derived burst cap: ceil(monthlyTokenCap / 1000) tokens/minute. 0 = unlimited. */
  tokensPerMinuteCap: number;
}

export interface QuotaAdmissionResult {
  allowed: boolean;
  degradedTier?: ModelTier;
  reason?: string;
  tokensUsedThisMonth: number;
  capTokens: number;
  /** True when per-minute throughput window triggered the downgrade. */
  throughputThrottled?: boolean;
  /** Tokens actually reserved in Redis (must be passed to reconcileTokenUsage). */
  reservedMonthlyTokens: number;
  /** Tokens reserved in the per-minute window (must be rolled back on call failure). */
  reservedMinuteTokens: number;
}

const configCache = new Map<number, { config: TokenQuotaConfig; cachedAt: number }>();
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const MONTHLY_KEY_TTL_S = 32 * 24 * 3600;
const MINUTE_KEY_TTL_S = 120;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthlyRedisKey(clientId: number): string {
  return `quota:tokens:${clientId}:${currentMonthKey()}`;
}

function minuteRedisKey(clientId: number): string {
  const bucket = Math.floor(Date.now() / 60_000);
  return `quota:rpm:${clientId}:${bucket}`;
}

export async function getTokenQuotaConfig(clientId: number): Promise<TokenQuotaConfig | null> {
  const cached = configCache.get(clientId);
  if (cached && Date.now() - cached.cachedAt < CONFIG_CACHE_TTL_MS) return cached.config;

  try {
    const [row] = await db
      .select()
      .from(clientTokenQuotasTable)
      .where(eq(clientTokenQuotasTable.clientId, clientId));

    const base: TokenQuotaConfig = {
      clientId,
      monthlyTokenCap: 0,
      softLimitPct: 80,
      degradationPolicy: "downgrade",
      alertAt80Pct: true,
      tokensPerMinuteCap: 0,
    };

    if (!row) {
      configCache.set(clientId, { config: base, cachedAt: Date.now() });
      return null;
    }

    const monthlyTokenCap = row.monthlyTokenCap;
    const config: TokenQuotaConfig = {
      clientId,
      monthlyTokenCap,
      softLimitPct: row.softLimitPct,
      degradationPolicy: row.degradationPolicy as DegradationPolicy,
      alertAt80Pct: row.alertAt80Pct,
      tokensPerMinuteCap: monthlyTokenCap > 0 ? Math.ceil(monthlyTokenCap / 1000) : 0,
    };
    configCache.set(clientId, { config, cachedAt: Date.now() });
    return config;
  } catch (err) {
    console.error("[TenantQuota] Failed to load quota config:", err);
    return null;
  }
}

export function invalidateTokenQuotaCache(clientId: number): void {
  configCache.delete(clientId);
}

/**
 * Read this month's total tokens from llm_usage_log (DB authoritative source).
 */
async function getMonthlyTokensFromDb(clientId: number): Promise<number> {
  try {
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const result = await db
      .select({
        total: sql<string>`COALESCE(SUM(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens}), 0)`,
      })
      .from(llmUsageLogTable)
      .where(
        sql`${llmUsageLogTable.clientId} = ${clientId} AND ${llmUsageLogTable.calledAt} >= ${monthStart}`,
      );
    return parseInt(result[0]?.total ?? "0", 10);
  } catch {
    return 0;
  }
}

/**
 * Ensure the monthly Redis key exists and is seeded from DB.
 * Uses SET NX so only the first caller seeds it; concurrent callers wait for
 * the key to exist before their subsequent INCRBY.
 */
async function ensureMonthlyKeyBootstrapped(
  r: { get: (k: string) => Promise<string | null>; set: (...args: unknown[]) => Promise<unknown> },
  key: string,
  clientId: number,
): Promise<void> {
  const existing = await r.get(key);
  if (existing !== null) return; // already seeded

  const dbTokens = await getMonthlyTokensFromDb(clientId);
  // SET NX: only sets if key doesn't exist yet (handles concurrent bootstraps).
  await r.set(key, String(dbTokens > 0 ? dbTokens : 0), "NX", "EX", MONTHLY_KEY_TTL_S);
}

/**
 * Atomically reserve tokens in the per-minute bucket at admission time.
 *
 * Increments BEFORE the call so concurrent requests cannot all pass admission
 * on a stale read. Rolls back if over the burst cap.
 *
 * @returns tokens actually reserved (0 if Redis unavailable or over cap)
 */
async function reserveMinuteTokens(
  clientId: number,
  estimatedTokens: number,
  minuteCap: number,
): Promise<{ reserved: number; overCap: boolean }> {
  if (minuteCap <= 0) return { reserved: 0, overCap: false };

  const result = await withRedis(async (r) => {
    const key = minuteRedisKey(clientId);
    const newVal = await r.incrby(key, estimatedTokens);
    if (newVal === estimatedTokens) {
      await r.expire(key, MINUTE_KEY_TTL_S);
    }
    if (newVal > minuteCap) {
      // Over burst cap — roll back and report as throttled.
      await r.decrby(key, estimatedTokens);
      return { reserved: 0, overCap: true };
    }
    return { reserved: estimatedTokens, overCap: false };
  }, { reserved: 0, overCap: false }); // optimistic allow when Redis down

  return result;
}

/**
 * Roll back a per-minute reservation (called if the entire call chain fails).
 */
async function rollbackMinuteTokens(clientId: number, reserved: number): Promise<void> {
  if (reserved <= 0) return;
  await withRedis((r) => r.decrby(minuteRedisKey(clientId), reserved), null).catch((err) =>
    console.warn("[TenantQuota] minute rollback failed:", (err as Error).message),
  );
}

/**
 * Atomically reserve tokens in the monthly bucket at admission time.
 *
 * Pattern: bootstrap from DB if key missing → INCRBY → if over cap, DECRBY rollback.
 * Concurrent requests each atomically claim their tokens, preventing the
 * read-then-increment race that lets bursts exceed the cap.
 *
 * @returns { admitted, newTotal, reserved } — reserved=0 if not admitted or Redis down
 */
async function reserveMonthlyTokens(
  clientId: number,
  estimatedTokens: number,
  cap: number,
): Promise<{ admitted: boolean; newTotal: number; reserved: number }> {
  if (!getRedisClient()) {
    // Redis unavailable: fall back to DB read (no atomic guarantee, but best effort).
    const dbUsed = await getMonthlyTokensFromDb(clientId).catch(() => 0);
    const admitted = cap <= 0 || dbUsed + estimatedTokens <= cap;
    return { admitted, newTotal: dbUsed, reserved: 0 };
  }

  return withRedis(async (r) => {
    const key = monthlyRedisKey(clientId);

    // Bootstrap from DB if key is absent (Redis flush / first access this month).
    await ensureMonthlyKeyBootstrapped(r as Parameters<typeof ensureMonthlyKeyBootstrapped>[0], key, clientId);

    // Atomic reservation: INCRBY, then check.
    const newVal = await r.incrby(key, estimatedTokens);
    if (newVal === estimatedTokens) {
      // Key may have just been created (bootstrap returned 0). Set TTL.
      await r.expire(key, MONTHLY_KEY_TTL_S);
    }

    if (cap > 0 && newVal > cap) {
      // Over hard cap — roll back the reservation and report.
      await r.decrby(key, estimatedTokens);
      return { admitted: false, newTotal: newVal - estimatedTokens, reserved: 0 };
    }

    return { admitted: true, newTotal: newVal, reserved: estimatedTokens };
  }, { admitted: true, newTotal: 0, reserved: 0 }); // optimistic allow when Redis errors
}

/**
 * Check admission for an estimated token count using atomic reserve-first pattern.
 *
 * Order:
 *   1. Per-minute burst cap → degrade to EFFICIENT (never reject), rollback on admission fail
 *   2. Monthly soft limit → degrade to EFFICIENT (no rollback — within cap)
 *   3. Monthly hard cap → reject / degrade per policy (rollback on reject)
 *
 * The returned `reservedMonthlyTokens` and `reservedMinuteTokens` MUST be passed
 * to reconcileTokenUsage() on success or rollbackTokenReservation() on total failure.
 */
export async function checkTokenQuotaAdmission(
  clientId: number,
  estimatedTokens: number,
): Promise<QuotaAdmissionResult> {
  const config = await getTokenQuotaConfig(clientId);

  if (!config || config.monthlyTokenCap <= 0) {
    return {
      allowed: true,
      tokensUsedThisMonth: 0,
      capTokens: 0,
      reservedMonthlyTokens: 0,
      reservedMinuteTokens: 0,
    };
  }

  const { ModelTier: MT } = await import("./model-fallback.js");

  // ── 1. Per-minute throughput check (burst / fairness) ─────────────────────
  const minuteResult = await reserveMinuteTokens(
    clientId,
    estimatedTokens,
    config.tokensPerMinuteCap,
  );
  if (minuteResult.overCap) {
    // Shed / reject policies turn throughput overruns into hard denials.
    // Downgrade policy (default) degrades to efficient tier but still admits.
    if (config.degradationPolicy === "shed" || config.degradationPolicy === "reject") {
      return {
        allowed: false,
        reason: `Per-minute throughput cap (${config.tokensPerMinuteCap.toLocaleString()} tokens/minute) reached. Retry after the current minute window.`,
        tokensUsedThisMonth: 0,
        capTokens: config.monthlyTokenCap,
        throughputThrottled: true,
        reservedMonthlyTokens: 0,
        reservedMinuteTokens: 0,
      };
    }
    return {
      allowed: true,
      degradedTier: MT.EFFICIENT,
      reason: `Per-minute throughput cap (${config.tokensPerMinuteCap.toLocaleString()} tokens/minute) reached — switched to efficient tier to protect shared capacity.`,
      tokensUsedThisMonth: 0,
      capTokens: config.monthlyTokenCap,
      throughputThrottled: true,
      reservedMonthlyTokens: 0,
      reservedMinuteTokens: 0,
    };
  }

  // ── 2 & 3. Monthly quota check (atomic INCRBY-first) ──────────────────────
  const softLimit = Math.floor((config.softLimitPct / 100) * config.monthlyTokenCap);
  const { admitted, newTotal, reserved } = await reserveMonthlyTokens(
    clientId,
    estimatedTokens,
    config.monthlyTokenCap,
  );

  if (!admitted) {
    // Over hard cap — reservation was rolled back.
    await rollbackMinuteTokens(clientId, minuteResult.reserved);

    if (config.degradationPolicy === "reject") {
      return {
        allowed: false,
        reason: `Monthly token quota exhausted (${newTotal.toLocaleString()} / ${config.monthlyTokenCap.toLocaleString()} tokens used). Please contact support to increase your limit.`,
        tokensUsedThisMonth: newTotal,
        capTokens: config.monthlyTokenCap,
        reservedMonthlyTokens: 0,
        reservedMinuteTokens: 0,
      };
    }
    // "shed" or "downgrade": allow but degrade. No reservation held (monthly rolled
    // back above, minute rolled back by rollbackMinuteTokens — both return 0).
    return {
      allowed: true,
      degradedTier: MT.EFFICIENT,
      reason: `Monthly token quota exceeded — degraded to efficient tier (${newTotal.toLocaleString()} / ${config.monthlyTokenCap.toLocaleString()} tokens).`,
      tokensUsedThisMonth: newTotal,
      capTokens: config.monthlyTokenCap,
      reservedMonthlyTokens: 0,
      reservedMinuteTokens: 0,
    };
  }

  // Within cap — check soft limit.
  if (newTotal > softLimit) {
    return {
      allowed: true,
      degradedTier: MT.EFFICIENT,
      reason: `Approaching monthly token quota (${newTotal.toLocaleString()} / ${config.monthlyTokenCap.toLocaleString()} tokens) — switched to efficient tier.`,
      tokensUsedThisMonth: newTotal,
      capTokens: config.monthlyTokenCap,
      reservedMonthlyTokens: reserved,
      reservedMinuteTokens: minuteResult.reserved,
    };
  }

  return {
    allowed: true,
    tokensUsedThisMonth: newTotal,
    capTokens: config.monthlyTokenCap,
    reservedMonthlyTokens: reserved,
    reservedMinuteTokens: minuteResult.reserved,
  };
}

/**
 * Reconcile actual vs estimated token usage after a successful LLM call.
 *
 * Adjusts the monthly counter by (actual - estimated). The per-minute counter
 * is NOT adjusted — it self-expires in 120s and is a burst-rate signal only.
 * Fire-and-forget; never throws.
 */
export function reconcileTokenUsage(
  clientId: number,
  estimatedReserved: number,
  actualTokens: number,
): void {
  const diff = actualTokens - estimatedReserved;
  if (diff === 0) return;

  withRedis(async (r) => {
    const key = monthlyRedisKey(clientId);
    if (diff > 0) {
      await r.incrby(key, diff);
    } else {
      await r.decrby(key, -diff);
    }
  }, null).catch((err) =>
    console.warn("[TenantQuota] reconcile failed:", (err as Error).message),
  );
}

/**
 * Roll back a monthly + minute reservation on total call failure.
 * Called when ALL models in the fallback chain fail so no tokens were consumed.
 * Fire-and-forget; never throws.
 */
export function rollbackTokenReservation(
  clientId: number,
  reservedMonthly: number,
  reservedMinute: number,
): void {
  if (reservedMonthly > 0) {
    withRedis(async (r) => {
      await r.decrby(monthlyRedisKey(clientId), reservedMonthly);
    }, null).catch((err) =>
      console.warn("[TenantQuota] monthly rollback failed:", (err as Error).message),
    );
  }
  if (reservedMinute > 0) {
    rollbackMinuteTokens(clientId, reservedMinute).catch((err) =>
      console.warn("[TenantQuota] minute rollback on failure:", (err as Error).message),
    );
  }
}

/**
 * Get the current month's token count for external callers (e.g., analytics routes).
 */
export async function getMonthlyTokenCount(clientId: number): Promise<number> {
  if (!getRedisClient()) return getMonthlyTokensFromDb(clientId).catch(() => 0);

  // Pre-resolve the DB fallback so withRedis infers T = number, not Promise<number>.
  const dbFallback = await getMonthlyTokensFromDb(clientId).catch(() => 0);
  return withRedis(async (r) => {
    const key = monthlyRedisKey(clientId);
    const existing = await r.get(key);
    if (existing !== null) return parseInt(existing, 10);
    return dbFallback;
  }, dbFallback);
}

/** @deprecated Use reconcileTokenUsage instead. Kept for any external callers. */
export function recordTokenUsage(clientId: number, totalTokens: number): void {
  reconcileTokenUsage(clientId, 0, totalTokens);
}
