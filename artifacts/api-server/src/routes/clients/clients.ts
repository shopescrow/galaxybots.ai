import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, clientsTable, clientBotsTable, botsTable, botToolPermissionsTable, type WebsiteIntel } from "@workspace/db";
import { eq, and, gte, or, isNull } from "drizzle-orm";
import {
  GetClientBotsParams,
  HireBotBody,
  GetClientResponse,
  GetClientBotsResponse,
  CreateClientBody,
} from "@workspace/api-zod";
import { requireRole } from "../../middleware/auth";
import { sendValidationError } from "../../utils/validation";
import { getAllTools } from "../../tools";
import { SAFE_READ_TOOLS, DEPARTMENT_TOOL_DEFAULTS } from "../../services/platform/governance";
import { openai } from "@workspace/integrations-openai-ai-server";
import dns from "dns/promises";

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 240
  );
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return (
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized === "::" ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:169.254.")
  );
}

async function isSafeExternalUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.toLowerCase();

  const blockedNames = [
    "localhost",
    "metadata.google.internal",
    "169.254.169.254",
    "instance-data",
  ];
  if (blockedNames.includes(hostname)) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) return false;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIpv4(hostname)) return false;
  } else if (hostname.includes(":") || hostname.startsWith("[")) {
    if (isPrivateIpv6(hostname)) return false;
  } else {
    try {
      const [ipv4Results, ipv6Results] = await Promise.allSettled([
        dns.resolve4(hostname),
        dns.resolve6(hostname),
      ]);
      const allIps: string[] = [];
      if (ipv4Results.status === "fulfilled") allIps.push(...ipv4Results.value);
      if (ipv6Results.status === "fulfilled") allIps.push(...ipv6Results.value);
      if (allIps.length === 0) return false;
      for (const ip of allIps) {
        if (ip.includes(":")) {
          if (isPrivateIpv6(ip)) return false;
        } else {
          if (isPrivateIpv4(ip)) return false;
        }
      }
    } catch {
      return false;
    }
  }

  return true;
}

const UpdateClientBody = z.object({
  websiteUrl: z.string().nullish(),
  industry: z.string().nullish(),
  servicesList: z.array(z.string()).nullish(),
  targetMarket: z.string().nullish(),
  businessContext: z.string().nullish(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: "At least one field must be provided",
});

const router: IRouter = Router();

function sanitizeClient(client: typeof clientsTable.$inferSelect) {
  const { webhookSecret, ...safe } = client;
  return safe;
}

function isPlatformAdmin(req: Express.Request): boolean {
  return req.user?.bypassPayment === true;
}

const ClientsPaginationQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/clients", async (req, res): Promise<void> => {
  if (isPlatformAdmin(req)) {
    const pagination = ClientsPaginationQuery.safeParse(req.query);
    if (!pagination.success) {
      sendValidationError(res, pagination.error, "Invalid pagination parameters");
      return;
    }
    const { cursor, limit } = pagination.data;
    const conditions = cursor ? gte(clientsTable.id, cursor) : undefined;
    const allClients = await db.select().from(clientsTable)
      .where(conditions)
      .orderBy(clientsTable.id)
      .limit(limit + 1);
    const hasMore = allClients.length > limit;
    const page = hasMore ? allClients.slice(0, limit) : allClients;
    const nextCursor = hasMore ? page[page.length - 1].id + 1 : null;
    res.json({ data: page.map(sanitizeClient), nextCursor, hasMore });
  } else {
    const clientId = req.user!.clientId;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json({ data: [sanitizeClient(client)], nextCursor: null, hasMore: false });
  }
});

router.post("/clients", requireRole("owner"), async (req, res): Promise<void> => {
  if (!isPlatformAdmin(req)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error, "Invalid request body");
    return;
  }

  const { companyName, contactName, contactEmail, plan } = parsed.data;

  const [client] = await db.insert(clientsTable).values({
    companyName,
    contactName,
    contactEmail,
    plan,
  }).returning();

  res.status(201).json(sanitizeClient(client));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse(sanitizeClient(client)));
});

router.patch("/clients/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = UpdateClientBody.safeParse(req.body);
  if (!body.success) {
    sendValidationError(res, body.error);
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.websiteUrl !== undefined) updates.websiteUrl = body.data.websiteUrl;
  if (body.data.industry !== undefined) updates.industry = body.data.industry;
  if (body.data.servicesList !== undefined) updates.servicesList = body.data.servicesList;
  if (body.data.targetMarket !== undefined) updates.targetMarket = body.data.targetMarket;
  if (body.data.businessContext !== undefined) updates.businessContext = body.data.businessContext;

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(sanitizeClient(updated));
});

