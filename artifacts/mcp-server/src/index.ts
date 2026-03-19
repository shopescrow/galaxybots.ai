import type http from "node:http";
import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerAllTools, getToolManifest } from "./tools/index.js";
import { db, platformApiKeysTable, mcpToolCallsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { buildOAuthRouter, verifyOAuthToken } from "./oauth.js";

let httpServer: http.Server | null = null;

process.on("uncaughtException", (err) => {
  console.error("[MCP] Uncaught exception — initiating graceful shutdown:", err);
  if (httpServer) {
    httpServer.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[MCP] Unhandled rejection (keeping server alive):", reason);
});

const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.warn("[MCP] MCP_API_KEY not set; GalaxyBots env-key auth disabled. Only DB-backed partner keys will work.");
}

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const BASE_PATH = (process.env.BASE_PATH || "/__mcp").replace(/\/+$/, "");

const app = express();

const CORS_OPEN_PATHS = [
  `${BASE_PATH}/sse`,
  `${BASE_PATH}/messages`,
  "/.well-known/mcp.json",
  `${BASE_PATH}/tools`,
];

app.use((_req, res, next) => {
  const isCorsOpen = CORS_OPEN_PATHS.some(p => _req.path === p || _req.path.startsWith(p));
  if (isCorsOpen) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

const transports = new Map<string, SSEServerTransport>();

export interface ActiveSession {
  sessionId: string;
  clientName: string;
  connectedAt: Date;
  toolCallCount: number;
  callerType: "galaxybots" | "piratemonster" | "oauth";
  oauthClientId?: string;
  partnerKeyId: number | null;
}

const activeSessions = new Map<string, ActiveSession>();

interface AuthResult {
  callerType: "galaxybots" | "piratemonster" | "oauth";
  partnerKeyId: number | null;
  rateLimit: number;
  tokenHash: string;
  allowedTools: string[] | null;
  oauthScopes?: string[];
  oauthClientId?: string;
  oauthClientName?: string;
}

interface AuthenticatedRequest extends express.Request {
  authResult?: AuthResult;
}

type AuthenticateResult =
  | { ok: true; auth: AuthResult }
  | { ok: false; status: number; error: string };

const SCOPE_TOOL_MAP: Record<string, string[]> = {
  "bots:read": ["list_bots", "get_bot"],
  "bots:write": ["list_bots", "get_bot", "send_message_to_bot", "create_task_session", "list_task_sessions", "analyze_task", "memory_search"],
  "clients:read": ["list_clients", "get_client"],
  "aeo:read": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status"],
  "aeo:write": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status", "pm_request_scan"],
};

function scopesToAllowedTools(scopes: string[]): string[] {
  const tools = new Set<string>();
  for (const scope of scopes) {
    const mapped = SCOPE_TOOL_MAP[scope];
    if (mapped) {
      for (const t of mapped) tools.add(t);
    }
  }
  return tools.size > 0 ? Array.from(tools) : [];
}

async function authenticateToken(token: string): Promise<AuthenticateResult> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  if (MCP_API_KEY && token === MCP_API_KEY) {
    return { ok: true, auth: { callerType: "galaxybots", partnerKeyId: null, rateLimit: Infinity, tokenHash, allowedTools: null } };
  }

  const oauthResult = await verifyOAuthToken(token);
  if (oauthResult) {
    return {
      ok: true,
      auth: {
        callerType: "oauth",
        partnerKeyId: oauthResult.platformApiKeyId,
        rateLimit: oauthResult.rateLimitTier === "partner" ? 2000 : 1000,
        tokenHash,
        allowedTools: scopesToAllowedTools(oauthResult.scopes),
        oauthScopes: oauthResult.scopes,
        oauthClientId: oauthResult.oauthClientId,
      },
    };
  }

  try {
    const [key] = await db
      .select()
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.keyHash, tokenHash),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.platform, "piratemonster_mcp")
        )
      )
      .limit(1);

    if (!key) {
      return { ok: false, status: 401, error: "Invalid API key" };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count: callCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpToolCallsTable)
      .where(
        and(
          eq(mcpToolCallsTable.partnerKeyId, key.id),
          gt(mcpToolCallsTable.calledAt, oneHourAgo)
        )
      );

    if (callCount >= key.rateLimit) {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }

    return {
      ok: true,
      auth: {
        callerType: "piratemonster",
        partnerKeyId: key.id,
        rateLimit: key.rateLimit,
        tokenHash,
        allowedTools: (key.allowedTools as string[] | null) ?? null,
      },
    };
  } catch (err) {
    console.error("[MCP] Auth DB lookup error:", err);
    return { ok: false, status: 500, error: "Authentication error" };
  }
}

