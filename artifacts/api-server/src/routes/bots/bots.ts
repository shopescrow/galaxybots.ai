import { Router, type IRouter } from "express";
import { db, botsTable, botSlaEventsTable, botSlaOverridesTable, slaTiersTable, clientsTable } from "@workspace/db";
import { eq, and, gte, desc, sql, or, isNull } from "drizzle-orm";
import { GetBotParams, ListBotsResponse, GetBotResponse } from "@workspace/api-zod";
import { openai, batchProcessWithSSE } from "@workspace/integrations-openai-ai-server";
import { llmRateLimit } from "../../middleware/rate-limit";
import { getEffectiveSlaTargets } from "../../services/analytics/sla";
import { sendValidationError, sendParamError } from "../../utils/validation";
import { z } from "zod/v4";

const router: IRouter = Router();

const DEPARTMENT_ORDER = [
  "Board of Directors",
  "Executive Leadership",
  "Operations",
  "Sales & Marketing",
  "Finance & Legal",
  "Technology & Product",
  "Human Resources",
  "Strategy & Innovation",
  "Voice & Communications",
];

function sortByDepartment<T extends { department: string; name: string }>(bots: T[]): T[] {
  return [...bots].sort((a, b) => {
    const aIdx = DEPARTMENT_ORDER.indexOf(a.department);
    const bIdx = DEPARTMENT_ORDER.indexOf(b.department);
    const aOrder = aIdx === -1 ? DEPARTMENT_ORDER.length : aIdx;
    const bOrder = bIdx === -1 ? DEPARTMENT_ORDER.length : bIdx;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
}

const PaginationQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/bots", async (req, res): Promise<void> => {
  const pagination = PaginationQuery.safeParse(req.query);
  if (!pagination.success) {
    sendValidationError(res, pagination.error, "Invalid pagination parameters");
    return;
  }
  const { cursor, limit } = pagination.data;
  const callerClientId = req.user?.clientId;

  const conditions = callerClientId
    ? or(isNull(botsTable.tenantId), eq(botsTable.tenantId, callerClientId))
    : isNull(botsTable.tenantId);

  let query = db.select().from(botsTable)
    .where(cursor ? and(conditions, gte(botsTable.id, cursor)) : conditions)
    .orderBy(botsTable.id)
    .limit(limit + 1);

  const bots = await query;
  const hasMore = bots.length > limit;
  const page = hasMore ? bots.slice(0, limit) : bots;
  const nextCursor = hasMore ? page[page.length - 1].id + 1 : null;

  res.json({ data: ListBotsResponse.parse(page), nextCursor, hasMore });
});

router.get("/bots/declarations", async (req, res): Promise<void> => {
  const pagination = PaginationQuery.safeParse(req.query);
  if (!pagination.success) {
    sendValidationError(res, pagination.error, "Invalid pagination parameters");
    return;
  }
  const { cursor, limit } = pagination.data;
  const callerClientId = req.user?.clientId;

  const conditions = callerClientId
    ? or(isNull(botsTable.tenantId), eq(botsTable.tenantId, callerClientId))
    : isNull(botsTable.tenantId);

  const bots = await db.select().from(botsTable)
    .where(cursor ? and(conditions, gte(botsTable.id, cursor)) : conditions)
    .orderBy(botsTable.id)
    .limit(limit + 1);

  const hasMore = bots.length > limit;
  const page = hasMore ? bots.slice(0, limit) : bots;
  const nextCursor = hasMore ? page[page.length - 1].id + 1 : null;

  const sorted = sortByDepartment(page);
  const result = sorted.map((bot) => ({
    id: bot.id,
    name: bot.name,
    title: bot.title,
    department: bot.department,
    avatar: bot.avatar,
    declaration: bot.declaration,
  }));
  res.json({ data: result, nextCursor, hasMore });
});

