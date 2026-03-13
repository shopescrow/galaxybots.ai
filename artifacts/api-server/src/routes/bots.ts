import { Router, type IRouter } from "express";
import { db, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetBotParams, ListBotsResponse, GetBotResponse } from "@workspace/api-zod";
import { openai, batchProcessWithSSE } from "@workspace/integrations-openai-ai-server";

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

router.get("/bots", async (_req, res): Promise<void> => {
  const bots = await db.select().from(botsTable).orderBy(botsTable.department, botsTable.title);
  res.json(ListBotsResponse.parse(bots));
});

router.get("/bots/declarations", async (_req, res): Promise<void> => {
  const bots = await db.select().from(botsTable);
  const sorted = sortByDepartment(bots);
  const result = sorted.map((bot) => ({
    id: bot.id,
    name: bot.name,
    title: bot.title,
    department: bot.department,
    avatar: bot.avatar,
    declaration: bot.declaration,
  }));
  res.json(result);
});

router.post("/bots/generate-declarations", async (req, res): Promise<void> => {
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
    const allBots = await db.select().from(botsTable);
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
          model: "gpt-4o-mini",
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
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, params.data.id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotResponse.parse(bot));
});

export default router;
