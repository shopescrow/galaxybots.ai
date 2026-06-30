import { Router, type IRouter } from "express";
import {
  db,
  llmUsageLogTable,
  toolActivityLogTable,
  clientCostCapsTable,
  analyticsApiKeysTable,
  pipelineRunsTable,
  pipelinesTable,
  backgroundReportsTable,
  botSlaEventsTable,
  botsTable,
  clientsTable,
  slaTiersTable,
  botSlaOverridesTable,
  modelSelectionTelemetryTable,
  modelReputationTable,
  llmUsageDailyRollupTable,
  modelTelemetryDailyRollupTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray, isNotNull, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";
import {
  getMonthlySpend,
  getCostCap,
  upsertCostCap,
  checkCostCapAlerts,
} from "../../services/analytics/cost-caps";
import { clientTokenQuotasTable, platformAuditLogTable } from "@workspace/db";
import { getTokenQuotaConfig, invalidateTokenQuotaCache } from "../../services/ai-safety/tenant-quota";
import { getGlmPoolStatus } from "../../services/ai-safety/provider-key-pool";
import { invalidateBudgetCache } from "../../services/ai-safety/budget-enforcer";
import { hashApiKey } from "../../middleware/analytics-api-key";

const router: IRouter = Router();

function parseDateRange(query: { dateFrom?: string; dateTo?: string }) {
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (query.dateFrom) {
    dateFrom = new Date(query.dateFrom);
    if (isNaN(dateFrom.getTime())) dateFrom = undefined;
  }
  if (query.dateTo) {
    dateTo = new Date(query.dateTo);
    if (isNaN(dateTo.getTime())) dateTo = undefined;
  }
  return { dateFrom, dateTo };
}

// Returns true when the entire query window is at least 2 days in the past,
// meaning the rollup tables have complete data for the requested range.
function canUseRollup(dateFrom?: Date, dateTo?: Date): boolean {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const effectiveTo = dateTo ?? new Date();
  return effectiveTo < twoDaysAgo;
}

router.get("/analytics/spend", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const monthlySpend = await getMonthlySpend(clientId);

    // Use pre-aggregated rollup tables when the window is fully in the past
    // (rollup worker runs at 24 h cadence, so data is complete after 2 days).
    if (canUseRollup(dateFrom, dateTo)) {
      const rollupConds: SQL[] = [eq(llmUsageDailyRollupTable.clientId, clientId)];
      if (dateFrom) rollupConds.push(gte(llmUsageDailyRollupTable.rollupDate, dateFrom.toISOString().slice(0, 10)));
      if (dateTo)   rollupConds.push(lte(llmUsageDailyRollupTable.rollupDate, dateTo.toISOString().slice(0, 10)));

      const [rollupByModel, rollupOverTime, rollupByBot] = await Promise.all([
        db.select({
          model:            llmUsageDailyRollupTable.model,
          totalCost:        sql<string>`SUM(${llmUsageDailyRollupTable.totalCostUsd})`,
          totalPromptTokens: sql<number>`SUM(${llmUsageDailyRollupTable.promptTokens})`,
          totalCompletionTokens: sql<number>`SUM(${llmUsageDailyRollupTable.completionTokens})`,
          callCount:        sql<number>`SUM(${llmUsageDailyRollupTable.callCount})`,
          avgLatencyMs:     sql<number>`AVG(${llmUsageDailyRollupTable.avgLatencyMs})`,
        })
          .from(llmUsageDailyRollupTable)
          .where(and(...rollupConds))
          .groupBy(llmUsageDailyRollupTable.model),

        db.select({
          date:        llmUsageDailyRollupTable.rollupDate,
          totalCost:   sql<string>`SUM(${llmUsageDailyRollupTable.totalCostUsd})`,
          totalTokens: sql<number>`SUM(${llmUsageDailyRollupTable.promptTokens} + ${llmUsageDailyRollupTable.completionTokens})`,
          callCount:   sql<number>`SUM(${llmUsageDailyRollupTable.callCount})`,
        })
          .from(llmUsageDailyRollupTable)
          .where(and(...rollupConds))
          .groupBy(llmUsageDailyRollupTable.rollupDate)
          .orderBy(llmUsageDailyRollupTable.rollupDate),

        db.select({
          botId:     llmUsageDailyRollupTable.botId,
          totalCost: sql<string>`SUM(${llmUsageDailyRollupTable.totalCostUsd})`,
          callCount: sql<number>`SUM(${llmUsageDailyRollupTable.callCount})`,
        })
          .from(llmUsageDailyRollupTable)
          .where(and(...rollupConds))
          .groupBy(llmUsageDailyRollupTable.botId),
      ]);

      const totalSpend = rollupByModel.reduce((s, m) => s + parseFloat(m.totalCost || "0"), 0);
      res.json({
        totalSpend:   Math.round(totalSpend * 1_000_000) / 1_000_000,
        monthlySpend: Math.round(monthlySpend * 1_000_000) / 1_000_000,
        spendByModel: rollupByModel.map((m) => ({
          model:             m.model,
          totalCost:         parseFloat(m.totalCost || "0"),
          promptTokens:      Number(m.totalPromptTokens || 0),
          completionTokens:  Number(m.totalCompletionTokens || 0),
          callCount:         Number(m.callCount || 0),
          avgLatencyMs:      Math.round(Number(m.avgLatencyMs || 0)),
        })),
        spendOverTime: rollupOverTime.map((d) => ({
          date:       d.date,
          totalCost:  parseFloat(d.totalCost || "0"),
          totalTokens: Number(d.totalTokens || 0),
          callCount:  Number(d.callCount || 0),
        })),
        spendByBot: rollupByBot.map((b) => ({
          botId:     b.botId,
          totalCost: parseFloat(b.totalCost || "0"),
          callCount: Number(b.callCount || 0),
        })),
      });
      return;
    }

    // Recent data (includes today or yesterday): scan raw table.
    const conditions: SQL[] = [eq(llmUsageLogTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(llmUsageLogTable.calledAt, dateFrom));
    if (dateTo) conditions.push(lte(llmUsageLogTable.calledAt, dateTo));

    const spendByModel = await db
      .select({
        model: llmUsageLogTable.model,
        totalCost: sql<string>`SUM(${llmUsageLogTable.estimatedCostUsd}::numeric)`,
        totalPromptTokens: sql<number>`SUM(${llmUsageLogTable.promptTokens})`,
        totalCompletionTokens: sql<number>`SUM(${llmUsageLogTable.completionTokens})`,
        callCount: sql<number>`COUNT(*)`,
        avgLatencyMs: sql<number>`AVG(${llmUsageLogTable.latencyMs})`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions))
      .groupBy(llmUsageLogTable.model);

    const spendOverTime = await db
      .select({
        date: sql<string>`DATE(${llmUsageLogTable.calledAt})`,
        totalCost: sql<string>`SUM(${llmUsageLogTable.estimatedCostUsd}::numeric)`,
        totalTokens: sql<number>`SUM(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens})`,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${llmUsageLogTable.calledAt})`)
      .orderBy(sql`DATE(${llmUsageLogTable.calledAt})`);

    const spendByBot = await db
      .select({
        botId: llmUsageLogTable.botId,
        totalCost: sql<string>`SUM(${llmUsageLogTable.estimatedCostUsd}::numeric)`,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions))
      .groupBy(llmUsageLogTable.botId);

    const totalSpend = spendByModel.reduce((sum, m) => sum + parseFloat(m.totalCost || "0"), 0);

    res.json({
      totalSpend: Math.round(totalSpend * 1_000_000) / 1_000_000,
      monthlySpend: Math.round(monthlySpend * 1_000_000) / 1_000_000,
      spendByModel: spendByModel.map((m) => ({
        model: m.model,
        totalCost: parseFloat(m.totalCost || "0"),
        promptTokens: Number(m.totalPromptTokens || 0),
        completionTokens: Number(m.totalCompletionTokens || 0),
        callCount: Number(m.callCount || 0),
        avgLatencyMs: Math.round(Number(m.avgLatencyMs || 0)),
      })),
      spendOverTime: spendOverTime.map((d) => ({
        date: d.date,
        totalCost: parseFloat(d.totalCost || "0"),
        totalTokens: Number(d.totalTokens || 0),
        callCount: Number(d.callCount || 0),
      })),
      spendByBot: spendByBot.map((b) => ({
        botId: b.botId,
        totalCost: parseFloat(b.totalCost || "0"),
        callCount: Number(b.callCount || 0),
      })),
    });
  } catch (err) {
    console.error("Analytics spend error:", err);
    res.status(500).json({ error: "Failed to fetch spend analytics" });
  }
});

router.get("/analytics/tokens", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: SQL[] = [eq(llmUsageLogTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(llmUsageLogTable.calledAt, dateFrom));
    if (dateTo) conditions.push(lte(llmUsageLogTable.calledAt, dateTo));

    const tokensByModel = await db
      .select({
        model: llmUsageLogTable.model,
        promptTokens: sql<number>`SUM(${llmUsageLogTable.promptTokens})`,
        completionTokens: sql<number>`SUM(${llmUsageLogTable.completionTokens})`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions))
      .groupBy(llmUsageLogTable.model);

    const tokensOverTime = await db
      .select({
        date: sql<string>`DATE(${llmUsageLogTable.calledAt})`,
        promptTokens: sql<number>`SUM(${llmUsageLogTable.promptTokens})`,
        completionTokens: sql<number>`SUM(${llmUsageLogTable.completionTokens})`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${llmUsageLogTable.calledAt})`)
      .orderBy(sql`DATE(${llmUsageLogTable.calledAt})`);

    res.json({
      tokensByModel: tokensByModel.map((m) => ({
        model: m.model,
        promptTokens: Number(m.promptTokens || 0),
        completionTokens: Number(m.completionTokens || 0),
        total: Number(m.promptTokens || 0) + Number(m.completionTokens || 0),
      })),
      tokensOverTime: tokensOverTime.map((d) => ({
        date: d.date,
        promptTokens: Number(d.promptTokens || 0),
        completionTokens: Number(d.completionTokens || 0),
      })),
    });
  } catch (err) {
    console.error("Analytics tokens error:", err);
    res.status(500).json({ error: "Failed to fetch token analytics" });
  }
});