const sessionAuthMap = new Map<string, AuthResult>();

const TRIAL_MAX_CALLS = 3;
const trialCallsMap = new Map<string, number>();

function authenticate(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <API_KEY>" });
    return;
  }
  const token = authHeader.slice(7);

  authenticateToken(token).then((result) => {
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    req.authResult = result.auth;
    next();
  }).catch((err) => {
    console.error("[MCP] Auth error:", err);
    res.status(500).json({ error: "Authentication error" });
  });
}

function authenticateOptional(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  authenticateToken(token).then((result) => {
    if (result.ok) {
      req.authResult = result.auth;
    }
    next();
  }).catch(() => {
    next();
  });
}

app.get(`${BASE_PATH}/sse`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
  console.log("[MCP] New SSE connection request");

  const isTrial = !req.authResult;
  const authResult: AuthResult = req.authResult ?? {
    callerType: "piratemonster",
    partnerKeyId: null,
    rateLimit: TRIAL_MAX_CALLS,
    tokenHash: "",
    allowedTools: ["request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report"],
  };

  const sessionCtx = {
    partnerKeyId: authResult.partnerKeyId,
    rateLimit: authResult.rateLimit,
    allowedTools: authResult.allowedTools,
  };

  const server = new McpServer({
    name: "galaxybots-mcp",
    version: "1.0.0",
  });

  try {
    registerAllTools(server, authResult.callerType, sessionCtx);
  } catch (err) {
    console.error("[MCP] Error registering tools:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to initialize MCP session" });
    }
    return;
  }

  const transport = new SSEServerTransport(`${BASE_PATH}/messages`, res);
  transports.set(transport.sessionId, transport);
  sessionAuthMap.set(transport.sessionId, authResult);

  if (isTrial) {
    trialCallsMap.set(transport.sessionId, 0);
    console.log(`[MCP] Trial session started: ${transport.sessionId} (max ${TRIAL_MAX_CALLS} calls)`);
  }

  const clientName = isTrial
    ? "Trial (unauthenticated)"
    : authResult.oauthClientId
    ? `OAuth:${authResult.oauthClientId}`
    : authResult.callerType === "galaxybots"
    ? "GalaxyBots Internal"
    : `PM Key ${authResult.partnerKeyId}`;

  const sessionInfo: ActiveSession = {
    sessionId: transport.sessionId,
    clientName,
    connectedAt: new Date(),
    toolCallCount: 0,
    callerType: authResult.callerType,
    oauthClientId: authResult.oauthClientId,
    partnerKeyId: authResult.partnerKeyId,
  };
  activeSessions.set(transport.sessionId, sessionInfo);

  res.on("close", () => {
    console.log(`[MCP] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
    sessionAuthMap.delete(transport.sessionId);
    activeSessions.delete(transport.sessionId);
    trialCallsMap.delete(transport.sessionId);
  });

  console.log(`[MCP] SSE connection established: ${transport.sessionId} (caller: ${isTrial ? "trial" : authResult.callerType})`);
  try {
    await server.connect(transport);
  } catch (err) {
    console.error(`[MCP] Error connecting transport for session ${transport.sessionId}:`, err);
    transports.delete(transport.sessionId);
    sessionAuthMap.delete(transport.sessionId);
    activeSessions.delete(transport.sessionId);
    trialCallsMap.delete(transport.sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post(`${BASE_PATH}/messages`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const sessionAuth = sessionAuthMap.get(sessionId);
  const isTrial = trialCallsMap.has(sessionId);

  if (isTrial) {
    const trialCalls = trialCallsMap.get(sessionId) ?? 0;
    if (trialCalls >= TRIAL_MAX_CALLS) {
      res.status(402).json({
        error: "trial_exhausted",
        message: `You have used all ${TRIAL_MAX_CALLS} free trial calls. Sign up for API access to continue.`,
        signup_url: "https://galaxybots.ai/api-access",
        booking_link: "https://calendly.com/galaxybots/demo",
        hint: "Use the `request_demo` tool to book a live demo and get full access.",
      });
      return;
    }
    trialCallsMap.set(sessionId, trialCalls + 1);
  } else {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <API_KEY>" });
      return;
    }
    if (req.authResult && sessionAuth && sessionAuth.tokenHash && sessionAuth.tokenHash !== req.authResult.tokenHash) {
      res.status(403).json({ error: "Token mismatch: this session belongs to a different key" });
      return;
    }
    if (!req.authResult) {
      res.status(401).json({ error: "Invalid or expired API key" });
      return;
    }
  }

  const session = activeSessions.get(sessionId);
  if (session) {
    session.toolCallCount++;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error(`[MCP] Error handling message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ status: "ok", service: "galaxybots-mcp" });
});

