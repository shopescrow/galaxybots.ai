import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  mcpServersTable,
  mcpDirectorySubmissionsTable,
  mcpToolCallsTable,
  mcpLeadsTable,
  platformApiKeysTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import nodemailer from "nodemailer";
import { MCP_LAUNCH_OUTREACH_HTML } from "../../email-templates/mcp-launch-outreach";

const router: IRouter = Router();

const DIRECTORIES = [
  { slug: "mcp-so", name: "mcp.so", url: "https://mcp.so", submitUrl: "https://mcp.so/submit", description: "18,000+ servers — community-driven", category: "Community" },
  { slug: "smithery", name: "Smithery (smithery.ai)", url: "https://smithery.ai", submitUrl: "https://smithery.ai/submit", description: "Developer-first MCP registry with search", category: "Marketplace" },
  { slug: "mcpmarket", name: "mcpmarket.com", url: "https://mcpmarket.com", submitUrl: "https://mcpmarket.com/submit", description: "25k+ servers with categories", category: "Marketplace" },
  { slug: "aiagentslist", name: "aiagentslist.com", url: "https://aiagentslist.com/mcp-servers", submitUrl: "https://aiagentslist.com/mcp-servers/submit", description: "593+ curated, category browsing", category: "Curated" },
  { slug: "pulsemcp", name: "PulseMCP (pulsemcp.com)", url: "https://pulsemcp.com", submitUrl: "https://pulsemcp.com/submit", description: "Trending MCP pulse with weekly rankings", category: "Community" },
  { slug: "official-registry", name: "Official MCP Registry", url: "https://registry.modelcontextprotocol.io", submitUrl: "https://registry.modelcontextprotocol.io/submit", description: "Anthropic-managed official registry", category: "Official" },
];

router.get("/mcp-marketing/directories/config", requireRole("owner", "admin"), (_req, res) => {
  res.json(DIRECTORIES);
});

router.get("/mcp-marketing/servers", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const servers = await db
      .select({
        id: mcpServersTable.id,
        clientId: mcpServersTable.clientId,
        clientName: clientsTable.companyName,
        name: mcpServersTable.name,
        description: mcpServersTable.description,
        sseUrl: mcpServersTable.sseUrl,
        authType: mcpServersTable.authType,
        tags: mcpServersTable.tags,
        isOwn: mcpServersTable.isOwn,
        createdAt: mcpServersTable.createdAt,
        updatedAt: mcpServersTable.updatedAt,
      })
      .from(mcpServersTable)
      .leftJoin(clientsTable, eq(mcpServersTable.clientId, clientsTable.id))
      .orderBy(desc(mcpServersTable.createdAt));
    res.json(servers);
  } catch (err) {
    console.error("mcp-marketing servers list error:", err);
    res.status(500).json({ error: "Failed to list MCP servers" });
  }
});

router.post("/mcp-marketing/servers", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().optional(),
    sseUrl: z.string().optional(),
    authType: z.enum(["api_key", "oauth", "none"]).default("api_key"),
    tags: z.array(z.string()).default([]),
    isOwn: z.boolean().default(false),
    clientId: z.number().int().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }
  const { name, description, sseUrl, authType, tags, isOwn, clientId } = parsed.data;
  try {
    const [server] = await db.insert(mcpServersTable).values({
      name, description: description ?? null, sseUrl: sseUrl ?? null,
      authType, tags, isOwn, clientId: clientId ?? null,
    }).returning();
    res.status(201).json(server);
  } catch (err) {
    console.error("mcp-marketing server create error:", err);
    res.status(500).json({ error: "Failed to create MCP server" });
  }
});

router.patch("/mcp-marketing/servers/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid server id" }); return; }
  const schema = z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    sseUrl: z.string().nullable().optional(),
    authType: z.enum(["api_key", "oauth", "none"]).optional(),
    tags: z.array(z.string()).optional(),
    isOwn: z.boolean().optional(),
    clientId: z.number().int().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const [updated] = await db.update(mcpServersTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(mcpServersTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Server not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("mcp-marketing server update error:", err);
    res.status(500).json({ error: "Failed to update MCP server" });
  }
});

