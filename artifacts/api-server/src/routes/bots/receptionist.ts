import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac } from "node:crypto";
import { db, receptionistConfigsTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendTestWebhook } from "../../services/clients/crm-adapter";
import { testElevenLabsAgent } from "../../services/bots/elevenlabs";
import { requireTenantAccess } from "../../middleware/tenant";
import { sendParamError } from "../../utils/validation";

const router: IRouter = Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

function requireCredentials(_req: Request, res: Response, next: NextFunction): void {
  const missing: string[] = [];
  if (!ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");
  if (!TWILIO_ACCOUNT_SID) missing.push("TWILIO_ACCOUNT_SID");
  if (!TWILIO_AUTH_TOKEN) missing.push("TWILIO_AUTH_TOKEN");
  if (!TWILIO_PHONE_NUMBER) missing.push("TWILIO_PHONE_NUMBER");
  if (missing.length > 0) {
    res.status(503).json({
      error: "AI Receptionist service unavailable",
      message: `Missing required credentials: ${missing.join(", ")}`,
      missingCredentials: missing,
    });
    return;
  }
  next();
}

function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (!TWILIO_AUTH_TOKEN) {
    res.status(503).json({ error: "Twilio auth token not configured" });
    return;
  }

  const signature = req.headers["x-twilio-signature"] as string | undefined;
  if (!signature) {
    res.status(403).json({ error: "Missing X-Twilio-Signature header" });
    return;
  }

  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  const url = `${proto}://${host}${req.originalUrl}`;
  const params = (req.body || {}) as Record<string, string>;
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(key => `${key}${params[key]}`).join("");
  const data = url + paramString;

  const computed = createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");

  if (computed !== signature) {
    if (process.env.NODE_ENV === "development") {
      next();
      return;
    }
    res.status(403).json({ error: "Invalid Twilio signature" });
    return;
  }
  next();
}

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

router.get("/receptionist/config/:clientId", requireTenantAccess("clientId"), validateClientExists, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
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

router.post("/receptionist/config", requireTenantAccess("clientId"), validateClientExists, async (req, res): Promise<void> => {
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
      sendParamError(res, "Invalid clientId — client does not exist");
      return;
    }
    res.status(500).json({ error: "Failed to create config" });
  }
});

router.put("/receptionist/config/:clientId", requireTenantAccess("clientId"), validateClientExists, async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    sendParamError(res, "Invalid client ID");
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