router.get("/clients/:id/bots", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const hiredBots = await db
    .select({ bot: botsTable })
    .from(clientBotsTable)
    .innerJoin(botsTable, eq(clientBotsTable.botId, botsTable.id))
    .where(eq(clientBotsTable.clientId, id));

  res.json(GetClientBotsResponse.parse(hiredBots.map(r => r.bot)));
});

router.post("/clients/:id/bots", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = HireBotBody.safeParse(req.body);
  if (!body.success) {
    sendValidationError(res, body.error);
    return;
  }

  const tenantCondition = or(isNull(botsTable.tenantId), eq(botsTable.tenantId, id));
  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, body.data.botId), tenantCondition));
  if (!bot) {
    res.status(400).json({ error: "Bot not found" });
    return;
  }

  const clientBot = await db.transaction(async (tx) => {
    const [hired] = await tx.insert(clientBotsTable).values({
      clientId: id,
      botId: body.data.botId,
      status: "active",
    }).returning();

    const existingPerms = await tx
      .select()
      .from(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, id),
          eq(botToolPermissionsTable.botId, body.data.botId)
        )
      );

    if (existingPerms.length === 0) {
      const allTools = getAllTools();
      const allToolNames = allTools.map((t) => t.name);
      const defaults = DEPARTMENT_TOOL_DEFAULTS[bot.department];

      const permissionValues = allToolNames.map((toolName) => {
        const allowed = defaults ? defaults.allowed.includes(toolName) : SAFE_READ_TOOLS.includes(toolName);
        const requiresApproval = defaults ? defaults.approvalRequired.includes(toolName) : false;
        return {
          clientId: id,
          botId: body.data.botId,
          toolName,
          allowed,
          requiresApproval: allowed ? requiresApproval : false,
        };
      });

      await tx.insert(botToolPermissionsTable).values(permissionValues);
    }

    return hired;
  });

  res.status(201).json(clientBot);
});

router.post("/clients/:id/scrape-website", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const url = req.body.url || client.websiteUrl;
  if (!url) {
    res.status(400).json({ error: "No website URL provided" });
    return;
  }

  res.json({ status: "scraping", message: "Website analysis started" });

  setImmediate(async () => {
    try {
      const safe = await isSafeExternalUrl(url).catch(() => false);
      if (!safe) {
        console.warn(`[website-intel] Blocked unsafe URL for client ${id}: ${url}`);
        return;
      }

      const response = await fetch(url, {
        headers: { "User-Agent": "GalaxyBots/1.0 (Website Analyzer)" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return;

      const html = await response.text();
      const { load } = await import("cheerio");
      const $ = load(html);
      $("script, style, nav, footer, header, noscript, iframe").remove();
      const rawContent = $("body").text().replace(/\s+/g, " ").trim().slice(0, 8000);
      const title = $("title").text().trim();

      if (!rawContent || rawContent.length < 50) return;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // high-volume website intel extraction, cost-efficient
        max_completion_tokens: 500,
        messages: [
          {
            role: "system",
            content: "You are a business analyst. Extract key business information from the following website content. Return a JSON object with these fields: summary (2-3 sentence company overview), industry (single industry label), valueProposition (the core value they deliver), productCategories (array of up to 5 main products/services), targetMarket (who their customers are). Return ONLY valid JSON.",
          },
          {
            role: "user",
            content: `Website: ${url}\nTitle: ${title}\n\nContent:\n${rawContent}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const analysisText = completion.choices[0]?.message?.content;
      if (!analysisText) return;

      let analysis: Record<string, unknown>;
      try {
        analysis = JSON.parse(analysisText);
      } catch {
        return;
      }

      const intel: WebsiteIntel = {
        scrapedAt: new Date().toISOString(),
        title: title || undefined,
        summary: typeof analysis.summary === "string" ? analysis.summary : undefined,
        industry: typeof analysis.industry === "string" ? analysis.industry : undefined,
        valueProposition: typeof analysis.valueProposition === "string" ? analysis.valueProposition : undefined,
        productCategories: Array.isArray(analysis.productCategories) ? analysis.productCategories.filter((x): x is string => typeof x === "string") : undefined,
        targetMarket: typeof analysis.targetMarket === "string" ? analysis.targetMarket : undefined,
        rawContent: rawContent.slice(0, 2000),
      };

      await db
        .update(clientsTable)
        .set({ websiteIntel: intel })
        .where(eq(clientsTable.id, id));

      console.log(`[website-intel] Scraped and analyzed website for client ${id}: ${url}`);
    } catch (err) {
      console.error(`[website-intel] Failed to scrape website for client ${id}:`, err);
    }
  });
});

export default router;
