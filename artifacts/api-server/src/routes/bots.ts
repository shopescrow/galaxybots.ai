import { Router, type IRouter } from "express";
import { db, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetBotParams, ListBotsResponse, GetBotResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bots", async (_req, res): Promise<void> => {
  const bots = await db.select().from(botsTable).orderBy(botsTable.department, botsTable.title);
  res.json(ListBotsResponse.parse(bots));
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
