/**
 * Cluster-wide, per-tenant metric rollup service.
 *
 * Reads raw llm_usage_log rows and upserts hourly aggregate buckets into
 * tenant_metric_rollups.  Because the source table lives in Postgres (shared
 * across all API instances) the rollup is automatically cluster-wide — no
 * Redis needed for the aggregation step itself.
 *
 * The job runs every 5 minutes and only touches the current and previous
 * calendar-hour buckets so the query is always bounded.
 */

import { db, llmUsageLogTable, tenantMetricRollupsTable } from "@workspace/db";
import { and, gte, lt, sql, eq } from "drizzle-orm";
import { withRedis } from "../scaling/redis-store.js";

const ROLLUP_LOCK_KEY = "obs:rollup:lock";
const LOCK_TTL_S = 90;

/** Acquire a Redis lock so only one instance runs the rollup at a time. */
async function acquireLock(): Promise<boolean> {
  const acquired = await withRedis(async (r) => {
    const result = await r.set(ROLLUP_LOCK_KEY, "1", "EX", LOCK_TTL_S, "NX");
    return result === "OK";
  }, true);
  return acquired;
}

async function releaseLock(): Promise<void> {
  await withRedis(async (r) => {
    await r.del(ROLLUP_LOCK_KEY);
    return true;
  }, false);
}

