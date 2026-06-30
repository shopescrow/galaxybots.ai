/**
 * Real-time budget enforcement at the routing admission point.
 *
 * Uses an atomic "reserve-first" pattern to prevent concurrent requests from
 * all passing admission on a stale counter read:
 *   1. INCRBY estimated cost at admission time.
 *   2. Read new total; if over cap → DECRBY (rollback), return denied/degraded.
 *   3. After call → reconcile with actual cost (INCRBY actual - estimated, can be
 *      negative). On total chain failure → DECRBY estimated (rollback).
 *
 * Redis key layout (all values in micro-USD — integer avoids float precision loss):
 *   budget:spend:{clientId}:{YYYY-MM}   per-tenant cumulative spend
 *   budget:global:{YYYY-MM}             cluster-wide cumulative spend (ALL tenants)
 *
 * Global cap enforcement is UNCONDITIONAL — checked and recorded for every billable
 * call regardless of whether a clientId is present. This ensures the global ceiling
 * is a true cluster-wide guard, not just a per-tenant one.
 *
 * Global cap source: GLOBAL_LLM_MONTHLY_CAP_USD env var (0 = unlimited).
 * Per-tenant cap source: client_cost_caps table (getCostCap).
 *
 * On Redis key-miss (first access this month or after flush): both per-tenant and
 * global counters are bootstrapped from DB (llm_usage_log) before the INCRBY,
 * so enforcement accuracy is preserved after Redis flush.
 */

import { getMonthlySpend, getCostCap } from "../analytics/cost-caps";
import { withRedis, getRedisClient } from "../scaling/redis-store";
import { db, llmUsageLogTable } from "@workspace/db";
import { sql, gte } from "drizzle-orm";
import type { ModelTier } from "./model-fallback";

const MICRO_USD = 1_000_000;
const SPEND_KEY_TTL_S = 32 * 24 * 3600;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tenantSpendKey(clientId: number): string {
  return `budget:spend:${clientId}:${currentMonth()}`;
}

function globalSpendKey(): string {
  return `budget:global:${currentMonth()}`;
}

export interface BudgetAdmissionResult {
  allowed: boolean;
  degradedTier?: ModelTier;
  reason?: string;
  spendUsd: number;
  capUsd: number;
  globalSpendUsd: number;
  globalCapUsd: number;
  pctUsed: number;
  /** Micro-USD reserved in per-tenant key; pass to reconcileBudgetSpend on completion. */
  reservedTenantMicroUsd: number;
  /** Micro-USD reserved in global key; pass to reconcileBudgetSpend on completion. */
  reservedGlobalMicroUsd: number;
}

interface CapCache {
  capUsd: number;
  alertAt80Pct: boolean;
  pauseAutonomousOnExhaust: boolean;
  cachedAt: number;
}

const capCache = new Map<number, CapCache>();
const CAP_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadCap(clientId: number): Promise<CapCache> {
  const cached = capCache.get(clientId);
  if (cached && Date.now() - cached.cachedAt < CAP_CACHE_TTL_MS) return cached;

  const cap = await getCostCap(clientId);
  const entry: CapCache = {
    capUsd: cap ? parseFloat(cap.monthlyCapUsd) : 0,
    alertAt80Pct: cap?.alertAt80Pct ?? true,
    pauseAutonomousOnExhaust: cap?.pauseAutonomousOnExhaust ?? false,
    cachedAt: Date.now(),
  };
  capCache.set(clientId, entry);
  return entry;
}

export function invalidateBudgetCache(clientId: number): void {
  capCache.delete(clientId);
}

