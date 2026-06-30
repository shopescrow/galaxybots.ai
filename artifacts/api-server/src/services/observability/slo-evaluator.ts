/**
 * SLO evaluation engine.
 *
 * Reads SLO definitions, evaluates them against recent rollup data, and fires
 * per-tenant breach notifications + SSE when a target is violated.
 *
 * Deduplication contract (incident-level, not window-level):
 *   - A breach row is only inserted when there is NO unresolved breach for
 *     the same (slo_id, client_id).  This means a breach fires exactly once
 *     when a tenant transitions from healthy→breaching and stays silent while
 *     the breach persists — regardless of how many 5-minute cycles pass.
 *   - When a tenant returns to healthy, its open breach row is resolved.
 *   - When NO tenants are breaching, ALL open breach rows for that SLO are
 *     resolved at once.
 *
 * Error-rate SLO note:
 *   llm_usage_log has no error-flag column, so error_count in rollups is
 *   always 0.  Error-rate SLOs are kept in the schema for future use but are
 *   NOT seeded by default — they would only trigger false-positive all-clear
 *   states, not real alerts.  Owners can add them manually once error signals
 *   are instrumented in the usage log.
 *
 * Called by the scheduler every 5 minutes alongside the rollup job.
 */

import {
  db,
  sloDefinitionsTable,
  sloBreachEventsTable,
  tenantMetricRollupsTable,
} from "@workspace/db";
import { and, eq, isNull, inArray, notInArray, sql } from "drizzle-orm";
import { broadcastSSEToAll } from "../platform/sse.js";
import { createNotification } from "../admin/notifications.js";

type SloMetric =
  | "error_rate_pct"
  | "p95_latency_ms"
  | "p50_latency_ms"
  | "spend_usd"
  | "request_count";

function isBreaching(observed: number, threshold: number, operator: "lte" | "gte"): boolean {
  if (operator === "lte") return observed > threshold;
  return observed < threshold;
}

async function getActiveSlos(): Promise<Array<typeof sloDefinitionsTable.$inferSelect>> {
  return db.select().from(sloDefinitionsTable).where(eq(sloDefinitionsTable.enabled, true));
}

/**
 * Returns the set of client_ids that currently have an open (unresolved)
 * breach for the given SLO.  Dedup check is purely on resolved_at=NULL —
 * not on window timestamps — so the same breach is never double-fired.
 */
async function getOpenBreachClientIds(sloId: number): Promise<Set<number>> {
  const rows = await db
    .select({ clientId: sloBreachEventsTable.clientId })
    .from(sloBreachEventsTable)
    .where(
      and(
        eq(sloBreachEventsTable.sloId, sloId),
        isNull(sloBreachEventsTable.resolvedAt),
      ),
    );
  const set = new Set<number>();
  for (const r of rows) {
    if (r.clientId != null) set.add(r.clientId);
  }
  return set;
}

async function recordBreach(params: {
  sloId: number;
  clientId: number;
  windowStart: Date;
  windowEnd: Date;
  observedValue: number;
  thresholdValue: number;
}): Promise<void> {
  await db.insert(sloBreachEventsTable).values({
    sloId: params.sloId,
    clientId: params.clientId,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    observedValue: String(params.observedValue),
    thresholdValue: String(params.thresholdValue),
    notifiedAt: new Date(),
  });
}

/**
 * Evaluate a single SLO against the last windowHours of rollup data.
 *
 * Per-tenant aggregation uses the rollup table (never raw logs).
 * SQL is constructed using parameterized values except the metric column name
 * which is validated against the fixed SloMetric enum before interpolation.
 */