router.delete("/mcp-marketing/servers/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid server id" }); return; }
  try {
    await db.delete(mcpServersTable).where(eq(mcpServersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("mcp-marketing server delete error:", err);
    res.status(500).json({ error: "Failed to delete MCP server" });
  }
});

router.get("/mcp-marketing/servers/:id/directories", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid server id" }); return; }
  try {
    const submissions = await db.select().from(mcpDirectorySubmissionsTable)
      .where(eq(mcpDirectorySubmissionsTable.mcpServerId, id));
    const subMap: Record<string, typeof submissions[0]> = {};
    for (const s of submissions) subMap[s.directorySlug] = s;
    const result = DIRECTORIES.map(dir => ({
      ...dir,
      submission: subMap[dir.slug] ?? null,
    }));
    res.json(result);
  } catch (err) {
    console.error("mcp-marketing directories error:", err);
    res.status(500).json({ error: "Failed to get directories" });
  }
});

router.patch("/mcp-marketing/servers/:id/directories/:slug", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const serverId = Number(req.params.id);
  const slug = req.params.slug;
  if (isNaN(serverId)) { res.status(400).json({ error: "Invalid server id" }); return; }
  const schema = z.object({
    status: z.enum(["not_started", "draft", "pending", "submitted", "live"]).optional(),
    listingUrl: z.string().nullable().optional(),
    optimizedDescription: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  try {
    const existing = await db.select().from(mcpDirectorySubmissionsTable)
      .where(and(
        eq(mcpDirectorySubmissionsTable.mcpServerId, serverId),
        eq(mcpDirectorySubmissionsTable.directorySlug, slug),
      )).limit(1);
    const updates = {
      ...parsed.data,
      updatedAt: new Date(),
      submittedAt: parsed.data.status === "submitted" || parsed.data.status === "live"
        ? new Date()
        : existing[0]?.submittedAt ?? null,
    };
    let row;
    if (existing.length > 0) {
      [row] = await db.update(mcpDirectorySubmissionsTable)
        .set(updates)
        .where(and(
          eq(mcpDirectorySubmissionsTable.mcpServerId, serverId),
          eq(mcpDirectorySubmissionsTable.directorySlug, slug),
        ))
        .returning();
    } else {
      [row] = await db.insert(mcpDirectorySubmissionsTable)
        .values({ mcpServerId: serverId, directorySlug: slug, ...updates })
        .returning();
    }
    res.json(row);
  } catch (err) {
    console.error("mcp-marketing directory update error:", err);
    res.status(500).json({ error: "Failed to update directory" });
  }
});

router.post("/mcp-marketing/servers/:id/generate-listing", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid server id" }); return; }
  const { directorySlug } = req.body;
  try {
    const [server] = await db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id)).limit(1);
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }
    const dir = DIRECTORIES.find(d => d.slug === directorySlug) ?? DIRECTORIES[0];
    const tagsArr = Array.isArray(server.tags) ? (server.tags as string[]) : [];
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini", // high-volume listing generation, cost-efficient
      messages: [
        {
          role: "system",
          content: `You are an expert at writing optimized MCP server directory listings for maximum agent-builder discovery in 2026.
Rules:
- Write a 2-3 sentence description. Lead with the primary use case. Mention key autonomous capabilities.
- Include 8-12 comma-separated tags (AEO, SEO, AI Visibility, etc. where relevant plus the server's domain tags).
- Tone: Technical but approachable. Written for LLM developers and agent builders.
- Format your response as JSON: { "description": "...", "tags": ["tag1", "tag2", ...] }`,
        },
        {
          role: "user",
          content: `Generate an optimized listing for this MCP server to submit to ${dir.name}:
Name: ${server.name}
Description: ${server.description ?? "Not provided"}
SSE URL: ${server.sseUrl ?? "Not provided"}
Auth Type: ${server.authType}
Existing Tags: ${tagsArr.join(", ") || "None"}
Directory: ${dir.name} — ${dir.description}`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json({ description: parsed.description ?? "", tags: parsed.tags ?? [] });
  } catch (err) {
    console.error("mcp-marketing generate-listing error:", err);
    res.status(500).json({ error: "Failed to generate listing" });
  }
});

