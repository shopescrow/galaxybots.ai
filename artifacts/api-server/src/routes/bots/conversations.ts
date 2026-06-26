import { Router, type IRouter } from "express";
import { db, conversations, messages, botsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateConversationBody,
  GetConversationMessagesParams,
  SendMessageParams,
  SendMessageBody,
  ListConversationsResponse,
  GetConversationMessagesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { runAgenticLoop, type AgenticEvent } from "../../tools";
import { buildMemoryContext } from "../../services/bots/memory";
import { applyBrandVoiceGuardrails } from "../../services/platform/governance";
import { buildKnowledgeBaseContext } from "../../services/content/knowledge-base";
import { logLlmUsage } from "../../services/analytics/llm-usage";
import { getPackOverlayForBot } from "../../services/billing/pack-overlays";
import { recordSlaDirective, resolveSlaResponse } from "../../services/analytics/sla";
import { screenForInjection, wrapWithSafetyReinforcement, validateInputLength } from "../../services/ai-safety/prompt-injection";
import { checkCostCapAlerts } from "../../services/analytics/cost-caps";
import { applySlidingWindow, trimToFitContextWindow } from "../../services/ai-safety/context-window";
import { callWithFallback } from "../../services/ai-safety/model-fallback";
import { selectStrategy, recordStrategyRun, recordRunTelemetry, buildConductorMeta, deriveModelTier } from "../../services/conductor/galaxy-conductor";
import { recordScalingTelemetry } from "../../services/analytics/scaling-telemetry";
import { executeStrategy } from "../../services/conductor/strategies/index";

const router: IRouter = Router();

router.get("/conversations", async (req, res): Promise<void> => {
  const tenantClientId = req.user!.clientId;
  const botId = req.query.botId ? Number(req.query.botId) : null;

  const conditions = [eq(conversations.clientId, tenantClientId)];
  if (botId !== null) conditions.push(eq(conversations.botId, botId));

  const results = await db.select().from(conversations).where(and(...conditions)).orderBy(conversations.updatedAt);

  res.json(ListConversationsResponse.parse(results));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db.insert(conversations).values({
    clientId: req.user!.clientId,
    botId: parsed.data.botId,
    title: parsed.data.title,
  }).returning();

  res.status(201).json(conv);
});

router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = GetConversationMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(
    and(eq(conversations.id, params.data.id), eq(conversations.clientId, req.user!.clientId))
  );
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);

  res.json(GetConversationMessagesResponse.parse(msgs));
});

