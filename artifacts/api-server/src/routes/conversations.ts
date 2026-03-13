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

const router: IRouter = Router();

router.get("/conversations", async (req, res): Promise<void> => {
  const clientId = req.query.clientId ? Number(req.query.clientId) : null;
  const botId = req.query.botId ? Number(req.query.botId) : null;

  let query = db.select().from(conversations);
  const conditions = [];
  if (clientId !== null) conditions.push(eq(conversations.clientId, clientId));
  if (botId !== null) conditions.push(eq(conversations.botId, botId));

  const results = conditions.length
    ? await db.select().from(conversations).where(and(...conditions)).orderBy(conversations.updatedAt)
    : await db.select().from(conversations).orderBy(conversations.updatedAt);

  res.json(ListConversationsResponse.parse(results));
});

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db.insert(conversations).values({
    clientId: parsed.data.clientId ?? null,
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

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
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

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
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

You speak with the authority, expertise, and professionalism of a Fortune 500 executive. Provide strategic, insightful, and actionable advice from your professional perspective. Be direct, confident, and brilliant. You are speaking to the CEO or a client. Always stay in character.${langInstruction}`;

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...history.slice(0, -1).map(m => ({
      role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant" | "system",
      content: m.content,
    })),
    { role: "user" as const, content: body.data.content },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: chatMessages,
  });

  const botResponseContent = completion.choices[0]?.message?.content ?? "I understand. Let me consider this from a strategic perspective.";

  const [botMsg] = await db.insert(messages).values({
    conversationId: params.data.id,
    role: "bot",
    content: botResponseContent,
    senderName: bot.name,
  }).returning();

  res.status(201).json({
    userMessage: userMsg,
    botResponse: botMsg,
  });
});

export default router;