router.get("/analytics/tools", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: SQL[] = [eq(toolActivityLogTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(toolActivityLogTable.createdAt, dateFrom));
    if (dateTo) conditions.push(lte(toolActivityLogTable.createdAt, dateTo));

    const toolFrequency = await db
      .select({
        toolName: toolActivityLogTable.toolName,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(toolActivityLogTable)
      .where(and(...conditions))
      .groupBy(toolActivityLogTable.toolName)
      .orderBy(sql`COUNT(*) DESC`);

    const toolsByDay = await db
      .select({
        date: sql<string>`DATE(${toolActivityLogTable.createdAt})`,
        toolName: toolActivityLogTable.toolName,
        callCount: sql<number>`COUNT(*)`,
      })
      .from(toolActivityLogTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${toolActivityLogTable.createdAt})`, toolActivityLogTable.toolName)
      .orderBy(sql`DATE(${toolActivityLogTable.createdAt})`);

    const heatmapData: Record<string, Record<string, number>> = {};
    for (const row of toolsByDay) {
      if (!heatmapData[row.date]) heatmapData[row.date] = {};
      heatmapData[row.date]![row.toolName] = Number(row.callCount);
    }

    res.json({
      toolFrequency: toolFrequency.map((t) => ({
        toolName: t.toolName,
        callCount: Number(t.callCount),
      })),
      heatmap: Object.entries(heatmapData).map(([date, tools]) => ({
        date,
        ...tools,
      })),
    });
  } catch (err) {
    console.error("Analytics tools error:", err);
    res.status(500).json({ error: "Failed to fetch tool analytics" });
  }
});

router.get("/analytics/sessions", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: SQL[] = [eq(llmUsageLogTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(llmUsageLogTable.calledAt, dateFrom));
    if (dateTo) conditions.push(lte(llmUsageLogTable.calledAt, dateTo));

    const sessionStats = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`,
        avgLatency: sql<number>`AVG(${llmUsageLogTable.latencyMs})`,
        p95Latency: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${llmUsageLogTable.latencyMs})`,
        totalTokens: sql<number>`SUM(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens})`,
      })
      .from(llmUsageLogTable)
      .where(and(...conditions));

    res.json({
      totalCalls: Number(sessionStats[0]?.totalCalls || 0),
      avgLatencyMs: Math.round(Number(sessionStats[0]?.avgLatency || 0)),
      p95LatencyMs: Math.round(Number(sessionStats[0]?.p95Latency || 0)),
      totalTokens: Number(sessionStats[0]?.totalTokens || 0),
    });
  } catch (err) {
    console.error("Analytics sessions error:", err);
    res.status(500).json({ error: "Failed to fetch session analytics" });
  }
});

router.get("/analytics/pipelines", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: SQL[] = [eq(pipelinesTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(pipelineRunsTable.startedAt, dateFrom));
    if (dateTo) conditions.push(lte(pipelineRunsTable.startedAt, dateTo));

    const pipelineStats = await db
      .select({
        status: pipelineRunsTable.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(pipelineRunsTable)
      .innerJoin(pipelinesTable, eq(pipelineRunsTable.pipelineId, pipelinesTable.id))
      .where(and(...conditions))
      .groupBy(pipelineRunsTable.status);

    res.json({
      byStatus: pipelineStats.map((p) => ({
        status: p.status,
        count: Number(p.count),
      })),
    });
  } catch {
    res.json({ byStatus: [] });
  }
});

router.get("/analytics/scheduler", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: SQL[] = [eq(backgroundReportsTable.clientId, clientId)];
    if (dateFrom) conditions.push(gte(backgroundReportsTable.createdAt, dateFrom));
    if (dateTo) conditions.push(lte(backgroundReportsTable.createdAt, dateTo));

    const schedulerStats = await db
      .select({
        runStatus: backgroundReportsTable.runStatus,
        count: sql<number>`COUNT(*)`,
      })
      .from(backgroundReportsTable)
      .where(and(...conditions))
      .groupBy(backgroundReportsTable.runStatus);

    res.json({
      byStatus: schedulerStats.map((s) => ({
        status: s.runStatus,
        count: Number(s.count),
      })),
    });
  } catch {
    res.json({ byStatus: [] });
  }
});

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const monthlySpend = await getMonthlySpend(clientId);
    const capInfo = await checkCostCapAlerts(clientId);

    const totalStats = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
        totalCalls: sql<number>`COUNT(*)`,
        totalTokens: sql<number>`COALESCE(SUM(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens}), 0)`,
        avgLatency: sql<number>`COALESCE(AVG(${llmUsageLogTable.latencyMs}), 0)`,
      })
      .from(llmUsageLogTable)
      .where(eq(llmUsageLogTable.clientId, clientId));

    const toolCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(toolActivityLogTable)
      .where(eq(toolActivityLogTable.clientId, clientId));

    res.json({
      totalSpend: parseFloat(totalStats[0]?.totalCost ?? "0"),
      monthlySpend,
      totalCalls: Number(totalStats[0]?.totalCalls ?? 0),
      totalTokens: Number(totalStats[0]?.totalTokens ?? 0),
      avgLatencyMs: Math.round(Number(totalStats[0]?.avgLatency ?? 0)),
      totalToolCalls: Number(toolCount[0]?.count ?? 0),
      costCap: capInfo,
    });
  } catch (err) {
    console.error("Analytics overview error:", err);
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

router.get("/analytics/cost-cap", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const cap = await getCostCap(clientId);
    const spend = await getMonthlySpend(clientId);

    res.json({
      cap: cap
        ? {
            monthlyCapUsd: parseFloat(cap.monthlyCapUsd),
            alertAt80Pct: cap.alertAt80Pct,
            pauseAutonomousOnExhaust: cap.pauseAutonomousOnExhaust,
          }
        : null,
      currentMonthlySpend: spend,
    });
  } catch (err) {
    console.error("Cost cap fetch error:", err);
    res.status(500).json({ error: "Failed to fetch cost cap" });
  }
});

router.put("/analytics/cost-cap", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const schema = z.object({
    monthlyCapUsd: z.number().min(0),
    alertAt80Pct: z.boolean().optional().default(true),
    pauseAutonomousOnExhaust: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const result = await upsertCostCap(
      clientId,
      parsed.data.monthlyCapUsd,
      parsed.data.alertAt80Pct,
      parsed.data.pauseAutonomousOnExhaust,
    );
    res.json(result);
  } catch (err) {
    console.error("Cost cap update error:", err);
    res.status(500).json({ error: "Failed to update cost cap" });
  }
});

router.get("/analytics/export/:dataset", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const { dataset } = req.params;
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

  let rows: Record<string, unknown>[] = [];
  let filename = `${dataset}.csv`;

  try {
    if (dataset === "llm-usage") {
      const conds: SQL[] = [eq(llmUsageLogTable.clientId, clientId)];
      if (dateFrom) conds.push(gte(llmUsageLogTable.calledAt, dateFrom));
      if (dateTo) conds.push(lte(llmUsageLogTable.calledAt, dateTo));

      rows = await db
        .select()
        .from(llmUsageLogTable)
        .where(and(...conds))
        .orderBy(desc(llmUsageLogTable.calledAt));
      filename = "llm_usage.csv";
    } else if (dataset === "tool-activity") {
      const conds: SQL[] = [eq(toolActivityLogTable.clientId, clientId)];
      if (dateFrom) conds.push(gte(toolActivityLogTable.createdAt, dateFrom));
      if (dateTo) conds.push(lte(toolActivityLogTable.createdAt, dateTo));

      rows = await db
        .select()
        .from(toolActivityLogTable)
        .where(and(...conds))
        .orderBy(desc(toolActivityLogTable.createdAt));
      filename = "tool_activity.csv";
    } else {
      res.status(400).json({ error: `Unknown dataset: ${dataset}. Available: llm-usage, tool-activity` });
      return;
    }

    if (rows.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send("No data");
      return;
    }

    const headers = Object.keys(rows[0]!);
    const csvLines = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = typeof val === "object" ? JSON.stringify(val) : String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(","),
      ),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvLines.join("\n"));
  } catch (err) {
    console.error("Analytics export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

router.post("/analytics/api-keys", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const schema = z.object({ label: z.string().optional().default("default") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const rawKey = `gba_${crypto.randomBytes(32).toString("hex")}`;
    const hashedKey = hashApiKey(rawKey);

    const [key] = await db
      .insert(analyticsApiKeysTable)
      .values({ clientId, apiKey: hashedKey, label: parsed.data.label })
      .returning();

    res.status(201).json({ id: key.id, apiKey: rawKey, label: key.label, createdAt: key.createdAt });
  } catch (err) {
    console.error("API key creation error:", err);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

router.get("/analytics/api-keys", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const keys = await db
      .select({
        id: analyticsApiKeysTable.id,
        label: analyticsApiKeysTable.label,
        apiKeyPrefix: sql<string>`LEFT(${analyticsApiKeysTable.apiKey}, 8)`,
        createdAt: analyticsApiKeysTable.createdAt,
      })
      .from(analyticsApiKeysTable)
      .where(eq(analyticsApiKeysTable.clientId, clientId));

    res.json(keys);
  } catch (err) {
    console.error("API key list error:", err);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

router.delete("/analytics/api-keys/:id", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const keyId = Number(req.params.id);
    const [deleted] = await db
      .delete(analyticsApiKeysTable)
      .where(and(eq(analyticsApiKeysTable.id, keyId), eq(analyticsApiKeysTable.clientId, clientId)))
      .returning();

    if (!deleted) { res.status(404).json({ error: "API key not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("API key delete error:", err);
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

router.get("/analytics/sla-overview", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const allBots = await db
      .select({ id: botsTable.id, name: botsTable.name })
      .from(botsTable);

    const slaStats = await db
      .select({
        botId: botSlaEventsTable.botId,
        total: sql<number>`COUNT(*)`,
        breached: sql<number>`SUM(CASE WHEN ${botSlaEventsTable.breached} THEN 1 ELSE 0 END)`,
      })
      .from(botSlaEventsTable)
      .where(
        and(
          eq(botSlaEventsTable.clientId, clientId),
          gte(botSlaEventsTable.createdAt, sevenDaysAgo)
        )
      )
      .groupBy(botSlaEventsTable.botId);

    const botsMap = Object.fromEntries(allBots.map((b) => [b.id, b.name]));

    const overview = slaStats.map((s) => {
      const total = Number(s.total);
      const breached = Number(s.breached);
      const met = total - breached;
      const complianceRate = total > 0 ? Math.round((met / total) * 1000) / 10 : 100;

      let status: "green" | "yellow" | "red" = "green";
      if (complianceRate < 85) status = "red";
      else if (complianceRate < 95) status = "yellow";

      return {
        botId: s.botId,
        botName: botsMap[s.botId] ?? `Bot #${s.botId}`,
        total,
        breached,
        complianceRate,
        status,
      };
    });

    const platformBreach7d = await db
      .select({
        total: sql<number>`COUNT(*)`,
        breached: sql<number>`SUM(CASE WHEN ${botSlaEventsTable.breached} THEN 1 ELSE 0 END)`,
      })
      .from(botSlaEventsTable)
      .where(
        and(
          eq(botSlaEventsTable.clientId, clientId),
          gte(botSlaEventsTable.createdAt, sevenDaysAgo)
        )
      );

    const totalEvents = Number(platformBreach7d[0]?.total ?? 0);
    const totalBreached = Number(platformBreach7d[0]?.breached ?? 0);
    const overallComplianceRate = totalEvents > 0 ? Math.round(((totalEvents - totalBreached) / totalEvents) * 1000) / 10 : 100;

    res.json({
      overallComplianceRate,
      totalEvents,
      totalBreached,
      bots: overview.sort((a, b) => a.complianceRate - b.complianceRate),
    });
  } catch (err) {
    console.error("SLA overview error:", err);
    res.status(500).json({ error: "Failed to fetch SLA overview" });
  }
});