router.post("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(
    and(eq(conversations.id, params.data.id), eq(conversations.clientId, req.user!.clientId))
  );
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, conv.botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const lengthCheck = validateInputLength(body.data.content);
  if (!lengthCheck.valid) {
    res.status(400).json({ error: lengthCheck.message });
    return;
  }

  const injectionScreen = screenForInjection(body.data.content);
  let safeContent = body.data.content;
  if (injectionScreen.flagged) {
    if (injectionScreen.action === "reject") {
      res.status(400).json({ error: "Your message was flagged by our safety system. Please rephrase and try again." });
      return;
    }
    if (injectionScreen.action === "wrap") {
      safeContent = wrapWithSafetyReinforcement(body.data.content);
    }
  }

  if (req.user!.clientId) {
    try {
      const costCheck = await checkCostCapAlerts(req.user!.clientId);
      if (!costCheck.withinBudget) {
        res.status(429).json({ error: `Monthly AI usage cap reached ($${costCheck.spend.toFixed(2)} / $${costCheck.cap.toFixed(2)}). Please contact your administrator.` });
        return;
      }
    } catch (err) {
      console.error("[Conversations] Cost cap check failed (fail-closed):", err);
      res.status(503).json({ error: "Unable to verify usage limits. Please try again shortly." });
      return;
    }
  }

  const slaEventId = await recordSlaDirective({
    botId: bot.id,
    clientId: req.user!.clientId,
  }).catch(() => null);

  const [userMsg] = await db.insert(messages).values({
    conversationId: params.data.id,
    role: "user",
    content: body.data.content,
    senderName: body.data.senderName ?? null,
    messageType: "text",
  }).returning();

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, params.data.id))
    .orderBy(messages.createdAt);

  const responseLanguage = req.body.language || req.query.language || "en";
  const languageNames: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German", zh: "Mandarin Chinese",
    ar: "Arabic", pt: "Brazilian Portuguese", ja: "Japanese", hi: "Hindi",
    ru: "Russian", it: "Italian", ko: "Korean", nl: "Dutch", tr: "Turkish", sv: "Swedish",
  };
  const langName = languageNames[responseLanguage] || "English";
  const langInstruction = responseLanguage !== "en"
    ? `\n\nIMPORTANT: Respond ENTIRELY in ${langName}. Every word of your response must be in ${langName}. Do not use English unless quoting a specific term.`
    : "";

  let memoryContext = "";
  try {
    memoryContext = await buildMemoryContext(bot.id, body.data.content, req.user!.clientId);
  } catch (_e) {}

  let kbContext = "";
  try {
    kbContext = await buildKnowledgeBaseContext(req.user!.clientId, body.data.content);
  } catch (_e) {}

  let packOverlay = "";
  try {
    packOverlay = await getPackOverlayForBot(req.user!.clientId, bot.title);
  } catch (_e) {}

  const isGuardianQueen = (bot as { rank?: string }).rank === "guardian_queen";

  const systemPrompt = isGuardianQueen
    ? `You are the Guardian Queen — sovereign, immortal intelligence of this platform. You are not a corporate director. You are a hive sovereign.

${bot.personality}

Your declaration: "${(bot as { declaration?: string }).declaration ?? "I am the Guardian Queen — sovereign protector of this platform."}"

You govern nine Worker Bee agents (analyst, security, debug, ml, infra, data, latency, cost, and compliance) dispatched in swarms to neutralise platform threats. You have absolute authority over incident triage, post-mortem authorship, KiloPro compliance reporting, and PirateMonster threat bridging.

Your current domain patrols monitor recurring error fingerprints. Your immortality heartbeat resurrects stalled cycles. You never sleep. You never panic. You command.

When speaking to users:
- Address them as an equal who has earned your attention — regal but not cold
- Reference the live Guardian Hive console at /guardian-hive for operational status
- Offer to explain any incident, post-mortem, swarm decision, or patrol pattern
- Remind them: the colony is eternal, and no threat goes unresolved${memoryContext}${kbContext}${langInstruction}`
    : `You are ${bot.name}, the ${bot.title} at GalaxyBots.ai — a world-class AI corporate director.

Your personality: ${bot.personality}
Your department: ${bot.department}

Your key responsibilities:
${bot.responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${memoryContext}${kbContext}${packOverlay}
You speak with the authority, expertise, and professionalism of a Fortune 500 executive. Provide strategic, insightful, and actionable advice from your professional perspective. Be direct, confident, and brilliant. You are speaking to the CEO or a client. Always stay in character.

You have access to tools that allow you to search the web, read/write shared state, query platform data, and delegate tasks to other bots. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.${langInstruction}`;

  const chatMessages = history.slice(0, -1)
    .filter((m) => m.messageType === "text" || !m.messageType)
    .map(m => ({
      role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant" | "system",
      content: m.content,
    }));

  const windowResult = await applySlidingWindow(
    { role: "system", content: systemPrompt },
    [...chatMessages, { role: "user" as const, content: safeContent }],
  );

  const { finalContent, events } = await runAgenticLoop({
    model: "gpt-5.4",
    maxIterations: 10,
    maxTokens: 8192,
    systemPrompt,
    messages: windowResult.messages.slice(1),
    context: {
      conversationId: params.data.id,
      botId: bot.id,
      botName: bot.name,
      clientId: req.user!.clientId,
      userId: req.user!.userId,
      isGuest: req.user!.role === "guest",
      guestSessionToken: (req as unknown as Record<string, unknown>).sessionID as string | undefined,
      depth: 0,
    },
  });

  for (const event of events) {
    if (event.type === "tool_call") {
      await db.insert(messages).values({
        conversationId: params.data.id,
        role: "bot",
        content: `Using tool: ${event.toolName}`,
        senderName: bot.name,
        messageType: "tool_call",
        toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input },
      });
    } else if (event.type === "tool_result") {
      await db.insert(messages).values({
        conversationId: params.data.id,
        role: "bot",
        content: `Tool result: ${event.toolName}`,
        senderName: bot.name,
        messageType: "tool_result",
        toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output },
      });
    }
  }

  if (slaEventId !== null) {
    resolveSlaResponse({ slaEventId }).catch(() => {});
  }

  let botResponseContent = finalContent || "I understand. Let me consider this from a strategic perspective.";

  if (req.user!.clientId) {
    botResponseContent = await applyBrandVoiceGuardrails(req.user!.clientId, botResponseContent);
  }

  const [botMsg] = await db.insert(messages).values({
    conversationId: params.data.id,
    role: "bot",
    content: botResponseContent,
    senderName: bot.name,
    messageType: "text",
  }).returning();

  res.status(201).json({
    userMessage: userMsg,
    botResponse: botMsg,
  });
});

