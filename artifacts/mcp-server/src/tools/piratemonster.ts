import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  db,
  aeoScoresTable,
  mcpToolCallsTable,
  aeoScanRequestsTable,
  aeoRecommendationCacheTable,
  aeoWebhooksTable,
} from "@workspace/db";
import { eq, desc, and, or, sql, gt } from "drizzle-orm";
import crypto from "node:crypto";
import { apiPost } from "../api-client.js";
import { validateUrl } from "./http-fetch.js";

export interface McpSessionContext {
  partnerKeyId: number | null;
  rateLimit: number;
  allowedTools?: string[] | null;
}

function isToolAllowed(toolName: string, allowedTools: string[] | null | undefined): boolean {
  if (!allowedTools || allowedTools.length === 0) return true;
  return allowedTools.includes(toolName);
}

async function logToolCall(partnerKeyId: number | null, opts: {
  toolName: string;
  inputUrl?: string | null;
  inputJson?: unknown;
  responseStatus: string;
  latencyMs: number;
  cached: boolean;
}) {
  try {
    await db.insert(mcpToolCallsTable).values({
      partnerKeyId,
      toolName: opts.toolName,
      inputUrl: opts.inputUrl ?? null,
      inputJson: opts.inputJson ?? null,
      responseStatus: opts.responseStatus,
      latencyMs: opts.latencyMs,
      cached: opts.cached,
    });
  } catch (err) {
    console.error("[MCP] Failed to log tool call:", err);
  }
}

function computeFreshness(scannedAt: Date): { dataFreshnessHours: number; freshnessStatus: string } {
  const hoursAgo = Math.floor((Date.now() - scannedAt.getTime()) / (1000 * 60 * 60));
  let freshnessStatus = "fresh";
  if (hoursAgo >= 168) {
    freshnessStatus = "very_stale";
  } else if (hoursAgo >= 24) {
    freshnessStatus = "stale";
  }
  return { dataFreshnessHours: hoursAgo, freshnessStatus };
}