export function getGlobalCapUsd(): number {
  const raw = process.env["GLOBAL_LLM_MONTHLY_CAP_USD"];
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Read global spend from DB (bootstrap source). */
async function getGlobalMonthlySpendFromDb(): Promise<number> {
  try {
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const result = await db
      .select({ total: sql<string>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)` })
      .from(llmUsageLogTable)
      .where(gte(llmUsageLogTable.calledAt, monthStart));
    return parseFloat(result[0]?.total ?? "0");
  } catch {
    return 0;
  }
}

/**
 * Ensure a Redis spend key is bootstrapped from DB on first access.
 * Uses SET NX so concurrent callers don't race — only one seeds the key.
 */
async function ensureSpendKeyBootstrapped(
  r: { get: (k: string) => Promise<string | null>; set: (...a: unknown[]) => Promise<unknown> },
  key: string,
  dbSpendUsd: number,
): Promise<void> {
  const existing = await r.get(key);
  if (existing !== null) return;
  const microUsd = Math.round(dbSpendUsd * MICRO_USD);
  await r.set(key, String(microUsd >= 0 ? microUsd : 0), "NX", "EX", SPEND_KEY_TTL_S);
}

/**
 * Atomically reserve estimated spend in a Redis key.
 * Pattern: INCRBY → if over cap, DECRBY rollback.
 *
 * @returns { reservedMicroUsd, totalMicroUsd, overCap }
 */
async function atomicReserveSpend(
  r: { incrby: (k: string, v: number) => Promise<number>; decrby: (k: string, v: number) => Promise<number>; expire: (k: string, ttl: number) => Promise<number> },
  key: string,
  estimatedMicroUsd: number,
  capMicroUsd: number,
): Promise<{ reservedMicroUsd: number; totalMicroUsd: number; overCap: boolean }> {
  const newVal = await r.incrby(key, estimatedMicroUsd);
  if (newVal === estimatedMicroUsd) {
    await r.expire(key, SPEND_KEY_TTL_S);
  }
  if (capMicroUsd > 0 && newVal > capMicroUsd) {
    await r.decrby(key, estimatedMicroUsd);
    return { reservedMicroUsd: 0, totalMicroUsd: newVal - estimatedMicroUsd, overCap: true };
  }
  return { reservedMicroUsd: estimatedMicroUsd, totalMicroUsd: newVal, overCap: false };
}

/**
 * Check GLOBAL budget admission only — called unconditionally (no clientId required).
 *
 * Returns null when no global cap is configured (unlimited).
 * Returns BudgetAdmissionResult with allowed=false when global cap is exceeded.
 */
export async function checkGlobalBudgetAdmission(
  estimatedCostUsd: number,
): Promise<{ allowed: boolean; degradedTier?: ModelTier; reason?: string; reservedGlobalMicroUsd: number } | null> {
  const globalCapUsd = getGlobalCapUsd();
  if (globalCapUsd <= 0) return null; // no global cap configured

  const estimatedMicroUsd = Math.round(estimatedCostUsd * MICRO_USD);
  if (estimatedMicroUsd <= 0) return null;

  if (!getRedisClient()) {
    // Redis unavailable: best-effort check via DB
    const globalSpend = await getGlobalMonthlySpendFromDb().catch(() => 0);
    const pct = ((globalSpend + estimatedCostUsd) / globalCapUsd) * 100;
    const { ModelTier: MT } = await import("./model-fallback.js");
    if (pct >= 100) {
      return { allowed: false, reason: `Global LLM spend ceiling reached ($${globalSpend.toFixed(4)} / $${globalCapUsd.toFixed(2)}).`, reservedGlobalMicroUsd: 0 };
    }
    if (pct >= 80) {
      return { allowed: true, degradedTier: MT.EFFICIENT, reason: `Global LLM spend at ${Math.round(pct)}% — all tenants on efficient tier.`, reservedGlobalMicroUsd: 0 };
    }
    return null;
  }

  return withRedis(async (r) => {
    const key = globalSpendKey();
    // Bootstrap from DB on key-miss
    const dbSpend = await getGlobalMonthlySpendFromDb().catch(() => 0);
    await ensureSpendKeyBootstrapped(r as Parameters<typeof ensureSpendKeyBootstrapped>[0], key, dbSpend);

    const capMicroUsd = Math.round(globalCapUsd * MICRO_USD);
    const { reservedMicroUsd, totalMicroUsd, overCap } = await atomicReserveSpend(
      r as Parameters<typeof atomicReserveSpend>[0], key, estimatedMicroUsd, capMicroUsd,
    );

    const totalUsd = totalMicroUsd / MICRO_USD;
    const pct = (totalUsd / globalCapUsd) * 100;
    const { ModelTier: MT } = await import("./model-fallback.js");

    if (overCap) {
      return {
        allowed: false,
        reason: `Global LLM spend ceiling reached ($${totalUsd.toFixed(4)} / $${globalCapUsd.toFixed(2)}). All AI operations paused until next billing period.`,
        reservedGlobalMicroUsd: 0,
      };
    }

    if (pct >= 80) {
      return {
        allowed: true,
        degradedTier: MT.EFFICIENT,
        reason: `Global LLM spend at ${Math.round(pct)}% of ceiling ($${totalUsd.toFixed(4)} / $${globalCapUsd.toFixed(2)}) — all tenants on efficient tier.`,
        reservedGlobalMicroUsd: reservedMicroUsd,
      };
    }

    return { allowed: true, reservedGlobalMicroUsd: reservedMicroUsd };
  }, null);
}

/**
 * Check per-tenant AND global budget admission with atomic reservation.
 *
 * Global cap is always checked first (even without per-tenant cap).
 * Per-tenant check follows.
 *
 * The returned `reservedTenantMicroUsd` and `reservedGlobalMicroUsd` must be
 * passed to reconcileBudgetSpend() on success or rollbackBudgetReservation() on failure.
 */
export async function checkBudgetAdmission(
  clientId: number,
  estimatedCostUsd: number,
): Promise<BudgetAdmissionResult> {
  const estimatedMicroUsd = Math.max(0, Math.round(estimatedCostUsd * MICRO_USD));

  // ── Global cap check (atomic) ──────────────────────────────────────────────
  const globalCapUsd = getGlobalCapUsd();
  let globalReservedMicroUsd = 0;
  let globalSpendUsd = 0;

  // Always call checkGlobalBudgetAdmission — it has its own DB fallback when Redis
  // is unavailable, so the global cap is enforced even during Redis outages.
  // IMPORTANT: global degradedTier does NOT short-circuit per-tenant cap checks.
  // Both dimensions must be enforced independently; tenants over their own cap
  // must be denied even when the global ceiling is only in the "degrade" band.
  let globalForcedTier: ModelTier | undefined;
  let globalDegradeReason: string | undefined;
  if (globalCapUsd > 0 && estimatedMicroUsd > 0) {
    const globalResult = await checkGlobalBudgetAdmission(estimatedCostUsd);
    if (globalResult) {
      globalReservedMicroUsd = globalResult.reservedGlobalMicroUsd;
      if (!globalResult.allowed) {
        // Hard global denial — return immediately (no per-tenant check needed).
        return {
          allowed: false,
          reason: globalResult.reason,
          spendUsd: 0,
          capUsd: 0,
          globalSpendUsd: 0,
          globalCapUsd,
          pctUsed: 100,
          reservedTenantMicroUsd: 0,
          reservedGlobalMicroUsd: 0,
        };
      }
      if (globalResult.degradedTier) {
        // Global 80%+ — record the degrade signal but still run per-tenant checks.
        globalForcedTier = globalResult.degradedTier;
        globalDegradeReason = globalResult.reason;
      }
    }
  }

  // ── Per-tenant cap check (atomic) ─────────────────────────────────────────
  const cap = await loadCap(clientId);

  if (cap.capUsd <= 0) {
    // No tenant cap configured — global degrade still applies.
    return {
      allowed: true,
      ...(globalForcedTier && { degradedTier: globalForcedTier, reason: globalDegradeReason }),
      spendUsd: 0,
      capUsd: 0,
      globalSpendUsd: globalSpendUsd,
      globalCapUsd,
      pctUsed: 0,
      reservedTenantMicroUsd: 0,
      reservedGlobalMicroUsd: globalReservedMicroUsd,
    };
  }

  if (!getRedisClient()) {
    // Redis unavailable: DB fallback (no atomicity guarantee)
    const spendUsd = await getMonthlySpend(clientId).catch(() => 0);
    const projectedPct = ((spendUsd + estimatedCostUsd) / cap.capUsd) * 100;
    const { ModelTier: MT } = await import("./model-fallback.js");

    if (projectedPct >= 100) {
      return cap.pauseAutonomousOnExhaust
        ? { allowed: false, reason: `Monthly spend cap reached ($${spendUsd.toFixed(4)} / $${cap.capUsd.toFixed(2)}).`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: 100, reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: globalReservedMicroUsd }
        : { allowed: true, degradedTier: MT.EFFICIENT, reason: `Monthly cap reached — efficient tier.`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: 100, reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: globalReservedMicroUsd };
    }
    if (projectedPct >= 80 && cap.alertAt80Pct) {
      return { allowed: true, degradedTier: MT.EFFICIENT, reason: `Spend at ${Math.round(projectedPct)}% of cap — efficient tier.`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(projectedPct), reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: globalReservedMicroUsd };
    }
    return { allowed: true, ...(globalForcedTier && { degradedTier: globalForcedTier, reason: globalDegradeReason }), spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(projectedPct), reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: globalReservedMicroUsd };
  }

  return withRedis(async (r) => {
    const key = tenantSpendKey(clientId);
    // Bootstrap from DB on key-miss
    const dbSpend = await getMonthlySpend(clientId).catch(() => 0);
    await ensureSpendKeyBootstrapped(r as Parameters<typeof ensureSpendKeyBootstrapped>[0], key, dbSpend);

    const capMicroUsd = Math.round(cap.capUsd * MICRO_USD);
    const { reservedMicroUsd, totalMicroUsd, overCap } = await atomicReserveSpend(
      r as Parameters<typeof atomicReserveSpend>[0], key, estimatedMicroUsd, capMicroUsd,
    );

    const spendUsd = totalMicroUsd / MICRO_USD;
    const pctUsed = (spendUsd / cap.capUsd) * 100;
    const { ModelTier: MT } = await import("./model-fallback.js");

    if (overCap) {
      // Roll back global reservation too since we're rejecting.
      if (globalReservedMicroUsd > 0) {
        await r.decrby(globalSpendKey(), globalReservedMicroUsd).catch(() => null);
        globalReservedMicroUsd = 0;
      }
      if (cap.pauseAutonomousOnExhaust) {
        return { allowed: false, reason: `Monthly spend cap reached ($${spendUsd.toFixed(4)} / $${cap.capUsd.toFixed(2)}). Autonomous operations paused.`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(pctUsed), reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: 0 };
      }
      return { allowed: true, degradedTier: MT.EFFICIENT, reason: `Monthly spend cap reached ($${spendUsd.toFixed(4)} / $${cap.capUsd.toFixed(2)}) — efficient tier.`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(pctUsed), reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: 0 };
    }

    if (pctUsed >= 80 && cap.alertAt80Pct) {
      return { allowed: true, degradedTier: MT.EFFICIENT, reason: `Spend at ${Math.round(pctUsed)}% of monthly cap ($${spendUsd.toFixed(4)} / $${cap.capUsd.toFixed(2)}) — efficient tier.`, spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(pctUsed), reservedTenantMicroUsd: reservedMicroUsd, reservedGlobalMicroUsd: globalReservedMicroUsd };
    }

    return { allowed: true, ...(globalForcedTier && { degradedTier: globalForcedTier, reason: globalDegradeReason }), spendUsd, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: Math.round(pctUsed), reservedTenantMicroUsd: reservedMicroUsd, reservedGlobalMicroUsd: globalReservedMicroUsd };
  }, { allowed: true, ...(globalForcedTier && { degradedTier: globalForcedTier, reason: globalDegradeReason }), spendUsd: 0, capUsd: cap.capUsd, globalSpendUsd, globalCapUsd, pctUsed: 0, reservedTenantMicroUsd: 0, reservedGlobalMicroUsd: globalReservedMicroUsd });
}

/**
 * Reconcile actual vs estimated spend after a successful call.
 * Adjusts both per-tenant and global keys by (actualMicroUsd - reservedMicroUsd).
 * Fire-and-forget; never throws.
 */
export function reconcileBudgetSpend(
  clientId: number | null,
  reservedTenantMicroUsd: number,
  reservedGlobalMicroUsd: number,
  actualCostUsd: number,
): void {
  const actualMicroUsd = Math.max(0, Math.round(actualCostUsd * MICRO_USD));

  // Adjust global key (unconditionally for every billable call).
  const globalDiff = actualMicroUsd - reservedGlobalMicroUsd;
  if (globalDiff !== 0 || (reservedGlobalMicroUsd === 0 && actualMicroUsd > 0)) {
    withRedis(async (r) => {
      const key = globalSpendKey();
      if (globalDiff > 0) {
        const newVal = await r.incrby(key, globalDiff > 0 ? globalDiff : actualMicroUsd);
        if (newVal === actualMicroUsd) await r.expire(key, SPEND_KEY_TTL_S);
      } else if (globalDiff < 0) {
        await r.decrby(key, -globalDiff);
      }
    }, null).catch((e) =>
      console.warn("[BudgetEnforcer] global reconcile failed:", (e as Error).message),
    );
  }

  // Adjust per-tenant key.
  if (clientId === null) return;
  const tenantDiff = actualMicroUsd - reservedTenantMicroUsd;
  if (tenantDiff !== 0 || (reservedTenantMicroUsd === 0 && actualMicroUsd > 0)) {
    withRedis(async (r) => {
      const key = tenantSpendKey(clientId);
      if (tenantDiff > 0) {
        const newVal = await r.incrby(key, tenantDiff > 0 ? tenantDiff : actualMicroUsd);
        if (newVal === actualMicroUsd) await r.expire(key, SPEND_KEY_TTL_S);
      } else if (tenantDiff < 0) {
        await r.decrby(key, -tenantDiff);
      }
    }, null).catch((e) =>
      console.warn("[BudgetEnforcer] tenant reconcile failed:", (e as Error).message),
    );
  }
}

/**
 * Roll back budget reservations on total call chain failure.
 * Called when ALL models in the fallback chain fail and no tokens were consumed.
 * Fire-and-forget; never throws.
 */
export function rollbackBudgetReservation(
  clientId: number | null,
  reservedTenantMicroUsd: number,
  reservedGlobalMicroUsd: number,
): void {
  if (reservedGlobalMicroUsd > 0) {
    withRedis(async (r) => { await r.decrby(globalSpendKey(), reservedGlobalMicroUsd); }, null)
      .catch((e) => console.warn("[BudgetEnforcer] global rollback failed:", (e as Error).message));
  }
  if (clientId !== null && reservedTenantMicroUsd > 0) {
    withRedis(async (r) => { await r.decrby(tenantSpendKey(clientId), reservedTenantMicroUsd); }, null)
      .catch((e) => console.warn("[BudgetEnforcer] tenant rollback failed:", (e as Error).message));
  }
}

/** @deprecated Use reconcileBudgetSpend instead. */
export function recordBudgetSpend(clientId: number, costUsd: number): void {
  reconcileBudgetSpend(clientId, 0, 0, costUsd);
}
