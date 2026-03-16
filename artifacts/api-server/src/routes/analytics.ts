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
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";
import {
  getMonthlySpend,
  getCostCap,
  upsertCostCap,
  checkCostCapAlerts,
} from "../services/cost-caps";
import { hashApiKey } from "../middleware/analytics-api-key";

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

router.get("/analytics/spend", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, string>);

    const conditions: any[] = [eq(llmUsageLogTable.clientId, clientId)];
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
    const monthlySpend = await getMonthlySpend(clientId);

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

    const conditions: any[] = [eq(llmUsageLogTable.clientId, clientId)];
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

    const conditions: any[] = [eq(toolActivityLogTable.clientId, clientId)];
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

    const conditions: any[] = [eq(llmUsageLogTable.clientId, clientId)];
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

    const conditions: any[] = [eq(pipelinesTable.clientId, clientId)];
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

    const conditions: any[] = [eq(backgroundReportsTable.clientId, clientId)];
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
      const conds: any[] = [eq(llmUsageLogTable.clientId, clientId)];
      if (dateFrom) conds.push(gte(llmUsageLogTable.calledAt, dateFrom));
      if (dateTo) conds.push(lte(llmUsageLogTable.calledAt, dateTo));

      rows = await db
        .select()
        .from(llmUsageLogTable)
        .where(and(...conds))
        .orderBy(desc(llmUsageLogTable.calledAt));
      filename = "llm_usage.csv";
    } else if (dataset === "tool-activity") {
      const conds: any[] = [eq(toolActivityLogTable.clientId, clientId)];
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

export default router;
