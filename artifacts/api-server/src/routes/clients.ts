import { Router, type IRouter } from "express";
import { db, clientsTable, clientBotsTable, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetClientBotsParams,
  HireBotBody,
  GetClientResponse,
  GetClientBotsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

router.get("/clients", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json([client]);
});

router.post("/clients", requireRole("owner"), async (req, res): Promise<void> => {
  res.status(403).json({ error: "Clients are created during registration" });
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || id !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse(client));
});

router.get("/clients/:id/bots", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || id !== req.user!.clientId) {
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
  if (isNaN(id) || id !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = HireBotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, body.data.botId));
  if (!bot) {
    res.status(400).json({ error: "Bot not found" });
    return;
  }

  const [clientBot] = await db.insert(clientBotsTable).values({
    clientId: id,
    botId: body.data.botId,
    status: "active",
  }).returning();

  res.status(201).json(clientBot);
});

export default router;