async function evaluateSlo(
  slo: typeof sloDefinitionsTable.$inferSelect,
): Promise<void> {
  const since = new Date(Date.now() - slo.windowHours * 60 * 60 * 1000);
  const windowStart = since;
  const windowEnd = new Date();
  const threshold = parseFloat(slo.threshold);
  const operator = slo.operator as "lte" | "gte";
  const metric = slo.metric as SloMetric;

  const VALID_AGG: Record<SloMetric, string> = {
    error_rate_pct:
      "CASE WHEN SUM(request_count) > 0 THEN SUM(error_count)::real / SUM(request_count) * 100 ELSE 0 END",
    p95_latency_ms: "AVG(p95_latency_ms)",
    p50_latency_ms: "AVG(p50_latency_ms)",
    spend_usd: "SUM(spend_usd::numeric)",
    request_count: "SUM(request_count)",
  };

  const aggExpr = VALID_AGG[metric];
  if (!aggExpr) {
    console.warn(`[slo-evaluator] Unknown metric: ${metric} — skipping SLO ${slo.id}`);
    return;
  }

  const rows = await db.execute<{
    clientId: number;
    observedValue: number | null;
  }>(sql.raw(`
    SELECT
      client_id AS "clientId",
      (${aggExpr})::real AS "observedValue"
    FROM tenant_metric_rollups
    WHERE window_start >= '${since.toISOString()}'
    GROUP BY client_id
    HAVING (${aggExpr}) IS NOT NULL
  `));

  const currentlyBreachingClients = new Set<number>();

  for (const row of rows.rows) {
    if (row.observedValue == null) continue;
    const observed = Number(row.observedValue);
    const clientId = Number(row.clientId);

    if (isBreaching(observed, threshold, operator)) {
      currentlyBreachingClients.add(clientId);
    }
  }

  const alreadyOpenClientIds = await getOpenBreachClientIds(slo.id);

  const newlyBreaching = [...currentlyBreachingClients].filter(
    (id) => !alreadyOpenClientIds.has(id),
  );
  const nowHealthy = [...alreadyOpenClientIds].filter(
    (id) => !currentlyBreachingClients.has(id),
  );

  for (const clientId of newlyBreaching) {
    const observed = Number(
      rows.rows.find((r) => Number(r.clientId) === clientId)?.observedValue ?? threshold,
    );

    await recordBreach({
      sloId: slo.id,
      clientId,
      windowStart,
      windowEnd,
      observedValue: observed,
      thresholdValue: threshold,
    });

    await createNotification({
      clientId,
      category: "system",
      severity: slo.severity as "warning" | "critical",
      title: `SLO breach: ${slo.name}`,
      body: `Tenant #${clientId} — ${metric} is ${observed.toFixed(2)} (threshold ${operator === "lte" ? "≤" : "≥"} ${threshold})`,
      link: `/admin/observability?clientId=${clientId}`,
      metadata: {
        sloId: slo.id,
        sloName: slo.name,
        metric,
        observed,
        threshold,
      },
      isScheduled: true,
    }).catch((e: unknown) => console.error("[slo-evaluator] notification failed:", e));

    broadcastSSEToAll("slo_breach", {
      sloId: slo.id,
      sloName: slo.name,
      clientId,
      metric,
      observed,
      threshold,
      severity: slo.severity,
      timestamp: new Date().toISOString(),
    });
  }

  if (nowHealthy.length > 0) {
    await db
      .update(sloBreachEventsTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(sloBreachEventsTable.sloId, slo.id),
          isNull(sloBreachEventsTable.resolvedAt),
          inArray(sloBreachEventsTable.clientId, nowHealthy),
        ),
      );
  }

  if (currentlyBreachingClients.size === 0 && alreadyOpenClientIds.size > 0) {
    await db
      .update(sloBreachEventsTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(sloBreachEventsTable.sloId, slo.id),
          isNull(sloBreachEventsTable.resolvedAt),
        ),
      );
  }
}

/**
 * Main entry point — evaluate all enabled SLOs.
 * Called by the scheduler every 5 minutes.
 */
export async function evaluateSlos(): Promise<void> {
  try {
    const slos = await getActiveSlos();
    await Promise.allSettled(slos.map(evaluateSlo));
  } catch (err) {
    console.error("[slo-evaluator] evaluateSlos failed:", err);
  }
}

/**
 * Seed the default SLO definitions if none exist yet.
 *
 * Only latency and spend SLOs are seeded.  Error-rate SLOs are intentionally
 * omitted because llm_usage_log has no error-flag column — error_count in
 * tenant_metric_rollups is always 0, making error-rate SLOs non-functional
 * until error signals are added to the usage log.
 */
export async function seedDefaultSlos(): Promise<void> {
  try {
    const existing = await db
      .select({ id: sloDefinitionsTable.id })
      .from(sloDefinitionsTable)
      .limit(1);
    if (existing.length > 0) return;

    await db.insert(sloDefinitionsTable).values([
      {
        name: "P95 latency ≤ 10 s (warning)",
        metric: "p95_latency_ms",
        operator: "lte",
        threshold: "10000",
        windowHours: 1,
        severity: "warning",
        enabled: true,
      },
      {
        name: "P95 latency ≤ 30 s (critical)",
        metric: "p95_latency_ms",
        operator: "lte",
        threshold: "30000",
        windowHours: 1,
        severity: "critical",
        enabled: true,
      },
      {
        name: "Hourly spend ≤ $10 (warning)",
        metric: "spend_usd",
        operator: "lte",
        threshold: "10",
        windowHours: 1,
        severity: "warning",
        enabled: true,
      },
      {
        name: "Hourly spend ≤ $50 (critical)",
        metric: "spend_usd",
        operator: "lte",
        threshold: "50",
        windowHours: 1,
        severity: "critical",
        enabled: true,
      },
    ]);
  } catch (err) {
    console.error("[slo-evaluator] seedDefaultSlos failed:", err);
  }
}