router.post("/bots/generate-declarations", llmRateLimit, async (req, res): Promise<void> => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event: { type: string; [key: string]: unknown }) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const callerClientId = req.user?.clientId;
    const tenantCondition = callerClientId
      ? or(isNull(botsTable.tenantId), eq(botsTable.tenantId, callerClientId))
      : isNull(botsTable.tenantId);
    const allBots = await db.select().from(botsTable).where(tenantCondition);
    const sorted = sortByDepartment(allBots);

    type BotRow = (typeof sorted)[number];
    interface DeclarationResult {
      id: number;
      name: string;
      title: string;
      department: string;
      avatar: string | null;
      declaration: string;
      cached: boolean;
    }

    await batchProcessWithSSE<BotRow, DeclarationResult>(
      sorted,
      async (bot) => {
        if (bot.declaration) {
          return {
            id: bot.id,
            name: bot.name,
            title: bot.title,
            department: bot.department,
            avatar: bot.avatar,
            declaration: bot.declaration,
            cached: true,
          };
        }

        const prompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.

Your personality: ${bot.personality}

Your description: ${bot.description}

Your responsibilities: ${bot.responsibilities.join("; ")}

You are an autonomous AI agent coming online in a virtual corporate world. Write a first-person declaration (3-5 sentences) announcing who you are and what you will do as an active agent in this world. Do NOT describe yourself as an advisor — you are an autonomous agent who ACTS.

Format: "I am [Name]. I own [domain]. In this world, I will [specific autonomous actions]."

Be bold, specific, and speak in your unique voice and personality. No quotation marks around your response.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o", // medium-complexity: bot identity and personality fabrication
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.9,
        });

        const declaration =
          response.choices[0]?.message?.content?.trim() || "";

        if (declaration) {
          await db
            .update(botsTable)
            .set({ declaration })
            .where(eq(botsTable.id, bot.id));
        }

        return {
          id: bot.id,
          name: bot.name,
          title: bot.title,
          department: bot.department,
          avatar: bot.avatar,
          declaration,
          cached: false,
        };
      },
      sendEvent,
      { retries: 5, minTimeout: 1000, maxTimeout: 15000 }
    );
  } catch (error) {
    sendEvent({
      type: "error",
      error: error instanceof Error ? error.message : "Fatal error",
    });
  }

  res.end();
});

router.get("/bots/:id", async (req, res): Promise<void> => {
  const params = GetBotParams.safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error);
    return;
  }

  const callerClientId = req.user?.clientId;
  const tenantCondition = callerClientId
    ? or(isNull(botsTable.tenantId), eq(botsTable.tenantId, callerClientId))
    : isNull(botsTable.tenantId);

  const [bot] = await db.select().from(botsTable).where(and(eq(botsTable.id, params.data.id), tenantCondition));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotResponse.parse(bot));
});

const SLA_TIER_MAP: Record<string, string> = {
  free: "standard", starter: "standard", standard: "standard",
  team: "priority", priority: "priority", enterprise: "enterprise",
};

router.get("/bots/:id/sla", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.id);
  if (isNaN(botId)) { res.status(400).json({ error: "Invalid bot id" }); return; }

  const clientId = req.user?.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const periodParam = (req.query.period as string) || "7d";
  const days = periodParam === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [client] = await db.select({ plan: clientsTable.plan }).from(clientsTable).where(eq(clientsTable.id, clientId));
    const tierKey = SLA_TIER_MAP[client?.plan ?? "standard"] ?? "standard";
    const [tier] = await db.select().from(slaTiersTable).where(eq(slaTiersTable.tierId, tierKey));
    const targets = await getEffectiveSlaTargets(botId, clientId);

    const events = await db
      .select()
      .from(botSlaEventsTable)
      .where(
        and(
          eq(botSlaEventsTable.botId, botId),
          eq(botSlaEventsTable.clientId, clientId),
          gte(botSlaEventsTable.createdAt, since)
        )
      )
      .orderBy(desc(botSlaEventsTable.createdAt));

    const responseEvents = events.filter((e) => e.eventType === "response" && e.resolvedAt !== null);
    const completionEvents = events.filter((e) => e.eventType === "completion");

    const responseMet = responseEvents.filter((e) => !e.breached).length;
    const completionMet = completionEvents.filter((e) => !e.breached).length;

    const responseComplianceRate = responseEvents.length > 0
      ? Math.round((responseMet / responseEvents.length) * 1000) / 10
      : null;
    const completionComplianceRate = completionEvents.length > 0
      ? Math.round((completionMet / completionEvents.length) * 1000) / 10
      : null;

    const netDurations = responseEvents
      .map((e) => e.netDurationMs)
      .filter((d): d is number => d !== null);
    const avgResponseMs = netDurations.length > 0
      ? Math.round(netDurations.reduce((a, b) => a + b, 0) / netDurations.length)
      : null;

    const sorted = [...netDurations].sort((a, b) => a - b);
    const p95ResponseMs = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.95)] ?? null
      : null;

    const avgHoldMs = responseEvents.length > 0
      ? Math.round(responseEvents.reduce((sum, e) => sum + (e.approvalHoldMs ?? 0), 0) / responseEvents.length)
      : 0;

    const recentBreaches = events
      .filter((e) => e.breached)
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        sessionId: e.sessionId,
        eventType: e.eventType,
        directedAt: e.directedAt,
        resolvedAt: e.resolvedAt,
        netDurationMs: e.netDurationMs,
        targetMs: e.targetMs,
        tier: e.tier,
      }));

    const dailyStats: Record<string, { responseDurations: number[]; breached: number; total: number }> = {};
    for (const e of responseEvents) {
      const day = new Date(e.createdAt).toISOString().slice(0, 10);
      if (!dailyStats[day]) dailyStats[day] = { responseDurations: [], breached: 0, total: 0 };
      dailyStats[day].total++;
      if (e.netDurationMs !== null) dailyStats[day].responseDurations.push(e.netDurationMs);
      if (e.breached) dailyStats[day].breached++;
    }

    const trendData = Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({
        date,
        avgResponseMs: s.responseDurations.length > 0
          ? Math.round(s.responseDurations.reduce((a, b) => a + b, 0) / s.responseDurations.length)
          : null,
        total: s.total,
        breached: s.breached,
      }));

    res.json({
      botId,
      clientId,
      period: periodParam,
      targets,
      tier: {
        id: tierKey,
        name: tier?.tierName ?? tierKey,
        responseTargetMs: tier?.responseTargetMs ?? 90000,
        completionTargetMinutes: tier?.completionTargetMinutes ?? 240,
        escalationChannels: (tier?.escalationChannels ?? []) as string[],
      },
      responseCompliance: {
        rate: responseComplianceRate,
        met: responseMet,
        total: responseEvents.length,
        avgResponseMs,
        p95ResponseMs,
        avgHoldMs,
      },
      completionCompliance: {
        rate: completionComplianceRate,
        met: completionMet,
        total: completionEvents.length,
      },
      recentBreaches,
      trendData,
    });
  } catch (err) {
    console.error("Bot SLA fetch error:", err);
    res.status(500).json({ error: "Failed to fetch SLA data" });
  }
});

