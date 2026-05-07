import { Router, type IRouter } from "express";
import { db, aeoScoresTable, aeoWebhooksTable, aeoScanRequestsTable, mcpToolCallsTable } from "@workspace/db";
import { eq, gt, sql } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";

const router: IRouter = Router();

router.get("/integrations/piratemonster/aeo-health", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  if (!req.user?.bypassPayment) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await db.execute(sql`
      WITH ranked AS (
        SELECT
          s.client_id,
          s.overall_score,
          s.citation_count,
          s.scanned_at,
          ROW_NUMBER() OVER (PARTITION BY s.client_id ORDER BY s.scanned_at DESC) AS rn
        FROM aeo_scores s
        WHERE s.scan_type = 'client' AND s.client_id IS NOT NULL
      ),
      latest AS (
        SELECT client_id, overall_score AS latest_score, citation_count, scanned_at AS latest_scanned_at
        FROM ranked WHERE rn = 1
      ),
      previous AS (
        SELECT client_id, overall_score AS prev_score
        FROM ranked WHERE rn = 2
      )
      SELECT
        c.id AS client_id,
        c.company_name,
        l.latest_score,
        l.citation_count,
        l.latest_scanned_at AS scanned_at,
        p.prev_score
      FROM clients c
      LEFT JOIN latest l ON l.client_id = c.id
      LEFT JOIN previous p ON p.client_id = c.id
      WHERE c.status = 'active'
      ORDER BY l.latest_score ASC NULLS FIRST
    `);

    const results = (rows.rows as Array<{
      client_id: number;
      company_name: string;
      latest_score: number | null;
      citation_count: number | null;
      scanned_at: string | null;
      prev_score: number | null;
    }>).map((row) => {
      const delta = row.latest_score !== null && row.prev_score !== null
        ? row.latest_score - row.prev_score
        : null;
      const trend = delta === null
        ? "no_data"
        : delta > 0 ? "improving" : delta < 0 ? "declining" : "stable";
      const isStale = !row.scanned_at || new Date(row.scanned_at) < sevenDaysAgo;

      return {
        clientId: row.client_id,
        companyName: row.company_name,
        latestScore: row.latest_score,
        citationCount: row.citation_count,
        scannedAt: row.scanned_at,
        delta,
        trend,
        isStale,
        noData: row.scanned_at === null,
      };
    });

    res.json(results);
  } catch (err) {
    console.error("Error fetching AEO health:", err);
    res.status(500).json({ error: "Failed to fetch AEO health" });
  }
});

router.get("/integrations/piratemonster/mcp-stats", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  if (!req.user?.bypassPayment) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const toolCallStats = await db
      .select({
        toolName: mcpToolCallsTable.toolName,
        count: sql<number>`count(*)::int`,
        cachedCount: sql<number>`sum(case when ${mcpToolCallsTable.cached} then 1 else 0 end)::int`,
      })
      .from(mcpToolCallsTable)
      .where(gt(mcpToolCallsTable.calledAt, sevenDaysAgo))
      .groupBy(mcpToolCallsTable.toolName);

    const totalCalls = toolCallStats.reduce((sum, s) => sum + s.count, 0);
    const totalCached = toolCallStats.reduce((sum, s) => sum + (s.cachedCount || 0), 0);
    const cacheHitRate = totalCalls > 0 ? Math.round((totalCached / totalCalls) * 100) : 0;

    const [{ count: activeWebhookCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aeoWebhooksTable)
      .where(eq(aeoWebhooksTable.status, "active"));

    const [{ count: pendingScanCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aeoScanRequestsTable)
      .where(eq(aeoScanRequestsTable.status, "queued"));

    res.json({
      toolCallStats,
      totalCalls,
      cacheHitRate,
      activeWebhookCount,
      pendingScanCount,
    });
  } catch (err) {
    console.error("Error fetching MCP stats:", err);
    res.status(500).json({ error: "Failed to fetch MCP stats" });
  }
});

export default router;