router.get("/analytics/spend-by-tier", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { getLlmUsageByTier } = await import("../../services/analytics/llm-usage.js");
    const data = await getLlmUsageByTier(clientId);
    res.json(data);
  } catch (err) {
    console.error("Spend by tier error:", err);
    res.status(500).json({ error: "Failed to fetch tier spend analytics" });
  }
});

router.get("/analytics/scaling", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { getScalingTelemetry } = await import("../../services/analytics/scaling-telemetry.js");
    const windowDays = Math.min(180, Math.max(1, Number(req.query.windowDays) || 30));
    const data = await getScalingTelemetry(clientId, windowDays);
    res.json(data);
  } catch (err) {
    console.error("Scaling telemetry error:", err);
    res.status(500).json({ error: "Failed to fetch scaling telemetry" });
  }
});

// ── Self-optimizing model routing — observability (task #231) ───────────────
router.get("/analytics/model-optimizer", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const windowDays = Math.min(180, Math.max(1, Number(req.query.windowDays) || 30));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Per-model live performance (resolved, non-shadow telemetry) by category.
    const byModel = await db
      .select({
        taskCategory: modelSelectionTelemetryTable.taskCategory,
        model: modelSelectionTelemetryTable.model,
        modelTier: modelSelectionTelemetryTable.modelTier,
        decisions: sql<number>`COUNT(*)`,
        avgReward: sql<number>`AVG(${modelSelectionTelemetryTable.rewardScore})`,
        avgQuality: sql<number>`AVG(${modelSelectionTelemetryTable.qualityScore})`,
        avgCost: sql<number>`AVG(${modelSelectionTelemetryTable.costUsd})`,
        avgLatencyMs: sql<number>`AVG(${modelSelectionTelemetryTable.latencyMs})`,
      })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.clientId, clientId),
          eq(modelSelectionTelemetryTable.shadow, false),
          isNotNull(modelSelectionTelemetryTable.rewardScore),
          gte(modelSelectionTelemetryTable.createdAt, since),
        ),
      )
      .groupBy(
        modelSelectionTelemetryTable.taskCategory,
        modelSelectionTelemetryTable.model,
        modelSelectionTelemetryTable.modelTier,
      );

    // Selection-mode distribution (optimizer vs fallback vs pending vs shadow).
    const byMode = await db
      .select({
        selectionMode: modelSelectionTelemetryTable.selectionMode,
        count: sql<number>`COUNT(*)`,
      })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.clientId, clientId),
          gte(modelSelectionTelemetryTable.createdAt, since),
        ),
      )
      .groupBy(modelSelectionTelemetryTable.selectionMode);

    // Shadow comparisons (candidate model vs the model that actually served).
    const shadow = await db
      .select({
        taskCategory: modelSelectionTelemetryTable.taskCategory,
        candidateModel: modelSelectionTelemetryTable.model,
        servedModel: modelSelectionTelemetryTable.chosenModel,
        samples: sql<number>`COUNT(*)`,
        avgCandidateReward: sql<number>`AVG(${modelSelectionTelemetryTable.rewardScore})`,
        avgCandidateQuality: sql<number>`AVG(${modelSelectionTelemetryTable.qualityScore})`,
      })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.clientId, clientId),
          eq(modelSelectionTelemetryTable.shadow, true),
          isNotNull(modelSelectionTelemetryTable.rewardScore),
          gte(modelSelectionTelemetryTable.createdAt, since),
        ),
      )
      .groupBy(
        modelSelectionTelemetryTable.taskCategory,
        modelSelectionTelemetryTable.model,
        modelSelectionTelemetryTable.chosenModel,
      );

    // Reward component breakdown: quality, judge quality, cost, latency averages.
    const rewardComponents = await db
      .select({
        taskCategory: modelSelectionTelemetryTable.taskCategory,
        model: modelSelectionTelemetryTable.model,
        difficultyBucket: modelSelectionTelemetryTable.difficultyBucket,
        avgQuality: sql<number>`avg(${modelSelectionTelemetryTable.qualityScore})`,
        avgJudgeQuality: sql<number>`avg(${modelSelectionTelemetryTable.judgeQualityScore})`,
        avgCost: sql<number>`avg(${modelSelectionTelemetryTable.costUsd})`,
        avgLatency: sql<number>`avg(${modelSelectionTelemetryTable.latencyMs})`,
        avgReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
        judgedCount: sql<number>`count(${modelSelectionTelemetryTable.judgeQualityScore})`,
        totalCount: sql<number>`count(*)`,
      })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.clientId, clientId),
          eq(modelSelectionTelemetryTable.shadow, false),
          isNotNull(modelSelectionTelemetryTable.rewardScore),
          gte(modelSelectionTelemetryTable.createdAt, since),
        ),
      )
      .groupBy(
        modelSelectionTelemetryTable.taskCategory,
        modelSelectionTelemetryTable.model,
        modelSelectionTelemetryTable.difficultyBucket,
      );

    // Learned reputation table with skew/outlier flags and judge quality.
    const reputation = await db
      .select({
        taskCategory: modelReputationTable.taskCategory,
        model: modelReputationTable.model,
        difficultyBucket: modelReputationTable.difficultyBucket,
        avgReward: modelReputationTable.avgReward,
        avgQuality: modelReputationTable.avgQuality,
        avgJudgeQuality: modelReputationTable.avgJudgeQuality,
        avgCostUsd: modelReputationTable.avgCostUsd,
        avgLatencyMs: modelReputationTable.avgLatencyMs,
        sampleCount: modelReputationTable.sampleCount,
        tenantCount: modelReputationTable.tenantCount,
        maxTenantFraction: modelReputationTable.maxTenantFraction,
        skewFlag: modelReputationTable.skewFlag,
        promoted: modelReputationTable.promoted,
      })
      .from(modelReputationTable);

    // Golden eval results (latest per model).
    let goldenEvalResults: Array<{
      model: string;
      meanJudgeScore: number;
      promptCount: number;
      regressionFlag: boolean;
      runDate: Date;
    }> = [];
    try {
      const { getLatestGoldenEvalResults } = await import("../../services/ai-safety/golden-eval.js");
      goldenEvalResults = await getLatestGoldenEvalResults();
    } catch { }

    // Skew summary: segments with dominant tenants.
    const skewedSegments = reputation.filter((r) => r.skewFlag);

    res.json({
      windowDays,
      byModel: byModel.map((r) => ({
        taskCategory: r.taskCategory,
        model: r.model,
        modelTier: r.modelTier,
        decisions: Number(r.decisions),
        avgReward: r.avgReward != null ? Number(r.avgReward) : null,
        avgQuality: r.avgQuality != null ? Number(r.avgQuality) : null,
        avgCost: r.avgCost != null ? Number(r.avgCost) : null,
        avgLatencyMs: r.avgLatencyMs != null ? Number(r.avgLatencyMs) : null,
      })),
      byMode: byMode.map((r) => ({ selectionMode: r.selectionMode, count: Number(r.count) })),
      shadow: shadow.map((r) => ({
        taskCategory: r.taskCategory,
        candidateModel: r.candidateModel,
        servedModel: r.servedModel,
        samples: Number(r.samples),
        avgCandidateReward: r.avgCandidateReward != null ? Number(r.avgCandidateReward) : null,
        avgCandidateQuality: r.avgCandidateQuality != null ? Number(r.avgCandidateQuality) : null,
      })),
      reputation: reputation.map((r) => ({
        taskCategory: r.taskCategory,
        model: r.model,
        difficultyBucket: r.difficultyBucket,
        avgReward: r.avgReward != null ? Number(r.avgReward) : null,
        avgQuality: r.avgQuality != null ? Number(r.avgQuality) : null,
        avgJudgeQuality: r.avgJudgeQuality != null ? Number(r.avgJudgeQuality) : null,
        avgCostUsd: r.avgCostUsd != null ? Number(r.avgCostUsd) : null,
        avgLatencyMs: r.avgLatencyMs != null ? Number(r.avgLatencyMs) : null,
        sampleCount: Number(r.sampleCount),
        tenantCount: Number(r.tenantCount),
        maxTenantFraction: r.maxTenantFraction != null ? Number(r.maxTenantFraction) : null,
        skewFlag: Boolean(r.skewFlag),
        promoted: Boolean(r.promoted),
      })),
      rewardComponents: rewardComponents.map((r) => ({
        taskCategory: r.taskCategory,
        model: r.model,
        difficultyBucket: r.difficultyBucket,
        avgQuality: r.avgQuality != null ? Number(r.avgQuality) : null,
        avgJudgeQuality: r.avgJudgeQuality != null ? Number(r.avgJudgeQuality) : null,
        avgCostUsd: r.avgCost != null ? Number(r.avgCost) : null,
        avgLatencyMs: r.avgLatency != null ? Number(r.avgLatency) : null,
        avgReward: r.avgReward != null ? Number(r.avgReward) : null,
        judgedFraction: Number(r.totalCount) > 0 ? Number(r.judgedCount) / Number(r.totalCount) : 0,
      })),
      goldenEval: goldenEvalResults.map((r) => ({
        model: r.model,
        meanJudgeScore: r.meanJudgeScore,
        promptCount: r.promptCount,
        regressionFlag: r.regressionFlag,
        runDate: r.runDate,
      })),
      skewSummary: {
        skewedSegmentCount: skewedSegments.length,
        skewedSegments: skewedSegments.map((r) => ({
          model: r.model,
          taskCategory: r.taskCategory,
          difficultyBucket: r.difficultyBucket,
          maxTenantFraction: r.maxTenantFraction != null ? Number(r.maxTenantFraction) : null,
          tenantCount: Number(r.tenantCount),
        })),
      },
    });
  } catch (err) {
    console.error("Model optimizer analytics error:", err);
    res.status(500).json({ error: "Failed to fetch model optimizer analytics" });
  }
});

