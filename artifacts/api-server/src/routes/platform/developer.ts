import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  developerApiKeysTable,
  developerApiUsageLogTable,
  apiChangelogTable,
  mcpToolCallsTable,
  mcpOAuthClientsTable,
  platformApiKeysTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dns from "dns/promises";

const router: IRouter = Router();

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

const VALID_SCOPES = ["read", "write", "admin"] as const;
const VALID_TIERS = ["standard", "partner"] as const;

router.get("/developer/keys", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const keys = await db
      .select({
        id: developerApiKeysTable.id,
        label: developerApiKeysTable.label,
        keyPrefix: developerApiKeysTable.keyPrefix,
        scopes: developerApiKeysTable.scopes,
        tier: developerApiKeysTable.tier,
        rateLimit: developerApiKeysTable.rateLimit,
        status: developerApiKeysTable.status,
        totalCalls: developerApiKeysTable.totalCalls,
        lastUsedAt: developerApiKeysTable.lastUsedAt,
        createdAt: developerApiKeysTable.createdAt,
        revokedAt: developerApiKeysTable.revokedAt,
      })
      .from(developerApiKeysTable)
      .where(eq(developerApiKeysTable.clientId, clientId))
      .orderBy(desc(developerApiKeysTable.createdAt));

    res.json(keys);
  } catch (err) {
    console.error("Developer key list error:", err);
    res.status(500).json({ error: "Failed to list developer API keys" });
  }
});

const createKeySchema = z.object({
  label: z.string().min(1).max(100).optional().default("default"),
  scopes: z.array(z.enum(VALID_SCOPES)).optional().default(["read"]),
  tier: z.enum(VALID_TIERS).optional().default("standard"),
});

