import { Router, type IRouter } from "express";
import { db, clientsTable, clientBotsTable, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateClientBody,
  GetClientParams,
  GetClientBotsParams,
  HireBotParams,
  HireBotBody,
  ListClientsResponse,
  GetClientResponse,
  GetClientBotsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (_req, res): Promise<void> => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.createdAt);
  res.json(ListClientsResponse.parse(clients));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db.insert(clientsTable).values(parsed.data).returning();
  res.status(201).json(client);
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse(client));
});

router.get("/clients/:id/bots", async (req, res): Promise<void> => {
  const params = GetClientBotsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const hiredBots = await db
    .select({ bot: botsTable })
    .from(clientBotsTable)
    .innerJoin(botsTable, eq(clientBotsTable.botId, botsTable.id))
    .where(eq(clientBotsTable.clientId, params.data.id));

  res.json(GetClientBotsResponse.parse(hiredBots.map(r => r.bot)));
});

router.post("/clients/:id/bots", async (req, res): Promise<void> => {
  const params = HireBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = HireBotBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, body.data.botId));
  if (!bot) {
    res.status(400).json({ error: "Bot not found" });
    return;
  }

  const [clientBot] = await db.insert(clientBotsTable).values({
    clientId: params.data.id,
    botId: body.data.botId,
    status: "active",
  }).returning();

  res.status(201).json(clientBot);
});

export default router;
