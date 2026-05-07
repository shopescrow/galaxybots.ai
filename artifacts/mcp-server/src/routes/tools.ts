import { Router } from "express";
import { getToolManifest } from "../tools/index.js";
import { authenticate, type AuthenticatedRequest } from "../auth.js";

export function buildToolRoutes(basePath: string): Router {
  const router = Router();

  router.get(`${basePath}/tools`, (_req, res) => {
    const q = ((_req.query.q as string) || "").toLowerCase().trim();
    const dept = ((_req.query.department as string) || "").toLowerCase().trim();
    const page = Math.max(1, parseInt((_req.query.page as string) || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt((_req.query.limit as string) || "100", 10)));

    let tools = getToolManifest();
    if (q) {
      tools = tools.filter((t: { name: string; description?: string }) =>
        t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
      );
    }
    if (dept) {
      const deptKeywords: Record<string, string[]> = {
        bots: ["bot", "director", "message", "memory", "task", "session"],
        aeo: ["pm_", "cloud9", "aeo", "score", "scan", "piratemonster"],
        finance: ["roi", "pricing", "metrics", "revenue"],
        knowledge: ["risk", "cloud9", "pricing", "roi", "department"],
        gtm: ["demo", "roi_report", "lead"],
        admin: ["client", "log_decision", "audit"],
        search: ["web_search", "http_fetch"],
      };
      const keywords = deptKeywords[dept] ?? [dept];
      tools = tools.filter((t: { name: string }) =>
        keywords.some(k => t.name.toLowerCase().includes(k))
      );
    }

    const total = tools.length;
    const offset = (page - 1) * limit;
    const paginated = tools.slice(offset, offset + limit);

    res.json({
      tools: paginated,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      filters: { q: q || null, department: dept || null },
      mcp_version: "2025-03",
      auth_methods: ["bearer", "oauth2_pkce"],
      scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
      departments: ["bots", "aeo", "finance", "knowledge", "gtm", "admin", "search"],
    });
  });

  router.get(`${basePath}/capabilities`, authenticate, (req: AuthenticatedRequest, res) => {
    const auth = req.authResult!;
    const allTools = getToolManifest().map((t: { name: string }) => t.name) as string[];
    const allowed = auth.allowedTools === null ? allTools : allTools.filter(t => auth.allowedTools!.includes(t));

    const scopeMap: Record<string, string> = {
      galaxybots: "Full access (internal key)",
      piratemonster: "Partner key — tool whitelist applies",
      oauth: `OAuth 2.0 — scopes: ${auth.oauthScopes?.join(", ") ?? "none"}`,
    };

    res.json({
      caller_type: auth.callerType,
      access_level: scopeMap[auth.callerType] ?? auth.callerType,
      rate_limit: auth.rateLimit === Infinity ? "unlimited" : auth.rateLimit,
      allowed_tools: allowed,
      allowed_tool_count: allowed.length,
      total_tools: allTools.length,
      scopes: auth.oauthScopes ?? null,
      partner_key_id: auth.partnerKeyId,
      oauth_client_id: auth.oauthClientId ?? null,
    });
  });

  return router;
}
