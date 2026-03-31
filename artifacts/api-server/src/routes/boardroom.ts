import { Router, type IRouter } from "express";
import { db, boardroomMessagesTable, botsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import { PostBoardroomMessageBody, GetBoardroomMessagesResponse } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { llmRateLimit } from "../middleware/rate-limit";

const router: IRouter = Router();

const BOARDROOM_DIRECTORS = [1, 2, 3, 4, 5];

function generateEncodedMessage(englishContent: string, botTitle: string): string {
  const prefix = botTitle.split(" ").map(w => w[0]).join("").toUpperCase();
  const compressed = englishContent
    .replace(/\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 80);
  const encoded = Buffer.from(compressed).toString("base64").substring(0, 40);
  return `[${prefix}::${encoded}]`;
}

router.get("/boardroom/messages", async (req, res): Promise<void> => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const msgs = await db
    .select()
    .from(boardroomMessagesTable)
    .where(eq(boardroomMessagesTable.clientId, req.user!.clientId))
    .orderBy(desc(boardroomMessagesTable.createdAt))
    .limit(limit);

  res.json(GetBoardroomMessagesResponse.parse(msgs.reverse()));
});

router.post("/boardroom/messages", llmRateLimit, async (req, res): Promise<void> => {
  const body = PostBoardroomMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [ceoMsg] = await db.insert(boardroomMessagesTable).values({
    clientId: req.user!.clientId,
    role: "ceo",
    contentEncoded: `[CEO::${Buffer.from(body.data.content.substring(0, 40)).toString("base64")}]`,
    contentEnglish: body.data.content,
    botName: body.data.senderName,
    botTitle: "CEO / Architect",
    topic: body.data.content.substring(0, 50),
  }).returning();

  const allBots = await db.select().from(botsTable).limit(8);
  if (allBots.length === 0) {
    res.status(201).json([ceoMsg]);
    return;
  }

  const selectedBots = allBots.sort(() => Math.random() - 0.5).slice(0, 4);
  const responses: typeof boardroomMessagesTable.$inferSelect[] = [ceoMsg];

  for (const bot of selectedBots) {
    const boardSystemPrompt = `You are ${bot.name}, ${bot.title} in the GalaxyBots.ai board of directors.
Personality: ${bot.personality}
Department: ${bot.department}

The CEO has raised a topic. Respond with a brief, professional boardroom perspective (2-3 sentences max). Be concise, strategic, and speak from your domain expertise. Address the room, not just the CEO.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: boardSystemPrompt },
        { role: "user", content: `CEO ${body.data.senderName} says: ${body.data.content}\n\nGive your boardroom perspective.` },
      ],
    });

    const englishContent = completion.choices[0]?.message?.content ?? "Noted. I will incorporate this into my department's strategy.";
    const encodedContent = generateEncodedMessage(englishContent, bot.title);

    const [botMsg] = await db.insert(boardroomMessagesTable).values({
      clientId: req.user!.clientId,
      botId: bot.id,
      botName: bot.name,
      botTitle: bot.title,
      role: "bot",
      contentEncoded: encodedContent,
      contentEnglish: englishContent,
      topic: body.data.content.substring(0, 50),
    }).returning();

    responses.push(botMsg);
  }

  res.status(201).json(responses);
});

export default router;
