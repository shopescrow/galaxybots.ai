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
import { runAgenticLoop, type AgenticEvent } from "../tools";
import { buildMemoryContext } from "../services/memory";

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

  const systemPrompt = `You are ${bot.name}, the ${bot.title} at GalaxyBots.ai — a world-class AI corporate director.

Your personality: ${bot.personality}
Your department: ${bot.department}

Your key responsibilities:
${bot.responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}
${memoryContext}
You speak with the authority, expertise, and professionalism of a Fortune 500 executive. Provide strategic, insightful, and actionable advice from your professional perspective. Be direct, confident, and brilliant. You are speaking to the CEO or a client. Always stay in character.

You have access to tools that allow you to search the web, read/write shared state, query platform data, and delegate tasks to other bots. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.${langInstruction}`;

  const chatMessages = history.slice(0, -1)
    .filter((m) => m.messageType === "text" || !m.messageType)
    .map(m => ({
      role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant" | "system",
      content: m.content,
    }));

  const { finalContent, events } = await runAgenticLoop({
    model: "gpt-4o",
    maxIterations: 10,
    maxTokens: 8192,
    systemPrompt,
    messages: [
      ...chatMessages,
      { role: "user" as const, content: body.data.content },
    ],
    context: {
      conversationId: params.data.id,
      botId: bot.id,
      botName: bot.name,
      clientId: req.user!.clientId,
      userId: req.user!.userId,
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

  const botResponseContent = finalContent || "I understand. Let me consider this from a strategic perspective.";

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

    const systemPrompt = `You are ${bot.name}, the ${bot.title} at GalaxyBots.ai — a world-class AI corporate director.

Your personality: ${bot.personality}
Your department: ${bot.department}

Your key responsibilities:
${bot.responsibilities.map((r, i) => `${i + 1}. ${r}`).join("\n")}

You speak with the authority, expertise, and professionalism of a Fortune 500 executive. Provide strategic, insightful, and actionable advice from your professional perspective. Be direct, confident, and brilliant. You are speaking to the CEO or a client. Always stay in character.

You have access to tools that allow you to search the web, read/write shared state, query platform data, and delegate tasks to other bots. Use tools when they would genuinely help you provide better answers. Don't use tools if the question can be answered from your expertise alone.${langInstruction}`;

    const chatMessages = history.slice(0, -1)
      .filter((m) => m.messageType === "text" || !m.messageType)
      .map(m => ({
        role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant" | "system",
        content: m.content,
      }));

    const { finalContent, events } = await runAgenticLoop({
      model: "gpt-4o",
      maxIterations: 10,
      maxTokens: 8192,
      systemPrompt,
      messages: [
        ...chatMessages,
        { role: "user" as const, content: body.data.content },
      ],
      context: {
        conversationId: params.data.id,
        botId: bot.id,
        botName: bot.name,
        clientId: req.user!.clientId,
        userId: req.user!.userId,
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

    const botResponseContent = finalContent || "I understand. Let me consider this from a strategic perspective.";

    await db.insert(messages).values({
      conversationId: params.data.id,
      role: "bot",
      content: botResponseContent,
      senderName: bot.name,
      messageType: "text",
    });

    sendSSE({ type: "done", content: botResponseContent });
  } catch (err) {
    sendSSE({ type: "error", content: err instanceof Error ? err.message : "Stream error" });
  } finally {
    res.end();
  }
});

export default router;
