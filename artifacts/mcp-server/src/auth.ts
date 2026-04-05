import crypto from "node:crypto";
import type express from "express";
import { db, platformApiKeysTable, mcpToolCallsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { verifyOAuthToken } from "./oauth.js";

export const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.warn("[MCP] MCP_API_KEY not set; GalaxyBots env-key auth disabled. Only DB-backed partner keys will work.");
}

export interface AuthResult {
  callerType: "galaxybots" | "piratemonster" | "oauth";
  partnerKeyId: number | null;
  rateLimit: number;
  tokenHash: string;
  allowedTools: string[] | null;
  oauthScopes?: string[];
  oauthClientId?: string;
  oauthClientName?: string;
}

export interface AuthenticatedRequest extends express.Request {
  authResult?: AuthResult;
}

export type AuthenticateResult =
  | { ok: true; auth: AuthResult }
  | { ok: false; status: number; error: string };

const KNOWLEDGE_TOOLS = [
  "calculate_roi",
  "get_pricing_recommendation",
  "get_cloud9_score_explanation",
  "get_risk_details",
  "get_directors_by_department",
];

const SCOPE_TOOL_MAP: Record<string, string[]> = {
  "bots:read": ["list_bots", "get_bot", ...KNOWLEDGE_TOOLS],
  "bots:write": ["list_bots", "get_bot", "send_message_to_bot", "create_task_session", "list_task_sessions", "analyze_task", "memory_search", ...KNOWLEDGE_TOOLS],
  "clients:read": ["list_clients", "get_client", ...KNOWLEDGE_TOOLS],
  "aeo:read": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status", ...KNOWLEDGE_TOOLS],
  "aeo:write": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status", "pm_request_scan", ...KNOWLEDGE_TOOLS],
};

export function scopesToAllowedTools(scopes: string[]): string[] {
  const tools = new Set<string>();
  for (const scope of scopes) {
    const mapped = SCOPE_TOOL_MAP[scope];
    if (mapped) {
      for (const t of mapped) tools.add(t);
    }
  }
  return tools.size > 0 ? Array.from(tools) : [];
}

export async function authenticateToken(token: string): Promise<AuthenticateResult> {
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

export function attachRateLimitHeaders(res: express.Response, auth: AuthResult): void {
  if (auth.rateLimit === Infinity) {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
  } else {
    res.setHeader("X-RateLimit-Limit", String(auth.rateLimit));
    res.setHeader("X-RateLimit-Policy", "1h");
  }
  res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + 3_600_000) / 1000)));
}

export function authenticate(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction): void {
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
    attachRateLimitHeaders(res, result.auth);
    next();
  }).catch((err) => {
    console.error("[MCP] Auth error:", err);
    res.status(500).json({ error: "Authentication error" });
  });
}

export function authenticateOptional(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction): void {
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
