import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getToolManifest } from "../tools/index.js";
import { activeSessions, getTotalToolCallsServed, SERVER_START_TIME } from "../sessions.js";

export function buildHealthRoutes(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}/health`, async (_req, res) => {
    const uptimeMs = Date.now() - SERVER_START_TIME;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

    let dbStatus: "ok" | "degraded" = "ok";
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = "degraded";
    }

    res.json({
      status: dbStatus === "ok" ? "ok" : "degraded",
      service: "galaxybots-mcp",
      version: "2025-03",
      uptime: uptimeFormatted,
      uptime_ms: uptimeMs,
      active_sessions: activeSessions.size,
      tool_calls_served: getTotalToolCallsServed(),
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  router.get(`${basePath}/openapi.json`, (_req, res) => {
    const origin = `${_req.protocol}://${_req.get("host")}`;
    const tools = getToolManifest();
    const toolPaths: Record<string, unknown> = {};
    for (const tool of tools as Array<{ name: string; description?: string; inputSchema?: unknown }>) {
      toolPaths[`/tools/${tool.name}`] = {
        post: {
          summary: tool.description ?? tool.name,
          operationId: tool.name,
          tags: ["tools"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              "application/json": { schema: tool.inputSchema ?? { type: "object" } },
            },
          },
          responses: {
            "200": { description: "Tool result", content: { "application/json": { schema: { type: "object" } } } },
            "401": { description: "Unauthorized" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      };
    }

    res.json({
      openapi: "3.1.0",
      info: {
        title: "GalaxyBots MCP Server",
        version: "2025-03",
        description: "Model Context Protocol server providing 51 AI executive directors for GalaxyBots.ai. Supports SSE streaming, OAuth 2.0 PKCE, and bearer token authentication.",
        contact: { name: "GalaxyBots Support", url: "https://galaxybots.ai", email: "support@galaxybots.ai" },
        license: { name: "Proprietary", url: "https://galaxybots.ai/terms" },
      },
      servers: [{ url: `${origin}${basePath}`, description: "GalaxyBots MCP Server" }],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key or JWT" },
          oauth2: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: `${origin}${basePath}/oauth/authorize`,
                tokenUrl: `${origin}${basePath}/oauth/token`,
                scopes: {
                  "bots:read": "Read bots and directors",
                  "bots:write": "Interact with bots, create sessions, search memory",
                  "clients:read": "Read client profiles (admin)",
                  "aeo:read": "Read AEO/Cloud 9 scores",
                  "aeo:write": "Request new AEO scans",
                },
              },
            },
          },
        },
        schemas: {
          HealthResponse: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["ok", "degraded"] },
              service: { type: "string" },
              version: { type: "string" },
              uptime: { type: "string" },
              active_sessions: { type: "integer" },
              tool_calls_served: { type: "integer" },
              database: { type: "string", enum: ["ok", "degraded"] },
              timestamp: { type: "string", format: "date-time" },
            },
          },
          Session: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              clientName: { type: "string" },
              connectedAt: { type: "string", format: "date-time" },
              toolCallCount: { type: "integer" },
              callerType: { type: "string", enum: ["galaxybots", "piratemonster", "oauth"] },
              partnerKeyId: { type: ["integer", "null"] },
            },
          },
        },
      },
      paths: {
        "/health": {
          get: {
            summary: "Server health check",
            operationId: "getHealth",
            tags: ["system"],
            security: [],
            responses: {
              "200": { description: "Health status", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } } },
            },
          },
        },
        "/tools": {
          get: {
            summary: "List available MCP tools",
            operationId: "listTools",
            tags: ["tools"],
            security: [],
            parameters: [
              { name: "q", in: "query", schema: { type: "string" }, description: "Search query (name or description)" },
              { name: "department", in: "query", schema: { type: "string", enum: ["bots", "aeo", "finance", "knowledge", "gtm", "admin", "search"] }, description: "Filter by department" },
              { name: "page", in: "query", schema: { type: "integer", default: 1 } },
              { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 100 } },
            ],
            responses: {
              "200": { description: "Tool list", content: { "application/json": { schema: { type: "object" } } } },
            },
          },
        },
        "/capabilities": {
          get: {
            summary: "Get caller capabilities scoped to auth token",
            operationId: "getCapabilities",
            tags: ["auth"],
            responses: {
              "200": { description: "Caller capabilities" },
              "401": { description: "Unauthorized" },
            },
          },
        },
        "/sessions": {
          get: {
            summary: "List active SSE sessions (admin only)",
            operationId: "listSessions",
            tags: ["admin"],
            responses: {
              "200": { description: "Active sessions", content: { "application/json": { schema: { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/Session" } }, count: { type: "integer" } } } } } },
              "401": { description: "Unauthorized" },
            },
          },
        },
        "/sessions/{sessionId}": {
          delete: {
            summary: "Terminate an active SSE session (admin only)",
            operationId: "deleteSession",
            tags: ["admin"],
            parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Session terminated" },
              "401": { description: "Unauthorized" },
              "404": { description: "Session not found" },
            },
          },
        },
        "/sse": {
          get: {
            summary: "Open MCP SSE stream",
            operationId: "openSSE",
            tags: ["mcp"],
            description: "Opens a persistent Server-Sent Events connection for an MCP session. Auth via Bearer token (optional for trial).",
            responses: {
              "200": { description: "SSE stream opened", content: { "text/event-stream": { schema: { type: "string" } } } },
            },
          },
        },
        "/messages": {
          post: {
            summary: "Send MCP tool call to active session",
            operationId: "postMessage",
            tags: ["mcp"],
            parameters: [{ name: "sessionId", in: "query", required: true, schema: { type: "string" } }],
            responses: {
              "200": { description: "Tool result" },
              "401": { description: "Unauthorized" },
              "402": { description: "Trial exhausted" },
              "404": { description: "Session not found" },
              "429": { description: "Rate limit exceeded" },
            },
          },
        },
        "/oauth/authorize": {
          get: { summary: "Begin OAuth 2.0 PKCE authorization", operationId: "oauthAuthorize", tags: ["oauth"], security: [], responses: { "200": { description: "Authorization UI" } } },
        },
        "/oauth/token": {
          post: { summary: "Exchange code for tokens", operationId: "oauthToken", tags: ["oauth"], security: [], responses: { "200": { description: "Token response" } } },
        },
        "/oauth/revoke": {
          post: { summary: "Revoke an access or refresh token (RFC 7009)", operationId: "oauthRevoke", tags: ["oauth"], security: [], responses: { "200": { description: "Token revoked" } } },
        },
        "/oauth/jwks": {
          get: { summary: "JSON Web Key Set for token verification", operationId: "oauthJwks", tags: ["oauth"], security: [], responses: { "200": { description: "JWKS" } } },
        },
        ...toolPaths,
      },
      tags: [
        { name: "mcp", description: "Core MCP protocol endpoints" },
        { name: "tools", description: "MCP tool manifest and discovery" },
        { name: "auth", description: "Authentication and capability inspection" },
        { name: "oauth", description: "OAuth 2.0 PKCE flow" },
        { name: "admin", description: "Admin-only session management" },
        { name: "system", description: "Health and observability" },
      ],
    });
  });

  router.get(`/.well-known/mcp.json`, (_req, res) => {
    const origin = process.env.APP_ORIGIN || "https://galaxybots.ai";
    res.json({
      name: "GalaxyBots.ai",
      description: "Multi-bot AI executive team with AEO intelligence",
      mcp_version: "2025-03",
      endpoints: {
        sse: `${origin}${basePath}/sse`,
        messages: `${origin}${basePath}/messages`,
        health: `${origin}${basePath}/health`,
        oauth_authorize: `${origin}${basePath}/oauth/authorize`,
        oauth_token: `${origin}${basePath}/oauth/token`,
      },
      tools_preview: ["list_bots", "send_message_to_bot", "pm_get_score", "pm_request_scan", "request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report", "get_cloud9_score_explanation", "get_risk_details", "get_directors_by_department"],
      resources: ["gifted://social-proof"],
      auth_methods: ["bearer", "oauth2_pkce"],
      scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
      trial: {
        enabled: true,
        free_calls: 3,
        signup_url: "https://galaxybots.ai/api-access",
      },
    });
  });

  return router;
}
