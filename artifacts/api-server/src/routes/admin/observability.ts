/**
 * Owner-only observability & SLO management routes.
 *
 * GET  /admin/observability/system              — cluster-wide aggregate
 * GET  /admin/observability/tenants             — searchable/filterable per-tenant health
 * GET  /admin/observability/tenants/:clientId   — deep-dive for one tenant
 * GET  /admin/observability/providers           — circuit-breaker state for all providers
 *
 * GET  /admin/slos                              — list SLO definitions
 * POST /admin/slos                              — create/update an SLO
 * PATCH /admin/slos/:id                         — toggle enabled / update threshold
 * DELETE /admin/slos/:id                        — remove an SLO
 * GET  /admin/slos/breaches                     — recent breach events
 */

import { Router, type IRouter } from "express";
import {
  db,
  sloDefinitionsTable,
  sloBreachEventsTable,
  tenantMetricRollupsTable,
  clientsTable,
  clientCostCapsTable,
  llmUsageLogTable,
} from "@workspace/db";
import { eq, desc, and, gte, isNull, sql, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { requireRole } from "../../middleware/auth.js";
import {
  getClusterRollupSummary,
  getAllTenantSummaries,
  getTenantRollups,
} from "../../services/observability/metric-rollup.js";
import { getCircuitState, syncCircuitFromRedis } from "../../services/ai-safety/circuit-breaker.js";
import { getMonthlySpend, getCostCap } from "../../services/analytics/cost-caps.js";

const router: IRouter = Router();

const KNOWN_PROVIDERS = ["openai", "anthropic", "zhipu", "ollama", "openrouter"];

/**
 * Sync all known provider states from Redis (cluster-wide) then return
 * the current circuit state for each.  Falls back gracefully when Redis
 * is unavailable — getCircuitState() returns the local cached value.
 */
async function getProviderHealth(): Promise<Array<{ provider: string; circuitState: string }>> {
  await Promise.allSettled(KNOWN_PROVIDERS.map((p) => syncCircuitFromRedis(p)));
  return KNOWN_PROVIDERS.map((p) => ({
    provider: p,
    circuitState: getCircuitState(p),
  }));
}

router.get(
  "/admin/observability/system",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    try {
      const [h1, h24, providers] = await Promise.all([
        getClusterRollupSummary(1),
        getClusterRollupSummary(24),
        getProviderHealth(),
      ]);

      res.json({
        last1h: h1,
        last24h: h24,
        providers,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[observability] system summary failed:", err);
      res.status(500).json({ error: "Failed to fetch system observability" });
    }
  },
);

router.get(
  "/admin/observability/tenants",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    try {
      const windowHours = Math.min(Number(req.query.windowHours) || 24, 168);
      const search = (req.query.search as string | undefined)?.trim() ?? "";
      const sort = (req.query.sort as string | undefined) ?? "spend";
      const order = (req.query.order as string | undefined) === "asc" ? "asc" : "desc";
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const statusFilter = (req.query.status as string | undefined) ?? "";

      const [rollupSummaries, allClients] = await Promise.all([
        getAllTenantSummaries(windowHours),
        db
          .select({
            id: clientsTable.id,
            companyName: clientsTable.companyName,
            status: clientsTable.status,
            plan: clientsTable.plan,
          })
          .from(clientsTable),
      ]);

      const clientMap = Object.fromEntries(
        allClients.map((c) => [c.id, c]),
      );

      const summaryMap = Object.fromEntries(
        rollupSummaries.map((s) => [s.clientId, s]),
      );

      let rows = allClients.map((client) => {
        const metrics = summaryMap[client.id] ?? {
          requestCount: 0,
          errorCount: 0,
          errorRatePct: 0,
          avgP95LatencyMs: null,
          totalSpendUsd: 0,
          totalTokens: 0,
          windowHours,
        };

        let healthStatus: "healthy" | "degraded" | "critical" = "healthy";
        if (metrics.errorRatePct > 15) healthStatus = "critical";
        else if (metrics.errorRatePct > 5) healthStatus = "degraded";
        if (metrics.avgP95LatencyMs != null && metrics.avgP95LatencyMs > 30000) {
          healthStatus = "critical";
        } else if (metrics.avgP95LatencyMs != null && metrics.avgP95LatencyMs > 10000) {
          if (healthStatus !== "critical") healthStatus = "degraded";
        }

        const { clientId: _metricsClientId, ...metricsRest } = metrics;
        return {
          clientId: client.id,
          companyName: client.companyName,
          status: client.status,
          plan: client.plan,
          healthStatus,
          ...metricsRest,
        };
      });

      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.companyName.toLowerCase().includes(q) ||
            String(r.clientId).includes(q),
        );
      }

      if (statusFilter && ["healthy", "degraded", "critical"].includes(statusFilter)) {
        rows = rows.filter((r) => r.healthStatus === statusFilter);
      }

      const sortFns: Record<string, (a: typeof rows[0], b: typeof rows[0]) => number> = {
        spend: (a, b) => b.totalSpendUsd - a.totalSpendUsd,
        requests: (a, b) => b.requestCount - a.requestCount,
        error_rate: (a, b) => b.errorRatePct - a.errorRatePct,
        latency: (a, b) => (b.avgP95LatencyMs ?? 0) - (a.avgP95LatencyMs ?? 0),
        name: (a, b) => a.companyName.localeCompare(b.companyName),
      };

      const sortFn = sortFns[sort] ?? sortFns.spend!;
      rows.sort((a, b) => (order === "asc" ? -sortFn(a, b) : sortFn(a, b)));

      const total = rows.length;
      const page = rows.slice(offset, offset + limit);

      res.json({
        tenants: page,
        total,
        windowHours,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[observability] tenant list failed:", err);
      res.status(500).json({ error: "Failed to fetch tenant observability" });
    }
  },
);

router.get(
  "/admin/observability/tenants/:clientId",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const clientId = Number(req.params.clientId);
    if (isNaN(clientId)) {
      res.status(400).json({ error: "Invalid clientId" });
      return;
    }

    try {
      const [client] = await db
        .select()
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));

      if (!client) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      const [rollups, monthlySpend, costCap, recentBreaches, openBreachCount] =
        await Promise.all([
          getTenantRollups(clientId, 48),
          getMonthlySpend(clientId),
          getCostCap(clientId),
          db
            .select({
              id: sloBreachEventsTable.id,
              sloId: sloBreachEventsTable.sloId,
              windowStart: sloBreachEventsTable.windowStart,
              windowEnd: sloBreachEventsTable.windowEnd,
              observedValue: sloBreachEventsTable.observedValue,
              thresholdValue: sloBreachEventsTable.thresholdValue,
              resolvedAt: sloBreachEventsTable.resolvedAt,
              createdAt: sloBreachEventsTable.createdAt,
            })
            .from(sloBreachEventsTable)
            .where(eq(sloBreachEventsTable.clientId, clientId))
            .orderBy(desc(sloBreachEventsTable.createdAt))
            .limit(20),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(sloBreachEventsTable)
            .where(
              and(
                eq(sloBreachEventsTable.clientId, clientId),
                isNull(sloBreachEventsTable.resolvedAt),
              ),
            ),
        ]);

      const recentBreachesWithSlos = await Promise.all(
        recentBreaches.map(async (breach) => {
          const [sloDef] = await db
            .select({ name: sloDefinitionsTable.name, metric: sloDefinitionsTable.metric })
            .from(sloDefinitionsTable)
            .where(eq(sloDefinitionsTable.id, breach.sloId));
          return { ...breach, sloName: sloDef?.name ?? `SLO #${breach.sloId}`, sloMetric: sloDef?.metric };
        }),
      );

      const last24hRollups = rollups.filter(
        (r) => new Date(r.windowStart).getTime() >= Date.now() - 24 * 3600 * 1000,
      );

      const totalRequests24h = last24hRollups.reduce((s, r) => s + r.requestCount, 0);
      const totalErrors24h = last24hRollups.reduce((s, r) => s + r.errorCount, 0);
      const avgP95_24h =
        last24hRollups.filter((r) => r.p95LatencyMs != null).length > 0
          ? last24hRollups
              .filter((r) => r.p95LatencyMs != null)
              .reduce((s, r) => s + (r.p95LatencyMs ?? 0), 0) /
            last24hRollups.filter((r) => r.p95LatencyMs != null).length
          : null;
      const totalSpend24h = last24hRollups.reduce(
        (s, r) => s + parseFloat(r.spendUsd ?? "0"),
        0,
      );

      const providers = await getProviderHealth();

      res.json({
        client: {
          id: client.id,
          companyName: client.companyName,
          status: client.status,
          plan: client.plan,
          createdAt: client.createdAt,
        },
        summary24h: {
          requestCount: totalRequests24h,
          errorCount: totalErrors24h,
          errorRatePct:
            totalRequests24h > 0
              ? Math.round((totalErrors24h / totalRequests24h) * 10000) / 100
              : 0,
          avgP95LatencyMs: avgP95_24h ? Math.round(avgP95_24h) : null,
          totalSpendUsd: Math.round(totalSpend24h * 1_000_000) / 1_000_000,
        },
        budget: {
          monthlySpendUsd: monthlySpend,
          monthlyCapUsd: costCap ? parseFloat(costCap.monthlyCapUsd) : null,
          pctUsed:
            costCap && parseFloat(costCap.monthlyCapUsd) > 0
              ? Math.round((monthlySpend / parseFloat(costCap.monthlyCapUsd)) * 10000) / 100
              : null,
        },
        providers,
        rollups,
        sloBreaches: {
          openCount: Number(openBreachCount[0]?.count ?? 0),
          recent: recentBreachesWithSlos,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[observability] tenant detail failed:", err);
      res.status(500).json({ error: "Failed to fetch tenant detail" });
    }
  },
);

router.get(
  "/admin/observability/providers",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    const providers = await getProviderHealth();
    res.json({ providers, generatedAt: new Date().toISOString() });
  },
);

