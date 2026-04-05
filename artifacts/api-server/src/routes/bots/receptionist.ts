import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, receptionistConfigsTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendTestWebhook } from "../../services/clients/crm-adapter";
import { testElevenLabsAgent } from "../../services/bots/elevenlabs";

const router: IRouter = Router();

async function validateClientExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  let clientId = Number(req.params.clientId || req.body?.clientId || req.query?.clientId);

  if (!clientId || isNaN(clientId)) {
    const configId = Number(req.body?.configId || req.query?.configId || req.params?.configId);
    if (configId && !isNaN(configId)) {
      const [config] = await db
        .select({ clientId: receptionistConfigsTable.clientId })
        .from(receptionistConfigsTable)
        .where(eq(receptionistConfigsTable.id, configId));
      if (config) {
        clientId = config.clientId;
      }
    }
  }

  if (!clientId || isNaN(clientId)) {
    res.status(400).json({ error: "Valid clientId or configId is required" });
    return;
  }
  const [client] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  next();
}

router.get("/receptionist/config/:clientId", validateClientExists, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const [config] = await db
    .select()
    .from(receptionistConfigsTable)
    .where(eq(receptionistConfigsTable.clientId, clientId));

  if (!config) {
    res.json(null);
    return;
  }

  res.json(config);
});

router.post("/receptionist/config", validateClientExists, async (req, res): Promise<void> => {
  const {
    clientId,
    elevenlabsAgentId,
    twilioPhoneNumber,
    businessName,
    businessHoursJson,
    knowledgeBasePrompt,
    notificationEmail,
    crmType,
    crmWebhookUrl,
    crmFieldMapJson,
    isActive,
  } = req.body;

  if (!clientId) {
    res.status(400).json({ error: "clientId is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(receptionistConfigsTable)
    .where(eq(receptionistConfigsTable.clientId, Number(clientId)));

  if (existing) {
    res.status(409).json({ error: "Config already exists. Use PUT to update." });
    return;
  }

  try {
    const [created] = await db
      .insert(receptionistConfigsTable)
      .values({
        clientId: Number(clientId),
        elevenlabsAgentId: elevenlabsAgentId || null,
        twilioPhoneNumber: twilioPhoneNumber || null,
        businessName: businessName || null,
        businessHoursJson: businessHoursJson || null,
        knowledgeBasePrompt: knowledgeBasePrompt || null,
        notificationEmail: notificationEmail || null,
        crmType: crmType || "none",
        crmWebhookUrl: crmWebhookUrl || null,
        crmFieldMapJson: crmFieldMapJson || null,
        isActive: isActive !== false,
      })
      .returning();

    res.status(201).json(created);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === "23503") {
      res.status(400).json({ error: "Invalid clientId — client does not exist" });
      return;
    }
    res.status(500).json({ error: "Failed to create config" });
  }
});

router.put("/receptionist/config/:clientId", validateClientExists, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const allowedFields = [
    "elevenlabsAgentId", "twilioPhoneNumber", "businessName",
    "businessHoursJson", "knowledgeBasePrompt", "notificationEmail",
    "crmType", "crmWebhookUrl", "crmFieldMapJson", "isActive",
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  const [updated] = await db
    .update(receptionistConfigsTable)
    .set(updateData)
    .where(eq(receptionistConfigsTable.clientId, clientId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Config not found" });
    return;
  }

  res.json(updated);
});

router.post("/receptionist/config/test", async (req, res): Promise<void> => {
  const { elevenlabsAgentId, crmType, crmWebhookUrl } = req.body;
  const results: Record<string, unknown> = {};

  if (elevenlabsAgentId) {
    results.elevenlabs = await testElevenLabsAgent(elevenlabsAgentId);
  }

  if (crmType === "custom_webhook" && crmWebhookUrl) {
    results.webhook = await sendTestWebhook(crmWebhookUrl);
  }

  res.json(results);
});

export default router;