app.get(`${BASE_PATH}/tools`, (_req, res) => {
  res.json({
    tools: getToolManifest(),
    mcp_version: "2025-03",
    auth_methods: ["bearer", "oauth2_pkce"],
    scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
  });
});

app.get(`/.well-known/mcp.json`, (_req, res) => {
  const origin = process.env.APP_ORIGIN || "https://galaxybots.ai";
  res.json({
    name: "GalaxyBots.ai",
    description: "Multi-bot AI executive team with AEO intelligence",
    mcp_version: "2025-03",
    endpoints: {
      sse: `${origin}${BASE_PATH}/sse`,
      messages: `${origin}${BASE_PATH}/messages`,
      health: `${origin}${BASE_PATH}/health`,
      oauth_authorize: `${origin}${BASE_PATH}/oauth/authorize`,
      oauth_token: `${origin}${BASE_PATH}/oauth/token`,
    },
    tools_preview: ["list_bots", "send_message_to_bot", "pm_get_score", "pm_request_scan", "request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report"],
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

app.get(`${BASE_PATH}/reports/:slug`, async (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[0-9a-f-]{36}$/.test(slug)) {
    res.status(400).json({ error: "Invalid report slug" });
    return;
  }

  const reportBucketPath = process.env.REPORT_OBJECT_PATH || process.env.PRIVATE_OBJECT_DIR || "";
  if (!reportBucketPath) {
    res.status(503).json({ error: "Report storage not configured" });
    return;
  }

  try {
    const REPLIT_SIDECAR = "http://127.0.0.1:1106";
    const parts = reportBucketPath.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const prefix = parts.slice(1).join("/");
    const objectName = prefix ? `${prefix}/reports/${slug}.md` : `reports/${slug}.md`;

    const signReq = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "GET",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!signReq.ok) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const { signed_url: signedUrl } = await signReq.json() as { signed_url: string };
    const objRes = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!objRes.ok) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const content = await objRes.text();
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(content);
  } catch (err) {
    console.error(`[MCP] Error serving report ${slug}:`, err);
    res.status(503).json({ error: "Report temporarily unavailable" });
  }
});

app.get(`${BASE_PATH}/sessions`, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !MCP_API_KEY || token !== MCP_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const sessions = Array.from(activeSessions.values()).map(s => ({
    sessionId: s.sessionId,
    clientName: s.clientName,
    connectedAt: s.connectedAt.toISOString(),
    toolCallCount: s.toolCallCount,
    callerType: s.callerType,
    oauthClientId: s.oauthClientId ?? null,
    partnerKeyId: s.partnerKeyId,
  }));
  res.json({ sessions, count: sessions.length });
});

const oauthRouter = buildOAuthRouter(BASE_PATH);
app.use(BASE_PATH, oauthRouter);

async function verifyDbConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[MCP] Database connection verified");
    return true;
  } catch (err) {
    console.error("[MCP] Database connection failed:", err);
    return false;
  }
}

async function startServer() {
  const dbOk = await verifyDbConnection();
  if (!dbOk) {
    console.error("[MCP] Cannot start: database connection failed");
    process.exit(1);
  }

  httpServer = app.listen(port, () => {
    console.log(`[MCP] GalaxyBots MCP Server listening on port ${port}`);
    console.log(`[MCP] SSE endpoint: ${BASE_PATH}/sse`);
    console.log(`[MCP] Messages endpoint: ${BASE_PATH}/messages`);
    console.log(`[MCP] OAuth authorize: ${BASE_PATH}/oauth/authorize`);
    console.log(`[MCP] OAuth token: ${BASE_PATH}/oauth/token`);
    console.log(`[MCP] Tool manifest: ${BASE_PATH}/tools`);
    console.log(`[MCP] Well-known: /.well-known/mcp.json`);
  });

  httpServer.on("error", (err) => {
    console.error("[MCP] Server error:", err);
  });
}

startServer().catch((err) => {
  console.error("[MCP] Fatal startup error:", err);
  process.exit(1);
});