/** Truncate a date to the start of its UTC hour. */
function hourFloor(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

/**
 * Compute and upsert metric rollups for a single calendar-hour window
 * covering all tenants.
 */
async function computeRollupsForWindow(windowStart: Date, windowEnd: Date): Promise<void> {
  const rows = await db.execute<{
    clientId: number;
    requestCount: number;
    errorCount: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
    spendUsd: string;
    tokenCount: number;
  }>(sql`
    SELECT
      client_id                                                       AS "clientId",
      COUNT(*)::int                                                    AS "requestCount",
      0::int                                                           AS "errorCount",
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms)::real   AS "p50LatencyMs",
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::real   AS "p95LatencyMs",
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::real   AS "p99LatencyMs",
      COALESCE(SUM(estimated_cost_usd::numeric), 0)::text              AS "spendUsd",
      COALESCE(SUM(prompt_tokens + completion_tokens), 0)::bigint       AS "tokenCount"
    FROM llm_usage_log
    WHERE called_at >= ${windowStart}
      AND called_at <  ${windowEnd}
      AND client_id IS NOT NULL
    GROUP BY client_id
  `);

  if (rows.rows.length === 0) return;

  for (const row of rows.rows) {
    const errorRatePct = row.requestCount > 0
      ? Math.round((row.errorCount / row.requestCount) * 10000) / 100
      : 0;

    await db
      .insert(tenantMetricRollupsTable)
      .values({
        clientId: row.clientId,
        windowStart,
        windowEnd,
        requestCount: row.requestCount,
        errorCount: row.errorCount,
        errorRatePct,
        p50LatencyMs: row.p50LatencyMs ?? null,
        p95LatencyMs: row.p95LatencyMs ?? null,
        p99LatencyMs: row.p99LatencyMs ?? null,
        spendUsd: row.spendUsd,
        tokenCount: Number(row.tokenCount),
      })
      .onConflictDoUpdate({
        target: [tenantMetricRollupsTable.clientId, tenantMetricRollupsTable.windowStart],
        set: {
          requestCount: row.requestCount,
          errorCount: row.errorCount,
          errorRatePct,
          p50LatencyMs: row.p50LatencyMs ?? null,
          p95LatencyMs: row.p95LatencyMs ?? null,
          p99LatencyMs: row.p99LatencyMs ?? null,
          spendUsd: row.spendUsd,
          tokenCount: Number(row.tokenCount),
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Main entry point called by the scheduler every 5 minutes.
 * Computes rollups for the current hour and the previous hour (in case
 * any late-arriving rows need to be picked up).
 */
export async function computeMetricRollups(): Promise<void> {
  const locked = await acquireLock();
  if (!locked) return;

  try {
    const now = new Date();
    const currentHourStart = hourFloor(now);
    const currentHourEnd = new Date(currentHourStart.getTime() + 60 * 60 * 1000);
    const prevHourStart = new Date(currentHourStart.getTime() - 60 * 60 * 1000);

    await Promise.all([
      computeRollupsForWindow(prevHourStart, currentHourStart),
      computeRollupsForWindow(currentHourStart, currentHourEnd),
    ]);
  } catch (err) {
    console.error("[metric-rollup] computeMetricRollups failed:", err);
  } finally {
    await releaseLock();
  }
}

/**
 * Return the last N hours of rollup rows for a single tenant.
 * Fast — hits the rollup table, never the raw log.
 */
export async function getTenantRollups(
  clientId: number,
  hours = 24,
): Promise<Array<typeof tenantMetricRollupsTable.$inferSelect>> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db
    .select()
    .from(tenantMetricRollupsTable)
    .where(
      and(
        eq(tenantMetricRollupsTable.clientId, clientId),
        gte(tenantMetricRollupsTable.windowStart, since),
      ),
    )
    .orderBy(tenantMetricRollupsTable.windowStart);
}

/**
 * Cluster-wide aggregate over the last N hours — sums across all tenants.
 */
export async function getClusterRollupSummary(hours = 1): Promise<{
  requestCount: number;
  errorCount: number;
  errorRatePct: number;
  avgP95LatencyMs: number | null;
  totalSpendUsd: number;
  totalTokens: number;
  activeTenants: number;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [row] = await db.execute<{
    requestCount: number;
    errorCount: number;
    avgP95LatencyMs: number | null;
    totalSpendUsd: string;
    totalTokens: number;
    activeTenants: number;
  }>(sql`
    SELECT
      COALESCE(SUM(request_count), 0)::int        AS "requestCount",
      COALESCE(SUM(error_count), 0)::int           AS "errorCount",
      AVG(p95_latency_ms)::real                    AS "avgP95LatencyMs",
      COALESCE(SUM(spend_usd::numeric), 0)::text   AS "totalSpendUsd",
      COALESCE(SUM(token_count), 0)::bigint         AS "totalTokens",
      COUNT(DISTINCT client_id)::int               AS "activeTenants"
    FROM tenant_metric_rollups
    WHERE window_start >= ${since}
  `).then((r) => r.rows);

  const requestCount = Number(row?.requestCount ?? 0);
  const errorCount = Number(row?.errorCount ?? 0);

  return {
    requestCount,
    errorCount,
    errorRatePct: requestCount > 0 ? Math.round((errorCount / requestCount) * 10000) / 100 : 0,
    avgP95LatencyMs: row?.avgP95LatencyMs ? Number(row.avgP95LatencyMs) : null,
    totalSpendUsd: parseFloat(row?.totalSpendUsd ?? "0"),
    totalTokens: Number(row?.totalTokens ?? 0),
    activeTenants: Number(row?.activeTenants ?? 0),
  };
}

/**
 * Per-tenant summary for the owner dashboard — one row per tenant, aggregated
 * over the last windowHours hours from the rollup table.
 */
export async function getAllTenantSummaries(windowHours = 24): Promise<
  Array<{
    clientId: number;
    requestCount: number;
    errorCount: number;
    errorRatePct: number;
    avgP95LatencyMs: number | null;
    totalSpendUsd: number;
    totalTokens: number;
    windowHours: number;
  }>
> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const rows = await db.execute<{
    clientId: number;
    requestCount: number;
    errorCount: number;
    avgP95LatencyMs: number | null;
    totalSpendUsd: string;
    totalTokens: number;
  }>(sql`
    SELECT
      client_id                                      AS "clientId",
      COALESCE(SUM(request_count), 0)::int           AS "requestCount",
      COALESCE(SUM(error_count), 0)::int              AS "errorCount",
      AVG(p95_latency_ms)::real                       AS "avgP95LatencyMs",
      COALESCE(SUM(spend_usd::numeric), 0)::text      AS "totalSpendUsd",
      COALESCE(SUM(token_count), 0)::bigint            AS "totalTokens"
    FROM tenant_metric_rollups
    WHERE window_start >= ${since}
    GROUP BY client_id
    ORDER BY SUM(spend_usd::numeric) DESC
  `);

  return rows.rows.map((r) => {
    const requestCount = Number(r.requestCount);
    const errorCount = Number(r.errorCount);
    return {
      clientId: Number(r.clientId),
      requestCount,
      errorCount,
      errorRatePct: requestCount > 0 ? Math.round((errorCount / requestCount) * 10000) / 100 : 0,
      avgP95LatencyMs: r.avgP95LatencyMs != null ? Number(r.avgP95LatencyMs) : null,
      totalSpendUsd: parseFloat(r.totalSpendUsd ?? "0"),
      totalTokens: Number(r.totalTokens),
      windowHours,
    };
  });
}