router.put("/bots/:id/sla", async (req, res): Promise<void> => {
  const botId = parseInt(req.params.id);
  if (isNaN(botId)) { res.status(400).json({ error: "Invalid bot id" }); return; }

  const clientId = req.user?.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }

  const role = req.user?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Only owners and admins can update SLA overrides" });
    return;
  }

  const schema = z.object({
    responseTargetMs: z.number().int().min(1000).optional(),
    completionTargetMinutes: z.number().int().min(1).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { sendValidationError(res, parsed.error); return; }

  try {
    const [client] = await db.select({ plan: clientsTable.plan }).from(clientsTable).where(eq(clientsTable.id, clientId));
    const tierKey = SLA_TIER_MAP[client?.plan ?? "standard"] ?? "standard";
    const [tier] = await db.select().from(slaTiersTable).where(eq(slaTiersTable.tierId, tierKey));

    if (tier && parsed.data.responseTargetMs !== undefined) {
      if (parsed.data.responseTargetMs > tier.responseTargetMs) {
        res.status(400).json({
          error: `Response target cannot be looser than tier default (${tier.responseTargetMs}ms for ${tier.tierName})`,
        });
        return;
      }
    }
    if (tier && parsed.data.completionTargetMinutes !== undefined) {
      if (parsed.data.completionTargetMinutes > tier.completionTargetMinutes) {
        res.status(400).json({
          error: `Completion target cannot be looser than tier default (${tier.completionTargetMinutes}min for ${tier.tierName})`,
        });
        return;
      }
    }

    const [existing] = await db
      .select()
      .from(botSlaOverridesTable)
      .where(and(eq(botSlaOverridesTable.botId, botId), eq(botSlaOverridesTable.clientId, clientId)));

    if (existing) {
      await db
        .update(botSlaOverridesTable)
        .set({
          responseTargetMs: parsed.data.responseTargetMs ?? existing.responseTargetMs,
          completionTargetMinutes: parsed.data.completionTargetMinutes ?? existing.completionTargetMinutes,
          updatedAt: new Date(),
        })
        .where(eq(botSlaOverridesTable.id, existing.id));
    } else {
      await db.insert(botSlaOverridesTable).values({
        botId,
        clientId,
        responseTargetMs: parsed.data.responseTargetMs ?? null,
        completionTargetMinutes: parsed.data.completionTargetMinutes ?? null,
      });
    }

    const targets = await getEffectiveSlaTargets(botId, clientId);
    res.json({ success: true, targets });
  } catch (err) {
    console.error("Bot SLA update error:", err);
    res.status(500).json({ error: "Failed to update SLA override" });
  }
});

export default router;