router.post("/mcp-marketing/servers/:id/generate-content", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid server id" }); return; }
  const { channel } = req.body;
  const CHANNELS: Record<string, { name: string; format: string }> = {
    reddit: { name: "Reddit (r/mcp, r/AI_Agents)", format: "Reddit post: Title + body text, conversational, no markdown headers. ~150-200 words." },
    twitter: { name: "X / Twitter (#MCP #AIagents)", format: "3-5 tweets as a thread. Each tweet ≤280 chars. Lead with the hook. Include relevant hashtags on last tweet." },
    hackernews: { name: "Hacker News (Show HN)", format: "Show HN: title + comment. Title max 80 chars starting with 'Show HN:'. Comment is concise technical context, ~100 words." },
    discord: { name: "Discord (Anthropic / Cursor / LangChain)", format: "Discord message for a developer community. Friendly, technical. 2-3 short paragraphs. No formal structure." },
  };
  const ch = CHANNELS[channel] ?? CHANNELS.reddit;
  try {
    const [server] = await db.select().from(mcpServersTable).where(eq(mcpServersTable.id, id)).limit(1);
    if (!server) { res.status(404).json({ error: "Server not found" }); return; }
    const tagsArr = Array.isArray(server.tags) ? (server.tags as string[]) : [];
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini", // high-volume marketing content, cost-efficient
      messages: [
        {
          role: "system",
          content: `You are an expert developer marketer writing launch content for MCP (Model Context Protocol) servers in 2026.
The MCP ecosystem exploded in 2025-2026. Developers building AI agents are always looking for reliable MCP backends.
Your goal: write authentic, compelling content that makes agent builders want to integrate this MCP server immediately.
Focus on: concrete capabilities, easy integration, and the value unlocked for AI agents.`,
        },
        {
          role: "user",
          content: `Write a ${ch.format} for this MCP server to post on ${ch.name}:
Name: ${server.name}
Description: ${server.description ?? "Not provided"}
SSE URL: ${server.sseUrl ?? "Not provided"}
Tags / Capabilities: ${tagsArr.join(", ") || "Not specified"}

Return only the post content, no meta-commentary.`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "";
    res.json({ channel, content });
  } catch (err) {
    console.error("mcp-marketing generate-content error:", err);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

router.get("/mcp-marketing/analytics", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  try {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalCalls, successCalls, topTools, dailyCalls] = await Promise.all([
      db.select({ count: count() }).from(mcpToolCallsTable)
        .where(gte(mcpToolCallsTable.calledAt, since30d)),
      db.select({ count: count() }).from(mcpToolCallsTable)
        .where(and(gte(mcpToolCallsTable.calledAt, since30d), eq(mcpToolCallsTable.responseStatus, "success"))),
      db.select({ toolName: mcpToolCallsTable.toolName, calls: count() })
        .from(mcpToolCallsTable)
        .where(gte(mcpToolCallsTable.calledAt, since30d))
        .groupBy(mcpToolCallsTable.toolName)
        .orderBy(desc(count()))
        .limit(10),
      db.select({
        day: sql<string>`DATE(called_at)`.as("day"),
        calls: count(),
      })
        .from(mcpToolCallsTable)
        .where(gte(mcpToolCallsTable.calledAt, since30d))
        .groupBy(sql`DATE(called_at)`)
        .orderBy(sql`DATE(called_at)`),
    ]);
    res.json({
      totalCalls: totalCalls[0]?.count ?? 0,
      successCalls: successCalls[0]?.count ?? 0,
      topTools,
      dailyCalls,
    });
  } catch (err) {
    console.error("mcp-marketing analytics error:", err);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

router.get("/mcp-marketing/download-extension", (_req, res): void => {
  const mcpbConfig = {
    name: "galaxybots",
    description: "GalaxyBots MCP Server — Enterprise AI Intelligence",
    version: "1.0.0",
    transport: "http-sse",
    serverUrl: "https://galaxybots.ai/__mcp/sse",
    authType: "api_key",
    authHeader: "Authorization",
    authPrefix: "Bearer ",
    tools: [
      "crm_get_clients", "pipeline_snapshot", "prospecting_search",
      "compliance_status", "knowledge_search", "analytics_summary",
      "bot_roster", "create_brief", "task_session_create",
    ],
    resources: [
      "galaxybots://pipeline",
      "galaxybots://accounts",
      "galaxybots://world-state",
    ],
    prompts: [
      "weekly-revenue-review",
      "compliance-audit",
      "prospect-list-build",
      "morning-brief",
    ],
    setupUrl: "https://galaxybots.ai/mcp-docs",
  };
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="galaxybots-mcp.mcpb"');
  res.send(JSON.stringify(mcpbConfig, null, 2));
});

router.get("/mcp-marketing/social-proof", async (_req, res): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeIntegrations, totalToolCalls, sessionsToday, directoriesListed] = await Promise.all([
      db.select({ count: count() }).from(platformApiKeysTable)
        .where(and(
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
        )),
      db.select({ count: count() }).from(mcpToolCallsTable),
      db.select({ count: sql<number>`COUNT(DISTINCT ${mcpToolCallsTable.partnerKeyId})` })
        .from(mcpToolCallsTable)
        .where(gte(mcpToolCallsTable.calledAt, today)),
      db.select({ count: count() }).from(mcpDirectorySubmissionsTable)
        .where(eq(mcpDirectorySubmissionsTable.status, "submitted")),
    ]);

    res.json({
      active_integrations: Number(activeIntegrations[0]?.count ?? 0),
      total_tool_calls: Number(totalToolCalls[0]?.count ?? 0),
      sessions_today: Number(sessionsToday[0]?.count ?? 0),
      directories_listed: Number(directoriesListed[0]?.count ?? 0),
    });
  } catch (err) {
    console.error("mcp-marketing social-proof error:", err);
    res.status(500).json({ error: "Failed to get social proof" });
  }
});

router.post("/mcp-marketing/launch-signup", async (req, res): Promise<void> => {
  const schema = z.object({
    email: z.email(),
    name: z.string().optional(),
    company: z.string().optional(),
    source: z.string().default("launch_page"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Valid email required" }); return; }
  try {
    await db.insert(mcpLeadsTable).values({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      company: parsed.data.company ?? null,
      source: parsed.data.source,
    }).onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    console.error("mcp-marketing launch-signup error:", err);
    res.status(500).json({ error: "Failed to save signup" });
  }
});

router.post("/mcp-marketing/send-launch-email", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM ?? smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    res.status(503).json({ error: "SMTP not configured" });
    return;
  }

  try {
    const htmlTemplate = MCP_LAUNCH_OUTREACH_HTML;

    const partners = await db.select({
      id: platformApiKeysTable.id,
      clientId: platformApiKeysTable.clientId,
      label: platformApiKeysTable.label,
      clientName: clientsTable.companyName,
      contactName: clientsTable.contactName,
      contactEmail: clientsTable.contactEmail,
    })
      .from(platformApiKeysTable)
      .leftJoin(clientsTable, eq(platformApiKeysTable.clientId, clientsTable.id))
      .where(and(
        eq(platformApiKeysTable.status, "active"),
        eq(platformApiKeysTable.platform, "piratemonster_mcp"),
      ));

    if (partners.length === 0) {
      res.json({ ok: true, sent: 0, message: "No active MCP partner key holders found" });
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort ?? 587),
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    for (const partner of partners) {
      if (!partner.contactEmail) continue;
      const recipientName = partner.contactName ?? partner.clientName ?? "Partner";
      const personalized = htmlTemplate
        .replace(/{{PARTNER_NAME}}/g, recipientName)
        .replace(/{{LABEL}}/g, partner.label ?? "");

      try {
        await transporter.sendMail({
          from: smtpFrom,
          to: partner.contactEmail,
          subject: "New: GalaxyBots MCP Resources, Prompts & Knowledge Tools",
          html: personalized,
        });
        sent++;
      } catch (mailErr) {
        console.error(`Failed to send to ${partner.contactEmail}:`, mailErr);
      }
    }

    res.json({ ok: true, sent, total: partners.length });
  } catch (err) {
    console.error("mcp-marketing send-launch-email error:", err);
    res.status(500).json({ error: "Failed to send launch emails" });
  }
});

export default router;
