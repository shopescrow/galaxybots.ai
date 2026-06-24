import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  clientsTable,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
  pipelineTriggersTable,
  triggerEventsTable,
  pipelinesTable,
} from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import crypto from "crypto";
import { runAgenticLoop } from "../../tools";
import { buildClientContext } from "../../services/clients/client-context";
import { executePipelineRun } from "../../services/missions/pipeline-engine";

const LeadPayload = z.object({
  name: z.string().min(1),
  contact: z.string().min(1),
  serviceInterest: z.string().optional(),
  message: z.string().optional(),
});

const router: IRouter = Router();

router.post("/webhooks/lead/:clientId", async (req, res): Promise<void> => {
  const webhookDepthHeader = req.headers["x-galaxybots-webhook-depth"];
  if (webhookDepthHeader) {
    const depth = parseInt(String(webhookDepthHeader), 10);
    if (!isNaN(depth) && depth > 5) {
      res.status(429).json({ error: "Webhook depth limit exceeded. Possible recursive loop detected." });
      return;
    }
  }

  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = authHeader.slice(7);

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!client.webhookSecret) {
    res.status(403).json({ error: "Webhook not configured for this client" });
    return;
  }

  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(client.webhookSecret);

  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    res.status(403).json({ error: "Invalid webhook token" });
    return;
  }

  const parsed = LeadPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, contact, serviceInterest, message } = parsed.data;

  const leadTrigger = await findOrCreateLeadTrigger(clientId);

  if (leadTrigger) {
    const payloadPreview = JSON.stringify(parsed.data).substring(0, 500);
    const [event] = await db
      .insert(triggerEventsTable)
      .values({
        triggerId: leadTrigger.triggerId,
        pipelineId: leadTrigger.pipelineId,
        status: "pending",
        payloadPreview,
      })
      .returning();

    try {
      const run = await executePipelineRun(leadTrigger.pipelineId, "generic", {
        ...parsed.data,
        _trigger: {
          type: "generic",
          slug: leadTrigger.slug,
          eventId: event.id,
          source: "legacy_lead_webhook",
        },
      });

      await db
        .update(triggerEventsTable)
        .set({ status: "success", runId: run.id })
        .where(eq(triggerEventsTable.id, event.id));

      res.status(201).json({
        runId: run.id,
        eventId: event.id,
        message: "Lead ingested via unified trigger system",
      });
      return;
    } catch (err) {
      await db
        .update(triggerEventsTable)
        .set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Pipeline execution failed",
        })
        .where(eq(triggerEventsTable.id, event.id));
    }
  }

  const objective = `New lead inquiry from ${name} (${contact}).${serviceInterest ? ` Service interest: ${serviceInterest}.` : ""}${message ? ` Message: ${message}` : ""} — Qualify this lead, assess their needs, and prepare a follow-up plan for ${client.companyName}.`;

  const [session] = await db
    .insert(taskSessionsTable)
    .values({ objective, clientId })
    .returning();

  const salesBots = await db
    .select()
    .from(botsTable)
    .where(ilike(botsTable.department, "%sales%"));

  let assignedBots = salesBots;
  if (assignedBots.length === 0) {
    const allBots = await db.select().from(botsTable).limit(3);
    assignedBots = allBots;
  }

  if (assignedBots.length > 0) {
    await db.insert(taskSessionBotsTable).values(
      assignedBots.map((bot) => ({
        sessionId: session.id,
        botId: bot.id,
      })),
    );
  }

  res.status(201).json({
    sessionId: session.id,
    objective,
    assignedBots: assignedBots.map((b) => ({ id: b.id, name: b.name, title: b.title })),
    message: "Lead ingested and bot mission triggered",
  });

  const clientContext = await buildClientContext(clientId);

  const teamRoster = assignedBots.map((b) => `${b.name} (${b.title})`).join(", ");

  for (const bot of assignedBots) {
    const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department — a master's-level domain expert.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}
${clientContext}
TASK OBJECTIVE: ${objective}
TEAM MEMBERS: ${teamRoster}

You are working on a lead qualification mission. A new inquiry has come in via the client's website. Your job is to:
1. Assess the lead's needs based on their message and service interest
2. Determine lead quality and priority
3. Outline a follow-up strategy with specific next steps
4. Draft a brief professional response to the prospect

Keep responses focused and actionable (3-5 sentences per point).`;

    try {
      const { finalContent } = await runAgenticLoop({
        model: "gpt-5-mini", // high-volume lead ingestion, cost-efficient
        maxIterations: 5,
        maxTokens: 500,
        systemPrompt,
        messages: [
          {
            role: "user",
            content: `New lead from ${client.companyName}'s website:\nName: ${name}\nContact: ${contact}${serviceInterest ? `\nService Interest: ${serviceInterest}` : ""}${message ? `\nMessage: ${message}` : ""}\n\nPlease qualify this lead and prepare a follow-up plan.`,
          },
        ],
        context: {
          sessionId: session.id,
          botId: bot.id,
          botName: bot.name,
          clientId,
          depth: webhookDepthHeader ? parseInt(String(webhookDepthHeader), 10) : 0,
        },
      });

      const content = finalContent || "Lead acknowledged. Preparing qualification analysis.";

      await db.insert(taskSessionMessagesTable).values({
        sessionId: session.id,
        botId: bot.id,
        botName: bot.name,
        botTitle: bot.title,
        role: "bot",
        content,
        messageType: "text",
      });
    } catch (err) {
      console.error(`Webhook bot execution error for bot ${bot.name}:`, err);
      await db.insert(taskSessionMessagesTable).values({
        sessionId: session.id,
        botId: bot.id,
        botName: bot.name,
        botTitle: bot.title,
        role: "bot",
        content: "Lead received. Manual follow-up required due to processing error.",
        messageType: "text",
      });
    }
  }
});

async function findOrCreateLeadTrigger(clientId: number): Promise<{ triggerId: number; pipelineId: number; slug: string } | null> {
  try {
    const clientPipelines = await db
      .select()
      .from(pipelinesTable)
      .where(and(eq(pipelinesTable.clientId, clientId), eq(pipelinesTable.active, true)));

    for (const pipeline of clientPipelines) {
      const triggers = await db
        .select()
        .from(pipelineTriggersTable)
        .where(and(
          eq(pipelineTriggersTable.pipelineId, pipeline.id),
          eq(pipelineTriggersTable.active, true),
        ));

      const leadTrigger = triggers.find(
        (t) => t.label?.toLowerCase().includes("lead") || t.triggerType === "form"
      );

      if (leadTrigger) {
        return { triggerId: leadTrigger.id, pipelineId: pipeline.id, slug: leadTrigger.endpointSlug };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export default router;