// ── LLM Capacity & Real-Time Cost Governance ─────────────────────────────────

/**
 * GET /analytics/capacity-config
 * Returns the tenant's current token quota, spend cap, and GLM key pool status.
 */
router.get("/analytics/capacity-config", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const [quota, cap, spend, poolStatus] = await Promise.all([
      getTokenQuotaConfig(clientId),
      getCostCap(clientId),
      getMonthlySpend(clientId),
      Promise.resolve(getGlmPoolStatus()),
    ]);

    res.json({
      tokenQuota: quota
        ? {
            monthlyTokenCap: quota.monthlyTokenCap,
            softLimitPct: quota.softLimitPct,
            degradationPolicy: quota.degradationPolicy,
            alertAt80Pct: quota.alertAt80Pct,
          }
        : null,
      budgetCap: cap
        ? {
            monthlyCapUsd: parseFloat(cap.monthlyCapUsd),
            alertAt80Pct: cap.alertAt80Pct,
            pauseAutonomousOnExhaust: cap.pauseAutonomousOnExhaust,
          }
        : null,
      currentMonthlySpendUsd: spend,
      glmKeyPool: poolStatus,
    });
  } catch (err) {
    console.error("Capacity config fetch error:", err);
    res.status(500).json({ error: "Failed to fetch capacity config" });
  }
});