const sloSchema = z.object({
  name: z.string().min(1).max(120),
  metric: z.enum(["error_rate_pct", "p95_latency_ms", "p50_latency_ms", "spend_usd", "request_count"]),
  operator: z.enum(["lte", "gte"]),
  threshold: z.number().positive(),
  windowHours: z.number().int().min(1).max(168).optional().default(1),
  severity: z.enum(["warning", "critical"]).optional().default("warning"),
  enabled: z.boolean().optional().default(true),
});

router.get(
  "/admin/slos",
  requireRole("owner", "admin"),
  async (_req, res): Promise<void> => {
    try {
      const slos = await db
        .select()
        .from(sloDefinitionsTable)
        .orderBy(sloDefinitionsTable.createdAt);
      res.json(slos);
    } catch (err) {
      console.error("[observability] slo list failed:", err);
      res.status(500).json({ error: "Failed to list SLOs" });
    }
  },
);

router.post(
  "/admin/slos",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const parsed = sloSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const [slo] = await db
        .insert(sloDefinitionsTable)
        .values({
          name: parsed.data.name,
          metric: parsed.data.metric,
          operator: parsed.data.operator,
          threshold: String(parsed.data.threshold),
          windowHours: parsed.data.windowHours,
          severity: parsed.data.severity,
          enabled: parsed.data.enabled,
        })
        .returning();
      res.status(201).json(slo);
    } catch (err) {
      console.error("[observability] slo create failed:", err);
      res.status(500).json({ error: "Failed to create SLO" });
    }
  },
);