router.post("/developer/keys", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.tier === "partner" && req.user!.role !== "admin") {
    res.status(403).json({ error: "Partner-tier keys require admin privileges" });
    return;
  }

  try {
    const rawKey = `gbdev_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);
    const rateLimit = parsed.data.tier === "partner" ? 5000 : 1000;

    const [key] = await db
      .insert(developerApiKeysTable)
      .values({
        clientId,
        keyHash,
        keyPrefix,
        label: parsed.data.label,
        scopes: parsed.data.scopes,
        tier: parsed.data.tier,
        rateLimit,
      })
      .returning();

    res.status(201).json({
      id: key.id,
      apiKey: rawKey,
      label: key.label,
      keyPrefix,
      scopes: key.scopes,
      tier: key.tier,
      rateLimit: key.rateLimit,
      createdAt: key.createdAt,
    });
  } catch (err) {
    console.error("Developer key creation error:", err);
    res.status(500).json({ error: "Failed to create developer API key" });
  }
});

router.delete("/developer/keys/:id", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) { res.status(400).json({ error: "Invalid key ID" }); return; }

    const [updated] = await db
      .update(developerApiKeysTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(developerApiKeysTable.id, keyId),
        eq(developerApiKeysTable.clientId, clientId),
      ))
      .returning();

    if (!updated) { res.status(404).json({ error: "API key not found" }); return; }
    res.json({ success: true, id: updated.id });
  } catch (err) {
    console.error("Developer key revoke error:", err);
    res.status(500).json({ error: "Failed to revoke developer API key" });
  }
});

router.get("/developer/keys/:id/usage", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) { res.status(400).json({ error: "Invalid key ID" }); return; }

    const [key] = await db
      .select()
      .from(developerApiKeysTable)
      .where(and(
        eq(developerApiKeysTable.id, keyId),
        eq(developerApiKeysTable.clientId, clientId),
      ));

    if (!key) { res.status(404).json({ error: "API key not found" }); return; }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageByEndpoint = await db
      .select({
        endpoint: developerApiUsageLogTable.endpoint,
        method: developerApiUsageLogTable.method,
        callCount: sql<number>`COUNT(*)`,
        avgLatency: sql<number>`AVG(${developerApiUsageLogTable.latencyMs})`,
        errorCount: sql<number>`SUM(CASE WHEN ${developerApiUsageLogTable.statusCode} >= 400 THEN 1 ELSE 0 END)`,
        totalTokens: sql<number>`COALESCE(SUM(${developerApiUsageLogTable.tokensConsumed}), 0)`,
      })
      .from(developerApiUsageLogTable)
      .where(and(
        eq(developerApiUsageLogTable.keyId, keyId),
        gte(developerApiUsageLogTable.createdAt, thirtyDaysAgo),
      ))
      .groupBy(developerApiUsageLogTable.endpoint, developerApiUsageLogTable.method);

    const usageOverTime = await db
      .select({
        date: sql<string>`DATE(${developerApiUsageLogTable.createdAt})`,
        callCount: sql<number>`COUNT(*)`,
        errorCount: sql<number>`SUM(CASE WHEN ${developerApiUsageLogTable.statusCode} >= 400 THEN 1 ELSE 0 END)`,
        totalTokens: sql<number>`COALESCE(SUM(${developerApiUsageLogTable.tokensConsumed}), 0)`,
      })
      .from(developerApiUsageLogTable)
      .where(and(
        eq(developerApiUsageLogTable.keyId, keyId),
        gte(developerApiUsageLogTable.createdAt, thirtyDaysAgo),
      ))
      .groupBy(sql`DATE(${developerApiUsageLogTable.createdAt})`)
      .orderBy(sql`DATE(${developerApiUsageLogTable.createdAt})`);

    const totalCalls = key.totalCalls;
    const rateLimitRemaining = Math.max(0, key.rateLimit - totalCalls);

    res.json({
      keyId: key.id,
      label: key.label,
      totalCalls,
      rateLimit: key.rateLimit,
      rateLimitRemaining,
      lastUsedAt: key.lastUsedAt,
      usageByEndpoint: usageByEndpoint.map(u => ({
        endpoint: u.endpoint,
        method: u.method,
        callCount: Number(u.callCount),
        avgLatencyMs: Math.round(Number(u.avgLatency || 0)),
        errorCount: Number(u.errorCount || 0),
        totalTokens: Number(u.totalTokens || 0),
      })),
      usageOverTime: usageOverTime.map(u => ({
        date: u.date,
        callCount: Number(u.callCount),
        errorCount: Number(u.errorCount || 0),
        totalTokens: Number(u.totalTokens || 0),
      })),
    });
  } catch (err) {
    console.error("Developer key usage error:", err);
    res.status(500).json({ error: "Failed to fetch usage data" });
  }
});

const webhookTestSchema = z.object({
  url: z.url(),
  eventType: z.enum([
    "task_session.completed",
    "pipeline.triggered",
    "bot.alert",
    "lead.received",
  ]),
});

const SAMPLE_PAYLOADS: Record<string, object> = {
  "task_session.completed": {
    event: "task_session.completed",
    timestamp: new Date().toISOString(),
    data: {
      sessionId: 42,
      objective: "Qualify new sales lead from website contact form",
      status: "completed",
      botsInvolved: [
        { id: 1, name: "Nova", title: "VP of Sales" },
        { id: 2, name: "Atlas", title: "Marketing Director" },
      ],
      duration_seconds: 120,
      messagesGenerated: 8,
    },
  },
  "pipeline.triggered": {
    event: "pipeline.triggered",
    timestamp: new Date().toISOString(),
    data: {
      pipelineId: 7,
      pipelineName: "Lead Qualification Pipeline",
      triggerType: "form",
      triggerSlug: "contact-form-lead",
      runId: 15,
      status: "triggered",
    },
  },
  "bot.alert": {
    event: "bot.alert",
    timestamp: new Date().toISOString(),
    data: {
      botId: 3,
      botName: "Sentinel",
      alertType: "anomaly_detected",
      severity: "warning",
      message: "Unusual spike in failed API calls detected over the last hour",
      metric: { name: "error_rate", value: 12.5, threshold: 5.0 },
    },
  },
  "lead.received": {
    event: "lead.received",
    timestamp: new Date().toISOString(),
    data: {
      leadId: 101,
      name: "Jane Smith",
      contact: "jane@example.com",
      serviceInterest: "AI Customer Support",
      message: "We're interested in deploying AI agents for our support team",
      source: "website_contact_form",
    },
  },
};

const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/,
];

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/,
  /\.local$/,
  /\.internal$/,
  /^metadata\./,
  ...BLOCKED_IP_PATTERNS,
];

function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_HOSTNAME_PATTERNS.some(p => p.test(hostname));
}

function isBlockedIp(ip: string): boolean {
  return BLOCKED_IP_PATTERNS.some(p => p.test(ip));
}

async function isBlockedUrl(urlStr: string): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;
    const hostname = url.hostname.toLowerCase();
    if (isBlockedHostname(hostname)) return true;
    try {
      const resolved = await dns.resolve4(hostname);
      if (resolved.some(ip => isBlockedIp(ip))) return true;
    } catch {}
    try {
      const resolved6 = await dns.resolve6(hostname);
      if (resolved6.some(ip => isBlockedIp(ip))) return true;
    } catch {}
    return false;
  } catch {
    return true;
  }
}

router.post("/developer/webhook-test", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const parsed = webhookTestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (await isBlockedUrl(parsed.data.url)) {
    res.status(400).json({ error: "URL must be a public HTTPS/HTTP endpoint. Private/internal addresses are not allowed." });
    return;
  }

  const payload = SAMPLE_PAYLOADS[parsed.data.eventType];
  if (!payload) { res.status(400).json({ error: "Unknown event type" }); return; }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(parsed.data.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GalaxyBots-Event": parsed.data.eventType,
        "X-GalaxyBots-Delivery": crypto.randomUUID(),
        "X-GalaxyBots-Signature": crypto
          .createHmac("sha256", "test_secret")
          .update(JSON.stringify(payload))
          .digest("hex"),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    res.json({
      success: true,
      statusCode: response.status,
      statusText: response.statusText,
      eventType: parsed.data.eventType,
      payloadSent: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    res.json({
      success: false,
      error: message.includes("abort") ? "Request timed out (10s)" : message,
      eventType: parsed.data.eventType,
      payloadSent: payload,
    });
  }
});

router.get("/developer/webhook-events", async (_req, res): Promise<void> => {
  res.json([
    {
      eventType: "task_session.completed",
      description: "Fired when a bot task session finishes execution",
      payload: SAMPLE_PAYLOADS["task_session.completed"],
    },
    {
      eventType: "pipeline.triggered",
      description: "Fired when an automation pipeline is triggered by an external event",
      payload: SAMPLE_PAYLOADS["pipeline.triggered"],
    },
    {
      eventType: "bot.alert",
      description: "Fired when a bot raises an operational alert or anomaly",
      payload: SAMPLE_PAYLOADS["bot.alert"],
    },
    {
      eventType: "lead.received",
      description: "Fired when a new lead is ingested via webhook",
      payload: SAMPLE_PAYLOADS["lead.received"],
    },
  ]);
});

router.get("/developer/changelog", async (_req, res): Promise<void> => {
  try {
    const entries = await db
      .select()
      .from(apiChangelogTable)
      .orderBy(desc(apiChangelogTable.publishedAt));

    res.json(entries);
  } catch (err) {
    console.error("Changelog fetch error:", err);
    res.status(500).json({ error: "Failed to fetch changelog" });
  }
});

router.get("/developer/mcp/stats", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const toolCallVolume = await db
      .select({
        toolName: mcpToolCallsTable.toolName,
        callCount: sql<number>`COUNT(*)::int`,
        errorCount: sql<number>`SUM(CASE WHEN ${mcpToolCallsTable.responseStatus} = 'error' THEN 1 ELSE 0 END)::int`,
        avgLatencyMs: sql<number>`AVG(${mcpToolCallsTable.latencyMs})::int`,
      })
      .from(mcpToolCallsTable)
      .innerJoin(
        platformApiKeysTable,
        and(
          eq(mcpToolCallsTable.partnerKeyId, platformApiKeysTable.id),
          eq(platformApiKeysTable.clientId, clientId),
        ),
      )
      .where(gte(mcpToolCallsTable.calledAt, sevenDaysAgo))
      .groupBy(mcpToolCallsTable.toolName)
      .orderBy(desc(sql`COUNT(*)`));

    const dailyVolume = await db
      .select({
        date: sql<string>`DATE(${mcpToolCallsTable.calledAt})`,
        callCount: sql<number>`COUNT(*)::int`,
        errorCount: sql<number>`SUM(CASE WHEN ${mcpToolCallsTable.responseStatus} = 'error' THEN 1 ELSE 0 END)::int`,
      })
      .from(mcpToolCallsTable)
      .innerJoin(
        platformApiKeysTable,
        and(
          eq(mcpToolCallsTable.partnerKeyId, platformApiKeysTable.id),
          eq(platformApiKeysTable.clientId, clientId),
        ),
      )
      .where(gte(mcpToolCallsTable.calledAt, sevenDaysAgo))
      .groupBy(sql`DATE(${mcpToolCallsTable.calledAt})`)
      .orderBy(sql`DATE(${mcpToolCallsTable.calledAt})`);

    const oauthClients = await db
      .select({
        id: mcpOAuthClientsTable.id,
        clientId: mcpOAuthClientsTable.clientId,
        clientName: mcpOAuthClientsTable.clientName,
        allowedScopes: mcpOAuthClientsTable.allowedScopes,
        createdAt: mcpOAuthClientsTable.createdAt,
      })
      .from(mcpOAuthClientsTable)
      .where(eq(mcpOAuthClientsTable.clientIdOwner, clientId))
      .orderBy(desc(mcpOAuthClientsTable.createdAt));

    const totalCallsResult = await db
      .select({ totalCalls: sql<number>`COUNT(*)::int` })
      .from(mcpToolCallsTable)
      .innerJoin(
        platformApiKeysTable,
        and(
          eq(mcpToolCallsTable.partnerKeyId, platformApiKeysTable.id),
          eq(platformApiKeysTable.clientId, clientId),
        ),
      )
      .where(gte(mcpToolCallsTable.calledAt, sevenDaysAgo));

    const totalCalls = totalCallsResult[0]?.totalCalls ?? 0;

    res.json({
      toolCallVolume: toolCallVolume.map(t => ({
        toolName: t.toolName,
        callCount: Number(t.callCount),
        errorCount: Number(t.errorCount || 0),
        avgLatencyMs: Math.round(Number(t.avgLatencyMs || 0)),
        errorRate: t.callCount > 0 ? Math.round((Number(t.errorCount || 0) / Number(t.callCount)) * 100) : 0,
      })),
      dailyVolume: dailyVolume.map(d => ({
        date: d.date,
        callCount: Number(d.callCount),
        errorCount: Number(d.errorCount || 0),
      })),
      oauthClients,
      totalCallsLast7Days: Number(totalCalls),
    });
  } catch (err) {
    console.error("MCP stats error:", err);
    res.status(500).json({ error: "Failed to fetch MCP stats" });
  }
});

router.get("/developer/mcp/sessions", async (req, res): Promise<void> => {
  const clientId = req.user?.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const mcpApiKey = process.env.MCP_API_KEY;
  const mcpPort = process.env.MCP_PORT || "23320";

  if (!mcpApiKey) {
    res.json({ sessions: [], count: 0, note: "MCP_API_KEY not configured" });
    return;
  }

  try {
    const clientKeys = await db
      .select({ id: platformApiKeysTable.id })
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.clientId, clientId),
          eq(platformApiKeysTable.status, "active"),
        ),
      );
    const clientKeyIds = new Set(clientKeys.map(k => k.id));

    const response = await fetch(`http://localhost:${mcpPort}/__mcp/sessions`, {
      headers: { Authorization: `Bearer ${mcpApiKey}` },
    });
    if (!response.ok) {
      res.json({ sessions: [], count: 0 });
      return;
    }
    const data = await response.json() as { sessions: { partnerKeyId: number | null; callerType: string; [key: string]: unknown }[]; count: number };

    const filtered = data.sessions.filter(s =>
      s.callerType === "galaxybots" ? false :
      s.partnerKeyId != null && clientKeyIds.has(s.partnerKeyId)
    );

    res.json({ sessions: filtered, count: filtered.length });
  } catch {
    res.json({ sessions: [], count: 0 });
  }
});

router.get("/developer/openapi", async (_req, res): Promise<void> => {
  try {
    const possiblePaths = [
      path.resolve(process.cwd(), "lib/api-spec/openapi.yaml"),
      path.resolve(process.cwd(), "../../lib/api-spec/openapi.yaml"),
      path.resolve(process.cwd(), "../lib/api-spec/openapi.yaml"),
      "/home/runner/workspace/lib/api-spec/openapi.yaml",
    ];

    let specPath = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        specPath = p;
        break;
      }
    }

    if (!specPath) {
      res.status(404).json({ error: "OpenAPI spec not found" });
      return;
    }
    const spec = fs.readFileSync(specPath, "utf-8");
    res.setHeader("Content-Type", "text/yaml");
    res.send(spec);
  } catch (err) {
    console.error("OpenAPI spec error:", err);
    res.status(500).json({ error: "Failed to serve OpenAPI spec" });
  }
});

export default router;