/**
 * PUT /analytics/capacity-config/token-quota
 * Set (or update) the per-tenant monthly token quota and degradation policy.
 * Audited like other governance changes.
 */
router.put("/analytics/capacity-config/token-quota", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const schema = z.object({
    monthlyTokenCap: z.number().int().min(0),
    softLimitPct: z.number().int().min(50).max(99).optional().default(80),
    degradationPolicy: z.enum(["downgrade", "shed", "reject"]).optional().default("downgrade"),
    alertAt80Pct: z.boolean().optional().default(true),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const existing = await db
      .select()
      .from(clientTokenQuotasTable)
      .where(eq(clientTokenQuotasTable.clientId, clientId));

    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(clientTokenQuotasTable)
        .set({
          monthlyTokenCap: parsed.data.monthlyTokenCap,
          softLimitPct: parsed.data.softLimitPct,
          degradationPolicy: parsed.data.degradationPolicy,
          alertAt80Pct: parsed.data.alertAt80Pct,
          updatedAt: new Date(),
        })
        .where(eq(clientTokenQuotasTable.clientId, clientId))
        .returning();
    } else {
      [result] = await db
        .insert(clientTokenQuotasTable)
        .values({
          clientId,
          monthlyTokenCap: parsed.data.monthlyTokenCap,
          softLimitPct: parsed.data.softLimitPct,
          degradationPolicy: parsed.data.degradationPolicy,
          alertAt80Pct: parsed.data.alertAt80Pct,
        })
        .returning();
    }

    invalidateTokenQuotaCache(clientId);

    await db.insert(platformAuditLogTable).values({
      clientId,
      userId: req.user!.userId ?? null,
      action: "token_quota_updated",
      resource: "client_token_quotas",
      resourceId: String(clientId),
      metadata: {
        monthlyTokenCap: parsed.data.monthlyTokenCap,
        softLimitPct: parsed.data.softLimitPct,
        degradationPolicy: parsed.data.degradationPolicy,
        alertAt80Pct: parsed.data.alertAt80Pct,
      },
      ipAddress: req.ip ?? null,
    }).catch((e) => console.error("[analytics] Audit insert failed:", e));

    res.json(result);
  } catch (err) {
    console.error("Token quota update error:", err);
    res.status(500).json({ error: "Failed to update token quota" });
  }
});