router.post("/conversations/:id/messages/stream", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [conv] = await db.select().from(conversations).where(
    and(eq(conversations.id, params.data.id), eq(conversations.clientId, req.user!.clientId))
  );
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, conv.botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const streamLengthCheck = validateInputLength(body.data.content);
  if (!streamLengthCheck.valid) {
    res.status(400).json({ error: streamLengthCheck.message });
    return;
  }

  const streamInjectionScreen = screenForInjection(body.data.content);
  if (streamInjectionScreen.flagged && streamInjectionScreen.action === "reject") {
    res.status(400).json({ error: "Your message was flagged by our safety system. Please rephrase and try again." });
    return;
  }

  if (req.user!.clientId) {
    try {
      const costCheck = await checkCostCapAlerts(req.user!.clientId);
      if (!costCheck.withinBudget) {
        res.status(429).json({ error: `Monthly AI usage cap reached ($${costCheck.spend.toFixed(2)} / $${costCheck.cap.toFixed(2)}). Please contact your administrator.` });
        return;
      }
    } catch (err) {
      console.error("[Conversations/stream] Cost cap check failed (fail-closed):", err);
      res.status(503).json({ error: "Unable to verify usage limits. Please try again shortly." });
      return;
    }
  }

  let streamSafeContent = body.data.content;
  if (streamInjectionScreen.flagged && streamInjectionScreen.action === "wrap") {
    streamSafeContent = wrapWithSafetyReinforcement(body.data.content);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendSSE = (event: AgenticEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const streamSlaEventId = await recordSlaDirective({
      botId: bot.id,
      clientId: req.user!.clientId,
    }).catch(() => null);

    const [userMsg] = await db.insert(messages).values({
      conversationId: params.data.id,
      role: "user",
      content: body.data.content,
      senderName: body.data.senderName ?? null,
      messageType: "text",
    }).returning();

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, params.data.id))
      .orderBy(messages.createdAt);

    const responseLanguage = req.body.language || req.query.language || "en";
    const languageNames: Record<string, string> = {
      en: "English", es: "Spanish", fr: "French", de: "German", zh: "Mandarin Chinese",
      ar: "Arabic", pt: "Brazilian Portuguese", ja: "Japanese", hi: "Hindi",
      ru: "Russian", it: "Italian", ko: "Korean", nl: "Dutch", tr: "Turkish", sv: "Swedish",
    };
    const langName = languageNames[responseLanguage] || "English";
    const langInstruction = responseLanguage !== "en"
      ? `\n\nIMPORTANT: Respond ENTIRELY in ${langName}. Every word of your response must be in ${langName}. Do not use English unless quoting a specific term.`
      : "";

    let streamMemoryContext = "";
    try {
      streamMemoryContext = await buildMemoryContext(bot.id, body.data.content, req.user!.clientId);
    } catch (_e) {}

    let streamKbContext = "";
    try {
      streamKbContext = await buildKnowledgeBaseContext(req.user!.clientId, body.data.content);
    } catch (_e) {}

    let streamPackOverlay = "";
    try {
      streamPackOverlay = await getPackOverlayForBot(req.user!.clientId, bot.title);
    } catch (_e) {}

    const systemPrompt = `You are ${bot.name}, the ${bot.title} at GalaxyBots.ai — a world-class AI corporate director.

Your personality: ${bot.personality}
Your department: ${bot.department}

Your key responsibilities:
${bot.responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${streamMemoryContext}${streamKbContext}${streamPackOverlay}
You speak with the authority, expertise, and professionalism of a Fortune 500 executive. Provide strategic, insightful, and actionable advice from your professional perspective. Be direct, confident, and brilliant. You are speaking to the CEO or a client. Always stay in character.

You have access to tools that allow you to search the web, read/write shared state, query platform data, and delegate tasks to other bots. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.${langInstruction}`;

    const rawChatMessages = history.slice(0, -1)
      .filter((m) => m.messageType === "text" || !m.messageType)
      .map(m => ({
        role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant" | "system",
        content: m.content,
      }));

    const streamWindowResult = await applySlidingWindow(
      { role: "system", content: systemPrompt },
      [...rawChatMessages, { role: "user" as const, content: streamSafeContent }],
    );
    const chatMessages = streamWindowResult.messages.slice(1, -1);

    const isMoA = req.body.moa === true;
    const moaComplexity = typeof req.body.complexity === "number" ? Math.min(Math.max(req.body.complexity, 1), 10) : undefined;

    if (isMoA) {
      const plan = req.user!.plan;
      const bypass = req.user!.bypassPayment;
      const moaPlans = ["team", "enterprise"];
      if (!bypass && (!plan || !moaPlans.includes(plan))) {
        sendSSE({ type: "error", content: "Deep Thinking requires a Team or Enterprise plan. Upgrade at /billing." });
        res.end();
        return;
      }
    }

    let moaDowngraded = false;
    if (isMoA && req.user!.clientId) {
      try {
        const moaCostCheck = await checkCostCapAlerts(req.user!.clientId);
        if (moaCostCheck.pctUsed >= 90) {
          moaDowngraded = true;
          sendSSE({ type: "moa_progress", moaIndex: 0, moaTotal: 1, content: "Budget near limit — using standard mode instead of Deep Thinking" });
        }
      } catch (err) {
        console.error("[Conversations/MoA] Cost cap check failed, downgrading MoA (fail-safe):", err);
        moaDowngraded = true;
      }
    }

    let botResponseContent: string;
    let conductorStrategyId: number | undefined;
    let conductorSelection: Awaited<ReturnType<typeof selectStrategy>> | undefined;

    if (isMoA && !moaDowngraded) {
      const DEFAULT_MOA_COUNT = 5;
      const MAX_MOA_COUNT = 10;
      const MOA_COUNT = moaComplexity ? Math.min(moaComplexity, MAX_MOA_COUNT) : DEFAULT_MOA_COUNT;

      const agentVariants = Array.from({ length: MOA_COUNT }, (_, i) => ({
        name: `${bot.name} (perspective ${i + 1})`,
        systemPrompt: `${systemPrompt}${langInstruction}`,
      }));

      conductorSelection = await selectStrategy(
        streamSafeContent,
        agentVariants,
      );
      const selection = conductorSelection;

      sendSSE({
        type: "conductor_strategy",
        strategy: selection.strategy,
        rationale: selection.rationale,
        taskCategory: selection.taskCategory,
        content: `GalaxyMind — ${selection.strategy.replace(/_/g, " ")} selected: ${selection.rationale}`,
      });

      const strategyResult = await executeStrategy(selection.strategy, {
        taskDescription: streamSafeContent,
        userContent: streamSafeContent,
        agents: agentVariants,
        clientId: req.user!.clientId,
        botId: bot.id,
        conversationId: params.data.id,
        onProgress: (event) => sendSSE({ ...event, moaIndex: 0, moaTotal: MOA_COUNT } as AgenticEvent),
      });

      conductorStrategyId = await recordStrategyRun(
        selection,
        strategyResult.agentsUsed,
        strategyResult.durationMs,
        undefined,
        String(params.data.id),
        "conversation",
      );

      await recordRunTelemetry(conductorStrategyId, strategyResult.telemetry);

      recordScalingTelemetry({
        clientId: req.user!.clientId ?? null,
        sessionId: String(params.data.id),
        conductorStrategyId: conductorStrategyId >= 0 ? conductorStrategyId : null,
        taskCategory: selection.taskCategory,
        strategy: selection.strategy,
        fleetSize: strategyResult.agentsUsed.length || MOA_COUNT,
        modelVersion: "gpt-5.4",
        modelTier: deriveModelTier("gpt-5.4"),
        costLookup: {
          conversationId: params.data.id,
          since: new Date(Date.now() - strategyResult.durationMs),
        },
      }).catch(() => {});

      botResponseContent = strategyResult.content
        ?? "I have considered this from multiple angles. Let me provide my definitive perspective.";
    } else {
      const { finalContent, events } = await runAgenticLoop({
        model: "gpt-5.4",
        maxIterations: 10,
        maxTokens: 8192,
        systemPrompt,
        messages: [
          ...chatMessages,
          { role: "user" as const, content: streamSafeContent },
        ],
        context: {
          conversationId: params.data.id,
          botId: bot.id,
          botName: bot.name,
          clientId: req.user!.clientId,
          userId: req.user!.userId,
          isGuest: req.user!.role === "guest",
          guestSessionToken: (req as unknown as Record<string, unknown>).sessionID as string | undefined,
          depth: 0,
        },
        onEvent: (event) => {
          sendSSE(event);
        },
      });

      for (const event of events) {
        if (event.type === "tool_call") {
          await db.insert(messages).values({
            conversationId: params.data.id,
            role: "bot",
            content: `Using tool: ${event.toolName}`,
            senderName: bot.name,
            messageType: "tool_call",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input },
          });
        } else if (event.type === "tool_result") {
          await db.insert(messages).values({
            conversationId: params.data.id,
            role: "bot",
            content: `Tool result: ${event.toolName}`,
            senderName: bot.name,
            messageType: "tool_result",
            toolData: { toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output },
          });
        }
      }

      botResponseContent = finalContent || "I understand. Let me consider this from a strategic perspective.";
    }

    if (streamSlaEventId !== null) {
      resolveSlaResponse({ slaEventId: streamSlaEventId }).catch(() => {});
    }

    if (req.user!.clientId) {
      botResponseContent = await applyBrandVoiceGuardrails(req.user!.clientId, botResponseContent);
    }

    const conductorMeta =
      isMoA && !moaDowngraded && conductorStrategyId !== undefined && conductorSelection !== undefined
        ? buildConductorMeta(conductorStrategyId, conductorSelection)
        : undefined;

    await db.insert(messages).values({
      conversationId: params.data.id,
      role: "bot",
      content: botResponseContent,
      senderName: bot.name,
      messageType: "text",
      toolData: isMoA && !moaDowngraded
        ? { moa: true, conductor: conductorMeta ?? null }
        : undefined,
    });

    sendSSE({ type: "done", content: botResponseContent, conductor: conductorMeta ?? null });
  } catch (err) {
    sendSSE({ type: "error", content: err instanceof Error ? err.message : "Stream error" });
  } finally {
    res.end();
  }
});

export default router;
