import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerAllTools } from "./tools/index.js";
import { db, platformApiKeysTable, mcpToolCallsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";

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

const transports = new Map<string, SSEServerTransport>();

interface AuthResult {
  callerType: "galaxybots" | "piratemonster";
  partnerKeyId: number | null;
  rateLimit: number;
  tokenHash: string;
  allowedTools: string[] | null;
}

interface AuthenticatedRequest extends express.Request {
  authResult?: AuthResult;
}

type AuthenticateResult =
  | { ok: true; auth: AuthResult }
  | { ok: false; status: number; error: string };

async function authenticateToken(token: string): Promise<AuthenticateResult> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  if (MCP_API_KEY && token === MCP_API_KEY) {
    return { ok: true, auth: { callerType: "galaxybots", partnerKeyId: null, rateLimit: Infinity, tokenHash, allowedTools: null } };
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

app.get(`${BASE_PATH}/sse`, authenticate, async (req: AuthenticatedRequest, res) => {
  console.log("[MCP] New SSE connection request");

  const authResult = req.authResult!;

  const sessionCtx = {
    partnerKeyId: authResult.partnerKeyId,
    rateLimit: authResult.rateLimit,
    allowedTools: authResult.allowedTools,
  };

  const server = new McpServer({
    name: "galaxybots-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, authResult.callerType, sessionCtx);

  const transport = new SSEServerTransport(`${BASE_PATH}/messages`, res);
  transports.set(transport.sessionId, transport);
  sessionAuthMap.set(transport.sessionId, authResult);

  res.on("close", () => {
    console.log(`[MCP] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
    sessionAuthMap.delete(transport.sessionId);
  });

  console.log(`[MCP] SSE connection established: ${transport.sessionId} (caller: ${authResult.callerType})`);
  await server.connect(transport);
});

app.post(`${BASE_PATH}/messages`, authenticate, async (req: AuthenticatedRequest, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const incomingAuth = req.authResult!;
  const sessionAuth = sessionAuthMap.get(sessionId);
  if (sessionAuth && sessionAuth.tokenHash !== incomingAuth.tokenHash) {
    res.status(403).json({ error: "Token mismatch: this session belongs to a different key" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ status: "ok", service: "galaxybots-mcp" });
});

app.listen(port, () => {
  console.log(`[MCP] GalaxyBots MCP Server listening on port ${port}`);
  console.log(`[MCP] SSE endpoint: ${BASE_PATH}/sse`);
  console.log(`[MCP] Messages endpoint: ${BASE_PATH}/messages`);
});