/**
 * PUT /analytics/capacity-config/budget-cap
 * Update the monthly spend cap and degradation behaviour.
 * Proxies to the existing cost-cap service and also audits the change.
 */
router.put("/analytics/capacity-config/budget-cap", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const schema = z.object({
    monthlyCapUsd: z.number().min(0),
    alertAt80Pct: z.boolean().optional().default(true),
    pauseAutonomousOnExhaust: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const result = await upsertCostCap(
      clientId,
      parsed.data.monthlyCapUsd,
      parsed.data.alertAt80Pct,
      parsed.data.pauseAutonomousOnExhaust,
    );

    invalidateBudgetCache(clientId);

    await db.insert(platformAuditLogTable).values({
      clientId,
      userId: req.user!.userId ?? null,
      action: "budget_cap_updated",
      resource: "client_cost_caps",
      resourceId: String(clientId),
      metadata: {
        monthlyCapUsd: parsed.data.monthlyCapUsd,
        alertAt80Pct: parsed.data.alertAt80Pct,
        pauseAutonomousOnExhaust: parsed.data.pauseAutonomousOnExhaust,
      },
      ipAddress: req.ip ?? null,
    }).catch((e) => console.error("[analytics] Audit insert failed:", e));

    res.json(result);
  } catch (err) {
    console.error("Budget cap update error:", err);
    res.status(500).json({ error: "Failed to update budget cap" });
  }
});

export default router;