router.patch(
  "/admin/slos/:id",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid SLO id" });
      return;
    }
    const patchSchema = sloSchema.partial();
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.metric !== undefined) updates.metric = parsed.data.metric;
      if (parsed.data.operator !== undefined) updates.operator = parsed.data.operator;
      if (parsed.data.threshold !== undefined) updates.threshold = String(parsed.data.threshold);
      if (parsed.data.windowHours !== undefined) updates.windowHours = parsed.data.windowHours;
      if (parsed.data.severity !== undefined) updates.severity = parsed.data.severity;
      if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;

      const [updated] = await db
        .update(sloDefinitionsTable)
        .set(updates as any)
        .where(eq(sloDefinitionsTable.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "SLO not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      console.error("[observability] slo patch failed:", err);
      res.status(500).json({ error: "Failed to update SLO" });
    }
  },
);

router.delete(
  "/admin/slos/:id",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid SLO id" });
      return;
    }
    try {
      const [deleted] = await db
        .delete(sloDefinitionsTable)
        .where(eq(sloDefinitionsTable.id, id))
        .returning();

      if (!deleted) {
        res.status(404).json({ error: "SLO not found" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[observability] slo delete failed:", err);
      res.status(500).json({ error: "Failed to delete SLO" });
    }
  },
);

router.get(
  "/admin/slos/breaches",
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const openOnly = req.query.openOnly === "true";
      const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

      const conditions = [];
      if (openOnly) conditions.push(isNull(sloBreachEventsTable.resolvedAt));
      if (clientId != null && !isNaN(clientId)) {
        conditions.push(eq(sloBreachEventsTable.clientId, clientId));
      }

      const breaches = await db
        .select()
        .from(sloBreachEventsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(sloBreachEventsTable.createdAt))
        .limit(limit);

      const sloIds = [...new Set(breaches.map((b) => b.sloId))];
      let sloMap: Record<number, { name: string; metric: string; severity: string }> = {};
      if (sloIds.length > 0) {
        const sloRows = await db.select().from(sloDefinitionsTable);
        sloMap = Object.fromEntries(
          sloRows.map((s) => [
            s.id,
            { name: s.name, metric: s.metric, severity: s.severity },
          ]),
        );
      }

      const clientIds = [...new Set(breaches.map((b) => b.clientId).filter(Boolean))] as number[];
      let clientMap: Record<number, string> = {};
      if (clientIds.length > 0) {
        const clients = await db
          .select({ id: clientsTable.id, companyName: clientsTable.companyName })
          .from(clientsTable);
        clientMap = Object.fromEntries(clients.map((c) => [c.id, c.companyName]));
      }

      const enriched = breaches.map((b) => ({
        ...b,
        sloName: sloMap[b.sloId]?.name ?? `SLO #${b.sloId}`,
        sloMetric: sloMap[b.sloId]?.metric,
        sloSeverity: sloMap[b.sloId]?.severity,
        companyName: b.clientId ? (clientMap[b.clientId] ?? `Tenant #${b.clientId}`) : null,
      }));

      res.json(enriched);
    } catch (err) {
      console.error("[observability] breach list failed:", err);
      res.status(500).json({ error: "Failed to fetch SLO breaches" });
    }
  },
);

export default router;