function registerPmGetScore(server: McpServer, partnerKeyId: number | null, allowedTools?: string[] | null): void {
  if (!isToolAllowed("pm_get_score", allowedTools)) return;
  server.tool(
    "pm_get_score",
    "Get the Cloud 9 AEO score for a URL, including overall score (0-100), citation count, per-engine breakdown across 9 AI engines, and data freshness status.",
    {
      url: z.string().url().describe("The URL to get the AEO score for"),
    },
    async ({ url }) => {
      const start = Date.now();
      try {
        const [latest] = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.sourceUrl, url))
          .orderBy(desc(aeoScoresTable.scannedAt))
          .limit(1);

        if (!latest) {
          await logToolCall(partnerKeyId, { toolName: "pm_get_score", inputUrl: url, responseStatus: "no_data", latencyMs: Date.now() - start, cached: false });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ status: "no_data", suggestion: "call pm_request_scan to queue a scan" }) }],
          };
        }

        const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
        const { dataFreshnessHours, freshnessStatus } = computeFreshness(latest.scannedAt);

        const result = {
          url,
          overallScore: latest.overallScore,
          citationCount: latest.citationCount,
          engineBreakdown: Object.fromEntries(
            Object.entries(engines).map(([engine, data]) => [engine, { cited: data.cited, score: data.score }])
          ),
          lastScannedAt: latest.scannedAt.toISOString(),
          dataFreshnessHours,
          freshnessStatus,
        };

        await logToolCall(partnerKeyId, { toolName: "pm_get_score", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_get_score", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

function registerPmGetRecommendations(server: McpServer, partnerKeyId: number | null, allowedTools?: string[] | null): void {
  if (!isToolAllowed("pm_get_recommendations", allowedTools)) return;
  server.tool(
    "pm_get_recommendations",
    "Get structured AEO improvement recommendations for a URL, based on stored scan data. Results are cached for 24 hours.",
    {
      url: z.string().url().describe("The URL to get recommendations for"),
    },
    async ({ url }) => {
      const start = Date.now();
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [cached] = await db
          .select()
          .from(aeoRecommendationCacheTable)
          .where(
            and(
              eq(aeoRecommendationCacheTable.url, url),
              eq(aeoRecommendationCacheTable.cacheType, "recommendations"),
              gt(aeoRecommendationCacheTable.cachedAt, twentyFourHoursAgo)
            )
          )
          .orderBy(desc(aeoRecommendationCacheTable.cachedAt))
          .limit(1);

        if (cached) {
          await logToolCall(partnerKeyId, { toolName: "pm_get_recommendations", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: true });
          return { content: [{ type: "text" as const, text: JSON.stringify(cached.resultJson, null, 2) }] };
        }

        const [latest] = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.sourceUrl, url))
          .orderBy(desc(aeoScoresTable.scannedAt))
          .limit(1);

        if (!latest) {
          await logToolCall(partnerKeyId, { toolName: "pm_get_recommendations", inputUrl: url, responseStatus: "no_data", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ status: "no_data", url, suggestion: "No scan data available. Call pm_request_scan first." }) }] };
        }

        const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
        const storedRecs = (latest.recommendations as string[]) || [];

        const recommendations: Array<{ engine: string; action: string; impact: string; difficulty: string; priority: number }> = [];

        for (let i = 0; i < storedRecs.length; i++) {
          recommendations.push({
            engine: "all",
            action: storedRecs[i],
            impact: i < 3 ? "high" : "medium",
            difficulty: i < 2 ? "medium" : "low",
            priority: i + 1,
          });
        }

        const citedEngines = Object.entries(engines).filter(([, v]) => v.cited).map(([k]) => k);
        const uncitedEngines = Object.entries(engines).filter(([, v]) => !v.cited).map(([k]) => k);

        const { dataFreshnessHours, freshnessStatus } = computeFreshness(latest.scannedAt);

        const result = {
          url,
          overallScore: latest.overallScore,
          citationCount: latest.citationCount,
          citedEngines,
          uncitedEngines,
          recommendations,
          dataFreshnessHours,
          freshnessStatus,
          cachedAt: new Date().toISOString(),
        };

        await db.insert(aeoRecommendationCacheTable).values({
          url,
          cacheType: "recommendations",
          resultJson: result,
        });

        await logToolCall(partnerKeyId, { toolName: "pm_get_recommendations", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_get_recommendations", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

export function registerPirateMonsterGalaxyBotsTools(server: McpServer, ctx: McpSessionContext): void {
  console.log("[MCP] Registering PirateMonster tools for GalaxyBots (pm_get_score + pm_get_recommendations)...");
  registerPmGetScore(server, ctx.partnerKeyId, ctx.allowedTools);
  registerPmGetRecommendations(server, ctx.partnerKeyId, ctx.allowedTools);
}

export function registerPirateMonsterReadTools(server: McpServer, ctx: McpSessionContext): void {
  console.log("[MCP] Registering PirateMonster read tools...");
  const { partnerKeyId, allowedTools } = ctx;

  registerPmGetScore(server, partnerKeyId, allowedTools);

  if (isToolAllowed("pm_get_scan_history", allowedTools)) server.tool(
    "pm_get_scan_history",
    "Get up to 10 historical AEO score records for a URL, with per-engine change tracking between scans.",
    {
      url: z.string().url().describe("The URL to get scan history for"),
    },
    async ({ url }) => {
      const start = Date.now();
      try {
        const scores = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.sourceUrl, url))
          .orderBy(desc(aeoScoresTable.scannedAt))
          .limit(10);

        if (scores.length === 0) {
          await logToolCall(partnerKeyId, { toolName: "pm_get_scan_history", inputUrl: url, responseStatus: "no_data", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ status: "no_data", url }) }] };
        }

        const history = scores.map((score, idx) => {
          const engines = score.engineScores as Record<string, { score: number; cited: boolean }>;
          const entry: Record<string, unknown> = {
            overallScore: score.overallScore,
            citationCount: score.citationCount,
            scannedAt: score.scannedAt.toISOString(),
            engineScores: engines,
          };

          if (idx < scores.length - 1) {
            const prevEngines = scores[idx + 1].engineScores as Record<string, { score: number; cited: boolean }>;
            const gained: string[] = [];
            const lost: string[] = [];
            for (const [engine, data] of Object.entries(engines)) {
              const prev = prevEngines[engine];
              if (prev) {
                if (data.cited && !prev.cited) gained.push(engine);
                if (!data.cited && prev.cited) lost.push(engine);
              }
            }
            entry.enginesGained = gained;
            entry.enginesLost = lost;
            entry.scoreChange = score.overallScore - scores[idx + 1].overallScore;
          }

          return entry;
        });

        await logToolCall(partnerKeyId, { toolName: "pm_get_scan_history", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify({ url, history }, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_get_scan_history", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  if (isToolAllowed("pm_compare_urls", allowedTools)) server.tool(
    "pm_compare_urls",
    "Compare AEO scores side-by-side for 2-5 URLs, showing Cloud 9 score, citations, per-engine breakdown, and freshness per URL.",
    {
      urls: z.array(z.string().url()).min(2).max(5).describe("2-5 URLs to compare"),
    },
    async ({ urls }) => {
      const start = Date.now();
      try {
        const comparisons = await Promise.all(
          urls.map(async (url) => {
            const [latest] = await db
              .select()
              .from(aeoScoresTable)
              .where(eq(aeoScoresTable.sourceUrl, url))
              .orderBy(desc(aeoScoresTable.scannedAt))
              .limit(1);

            if (!latest) {
              return { url, status: "no_data" as const };
            }

            const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
            const { dataFreshnessHours, freshnessStatus } = computeFreshness(latest.scannedAt);

            return {
              url,
              status: "ok" as const,
              overallScore: latest.overallScore,
              citationCount: latest.citationCount,
              engineBreakdown: engines,
              lastScannedAt: latest.scannedAt.toISOString(),
              dataFreshnessHours,
              freshnessStatus,
            };
          })
        );

        await logToolCall(partnerKeyId, { toolName: "pm_compare_urls", inputJson: { urls }, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify({ comparisons }, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_compare_urls", inputJson: { urls }, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  if (isToolAllowed("pm_track_citations", allowedTools)) server.tool(
    "pm_track_citations",
    "Track per-engine citation status for a URL, showing which AI engines cite it and their scores.",
    {
      url: z.string().url().describe("The URL to track citations for"),
    },
    async ({ url }) => {
      const start = Date.now();
      try {
        const [latest] = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.sourceUrl, url))
          .orderBy(desc(aeoScoresTable.scannedAt))
          .limit(1);

        if (!latest) {
          await logToolCall(partnerKeyId, { toolName: "pm_track_citations", inputUrl: url, responseStatus: "no_data", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ status: "no_data", url }) }] };
        }

        const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
        const { dataFreshnessHours, freshnessStatus } = computeFreshness(latest.scannedAt);

        const recommendations = (latest.recommendations as string[]) || [];
        const citations = Object.fromEntries(
          Object.entries(engines).map(([engine, data]) => [engine, { cited: data.cited, score: data.score }])
        );

        const citedEngines = Object.entries(engines).filter(([, v]) => v.cited).map(([k]) => k);
        const uncitedEngines = Object.entries(engines).filter(([, v]) => !v.cited).map(([k]) => k);

        const result = {
          url,
          totalCitations: latest.citationCount,
          citedEngines,
          uncitedEngines,
          citations,
          citationContext: recommendations.length > 0 ? recommendations : null,
          lastScannedAt: latest.scannedAt.toISOString(),
          dataFreshnessHours,
          freshnessStatus,
        };

        await logToolCall(partnerKeyId, { toolName: "pm_track_citations", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_track_citations", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

export function registerPirateMonsterScanTools(server: McpServer, ctx: McpSessionContext): void {
  console.log("[MCP] Registering PirateMonster scan tools...");
  const { partnerKeyId, allowedTools } = ctx;

  if (isToolAllowed("pm_request_scan", allowedTools)) server.tool(
    "pm_request_scan",
    "Queue a new AEO scan for a URL. Scans are processed asynchronously and results delivered via webhook.",
    {
      url: z.string().url().describe("The URL to scan"),
    },
    async ({ url }) => {
      const start = Date.now();
      try {
        if (!partnerKeyId) {
          await logToolCall(partnerKeyId, { toolName: "pm_request_scan", inputUrl: url, responseStatus: "unauthorized", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Partner key required" }) }], isError: true };
        }

        const existing = await db
          .select()
          .from(aeoScanRequestsTable)
          .where(
            and(
              eq(aeoScanRequestsTable.url, url),
              eq(aeoScanRequestsTable.partnerKeyId, partnerKeyId),
              or(
                eq(aeoScanRequestsTable.status, "queued"),
                eq(aeoScanRequestsTable.status, "processing")
              )
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await logToolCall(partnerKeyId, { toolName: "pm_request_scan", inputUrl: url, responseStatus: "existing", latencyMs: Date.now() - start, cached: false });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              requestId: existing[0].id,
              status: existing[0].status,
              message: "A scan request for this URL is already in progress",
            }) }],
          };
        }

        const [request] = await db.insert(aeoScanRequestsTable).values({
          partnerKeyId,
          url,
          status: "queued",
        }).returning();

        await logToolCall(partnerKeyId, { toolName: "pm_request_scan", inputUrl: url, responseStatus: "queued", latencyMs: Date.now() - start, cached: false });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            requestId: request.id,
            status: "queued",
            message: "Results delivered via webhook when scan completes",
          }) }],
        };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_request_scan", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );

  if (isToolAllowed("pm_get_scan_status", allowedTools)) server.tool(
    "pm_get_scan_status",
    "Check the status of a scan request by its request ID.",
    {
      requestId: z.number().int().describe("The scan request ID to check"),
    },
    async ({ requestId }) => {
      const start = Date.now();
      try {
        const conditions = [eq(aeoScanRequestsTable.id, requestId)];
        if (partnerKeyId) {
          conditions.push(eq(aeoScanRequestsTable.partnerKeyId, partnerKeyId));
        }

        const [request] = await db
          .select()
          .from(aeoScanRequestsTable)
          .where(and(...conditions))
          .limit(1);

        if (!request) {
          await logToolCall(partnerKeyId, { toolName: "pm_get_scan_status", inputJson: { requestId }, responseStatus: "not_found", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Scan request not found" }) }], isError: true };
        }

        const result: Record<string, unknown> = {
          requestId: request.id,
          url: request.url,
          status: request.status,
          requestedAt: request.requestedAt.toISOString(),
        };

        if (request.completedAt) result.completedAt = request.completedAt.toISOString();
        if (request.scoreId) result.scoreId = request.scoreId;

        await logToolCall(partnerKeyId, { toolName: "pm_get_scan_status", inputJson: { requestId }, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_get_scan_status", inputJson: { requestId }, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

export function registerPirateMonsterCachedTools(server: McpServer, ctx: McpSessionContext): void {
  console.log("[MCP] Registering PirateMonster cached tools...");
  const { partnerKeyId, allowedTools } = ctx;

  registerPmGetRecommendations(server, partnerKeyId, allowedTools);

  if (isToolAllowed("pm_optimize_schema", allowedTools)) server.tool(
    "pm_optimize_schema",
    "Generate JSON-LD schema markup recommendations for a URL using AI analysis. Results are cached for 24 hours. Hard-limited to 5 calls per partner key per hour.",
    {
      url: z.string().url().describe("The URL to generate schema recommendations for"),
      businessType: z.string().optional().describe("Optional business type hint (e.g., 'restaurant', 'saas', 'ecommerce')"),
    },
    async ({ url, businessType }) => {
      const start = Date.now();
      try {
        if (partnerKeyId) {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const [{ count: schemaCallCount }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(mcpToolCallsTable)
            .where(
              and(
                eq(mcpToolCallsTable.partnerKeyId, partnerKeyId),
                eq(mcpToolCallsTable.toolName, "pm_optimize_schema"),
                gt(mcpToolCallsTable.calledAt, oneHourAgo)
              )
            );

          if (schemaCallCount >= 5) {
            await logToolCall(partnerKeyId, { toolName: "pm_optimize_schema", inputUrl: url, responseStatus: "rate_limited", latencyMs: Date.now() - start, cached: false });
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded: maximum 5 schema optimization calls per hour per key" }) }],
              isError: true,
            };
          }
        }

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [cached] = await db
          .select()
          .from(aeoRecommendationCacheTable)
          .where(
            and(
              eq(aeoRecommendationCacheTable.url, url),
              eq(aeoRecommendationCacheTable.cacheType, "schema"),
              gt(aeoRecommendationCacheTable.cachedAt, twentyFourHoursAgo)
            )
          )
          .orderBy(desc(aeoRecommendationCacheTable.cachedAt))
          .limit(1);

        if (cached) {
          await logToolCall(partnerKeyId, { toolName: "pm_optimize_schema", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: true });
          return { content: [{ type: "text" as const, text: JSON.stringify(cached.resultJson, null, 2) }] };
        }

        const [latest] = await db
          .select()
          .from(aeoScoresTable)
          .where(eq(aeoScoresTable.sourceUrl, url))
          .orderBy(desc(aeoScoresTable.scannedAt))
          .limit(1);

        let aiResult: unknown;
        try {
          aiResult = await apiPost("/integrations/piratemonster/recommend", {
            url,
            context: `Generate JSON-LD schema markup recommendations.${businessType ? ` Business type: ${businessType}.` : ""} Focus on FAQ, HowTo, Organization, LocalBusiness, and other relevant schema types for AEO optimization.${latest ? ` Current score: ${latest.overallScore}/100, citations: ${latest.citationCount}.` : ""}`,
          });
        } catch (aiErr) {
          await logToolCall(partnerKeyId, { toolName: "pm_optimize_schema", inputUrl: url, responseStatus: "ai_degraded", latencyMs: Date.now() - start, cached: false });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({
              error: "AI analysis service temporarily unavailable",
              url,
              degraded: true,
              message: `Schema optimization could not be generated: ${aiErr instanceof Error ? aiErr.message : "service error"}. Please retry later.`,
            }, null, 2) }],
            isError: true,
          };
        }

        const result = {
          url,
          businessType: businessType || "general",
          schemaRecommendations: aiResult,
          cachedAt: new Date().toISOString(),
        };

        await db.insert(aeoRecommendationCacheTable).values({
          url,
          cacheType: "schema",
          resultJson: result,
        });

        await logToolCall(partnerKeyId, { toolName: "pm_optimize_schema", inputUrl: url, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_optimize_schema", inputUrl: url, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

export function registerPirateMonsterWebhookTools(server: McpServer, ctx: McpSessionContext): void {
  console.log("[MCP] Registering PirateMonster webhook tools...");
  const { partnerKeyId, allowedTools } = ctx;

  if (!isToolAllowed("pm_register_webhook", allowedTools)) return;
  server.tool(
    "pm_register_webhook",
    "Register a webhook endpoint to receive AEO scan results and citation change notifications. Supports HMAC signature verification. Maximum 10 active webhooks per partner key.",
    {
      targetUrl: z.string().url().describe("HTTPS URL to receive webhook events"),
      eventTypes: z.array(z.enum(["scan_complete", "score_change", "citation_gained", "citation_lost"])).min(1).describe("Event types to subscribe to"),
      secret: z.string().optional().describe("Optional secret for HMAC-SHA256 signature verification"),
    },
    async ({ targetUrl, eventTypes, secret }) => {
      const start = Date.now();
      try {
        if (!partnerKeyId) {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "unauthorized", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Partner key required" }) }], isError: true };
        }

        const blockReason = await validateUrl(targetUrl);
        if (blockReason) {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "blocked", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: blockReason }) }], isError: true };
        }

        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "blocked", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid URL" }) }], isError: true };
        }
        if (parsed.protocol !== "https:") {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "blocked", latencyMs: Date.now() - start, cached: false });
          return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Webhook URL must use HTTPS" }) }], isError: true };
        }

        const existingWebhooks = await db
          .select({ id: aeoWebhooksTable.id })
          .from(aeoWebhooksTable)
          .where(
            and(
              eq(aeoWebhooksTable.partnerKeyId, partnerKeyId),
              eq(aeoWebhooksTable.status, "active")
            )
          );

        if (existingWebhooks.length >= 10) {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "limit_exceeded", latencyMs: Date.now() - start, cached: false });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Maximum 10 active webhooks per partner key" }) }],
            isError: true,
          };
        }

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          const headRes = await fetch(targetUrl, { method: "HEAD", signal: controller.signal });
          clearTimeout(timer);
          if (headRes.status < 200 || headRes.status >= 400) {
            await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "validation_failed", latencyMs: Date.now() - start, cached: false });
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: `Webhook URL validation failed: HEAD request returned status ${headRes.status}. Expected 2xx or 3xx.` }) }],
              isError: true,
            };
          }
        } catch (headErr) {
          await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "validation_failed", latencyMs: Date.now() - start, cached: false });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: `Webhook URL validation failed: could not reach endpoint (${headErr instanceof Error ? headErr.message : "network error"})` }) }],
            isError: true,
          };
        }

        let secretHash: string | null = null;
        if (secret) {
          const encryptionKey = process.env.WEBHOOK_SECRET_KEY;
          if (!encryptionKey) {
            await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "config_error", latencyMs: Date.now() - start, cached: false });
            return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Server configuration error: WEBHOOK_SECRET_KEY is not configured. Cannot store webhook secrets." }) }], isError: true };
          }
          const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv, { authTagLength: 16 });
          let encrypted = cipher.update(secret, "utf8", "hex");
          encrypted += cipher.final("hex");
          const authTag = cipher.getAuthTag().toString("hex");
          secretHash = `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
        }

        const [webhook] = await db.insert(aeoWebhooksTable).values({
          partnerKeyId,
          targetUrl,
          eventTypes,
          secretHash,
          status: "active",
        }).returning();

        await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "ok", latencyMs: Date.now() - start, cached: false });
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            webhookId: webhook.id,
            targetUrl: webhook.targetUrl,
            eventTypes: webhook.eventTypes,
            status: webhook.status,
            createdAt: webhook.createdAt.toISOString(),
          }, null, 2) }],
        };
      } catch (err) {
        await logToolCall(partnerKeyId, { toolName: "pm_register_webhook", inputUrl: targetUrl, responseStatus: "error", latencyMs: Date.now() - start, cached: false });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    }
  );
}

export function registerPirateMonsterAllTools(server: McpServer, ctx: McpSessionContext): void {
  registerPirateMonsterReadTools(server, ctx);
  registerPirateMonsterScanTools(server, ctx);
  registerPirateMonsterCachedTools(server, ctx);
  registerPirateMonsterWebhookTools(server, ctx);
}
