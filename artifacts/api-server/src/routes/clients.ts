import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, clientsTable, clientBotsTable, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetClientBotsParams,
  HireBotBody,
  GetClientResponse,
  GetClientBotsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middleware/auth";

const UpdateClientBody = z.object({
  websiteUrl: z.string().nullish(),
  industry: z.string().nullish(),
  servicesList: z.array(z.string()).nullish(),
  targetMarket: z.string().nullish(),
  businessContext: z.string().nullish(),
}).refine(data => Object.values(data).some(v => v !== undefined), {
  message: "At least one field must be provided",
});

const router: IRouter = Router();

function sanitizeClient(client: typeof clientsTable.$inferSelect) {
  const { webhookSecret, ...safe } = client;
  return safe;
}

function isPlatformAdmin(req: Express.Request): boolean {
  return req.user?.bypassPayment === true;
}

router.get("/clients", async (req, res): Promise<void> => {
  if (isPlatformAdmin(req)) {
    const allClients = await db.select().from(clientsTable);
    res.json(allClients.map(sanitizeClient));
  } else {
    const clientId = req.user!.clientId;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json([sanitizeClient(client)]);
  }
});

router.post("/clients", requireRole("owner"), async (req, res): Promise<void> => {
  res.status(403).json({ error: "Clients are created during registration" });
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse(sanitizeClient(client)));
});

router.patch("/clients/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = UpdateClientBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.websiteUrl !== undefined) updates.websiteUrl = body.data.websiteUrl;
  if (body.data.industry !== undefined) updates.industry = body.data.industry;
  if (body.data.servicesList !== undefined) updates.servicesList = body.data.servicesList;
  if (body.data.targetMarket !== undefined) updates.targetMarket = body.data.targetMarket;
  if (body.data.businessContext !== undefined) updates.businessContext = body.data.businessContext;

  const [updated] = await db
    .update(clientsTable)
    .set(updates)
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(sanitizeClient(updated));
});

router.get("/clients/:id/bots", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
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
  if (isNaN(id) || (!isPlatformAdmin(req) && id !== req.user!.clientId)) {
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
