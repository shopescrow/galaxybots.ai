import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, intelligenceBriefsTable, briefingSettingsTable, clientsTable } from "@workspace/db";
import { eq, desc, isNull } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import {
  generateBriefForClient,
  deliverBriefToEmail,
  deliverBriefToSlack,
  getBriefingSettingsForClient,
  ensureBriefingSettingsForClient,
  getOrCreateGlobalBriefingSettings,
} from "../../services/bots/briefing";

const router: IRouter = Router();

function isPlatformAdmin(req: Express.Request): boolean {
  return req.user?.bypassPayment === true;
}

function assertClientAccess(req: Express.Request, clientId: number): boolean {
  return isPlatformAdmin(req) || req.user?.clientId === clientId;
}

const UpdateBriefingSettingsBody = z.object({
  emailEnabled: z.boolean().optional(),
  emailRecipients: z.array(z.string().email()).optional(),
  slackEnabled: z.boolean().optional(),
  slackChannel: z.string().optional(),
  deliveryHour: z.number().min(0).max(23).optional(),
  deliveryMinute: z.number().min(0).max(59).optional(),
  timezone: z.string().optional(),
});

function buildSettingsUpdates(data: z.infer<typeof UpdateBriefingSettingsBody>): Record<string, unknown> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.emailEnabled !== undefined) updates.emailEnabled = data.emailEnabled ? 1 : 0;
  if (data.emailRecipients !== undefined) updates.emailRecipients = data.emailRecipients;
  if (data.slackEnabled !== undefined) updates.slackEnabled = data.slackEnabled ? 1 : 0;
  if (data.slackChannel !== undefined) updates.slackChannel = data.slackChannel;
  if (data.deliveryHour !== undefined) updates.deliveryHour = data.deliveryHour;
  if (data.deliveryMinute !== undefined) updates.deliveryMinute = data.deliveryMinute;
  if (data.timezone !== undefined) updates.timezone = data.timezone;
  return updates;
}

router.get("/briefs", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 30, 60);
  const offset = Number(req.query.offset) || 0;

  let clientId: number;
  if (req.query.clientId) {
    clientId = Number(req.query.clientId);
    if (isNaN(clientId) || !assertClientAccess(req, clientId)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  } else {
    clientId = req.user!.clientId;
  }

  const briefs = await db
    .select()
    .from(intelligenceBriefsTable)
    .where(eq(intelligenceBriefsTable.clientId, clientId))
    .orderBy(desc(intelligenceBriefsTable.generatedAt))
    .limit(limit)
    .offset(offset);

  res.json(briefs);
});

router.post("/briefs/generate", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const body = z.object({
    clientId: z.number().optional(),
    briefType: z.enum(["morning", "weekly"]).optional().default("morning"),
  }).safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const clientId = body.data.clientId ?? req.user!.clientId;
  if (!assertClientAccess(req, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const brief = await generateBriefForClient(clientId, body.data.briefType);

    const settings = await getBriefingSettingsForClient(clientId);
    const [client] = await db.select({ contactEmail: clientsTable.contactEmail }).from(clientsTable).where(eq(clientsTable.id, clientId));
    const recipients = [
      ...(client ? [client.contactEmail] : []),
      ...(settings.emailRecipients ?? []),
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];

    const deliveryResults: { email?: boolean; slack?: boolean } = {};

    if (settings.emailEnabled && recipients.length > 0) {
      deliveryResults.email = await deliverBriefToEmail(brief, recipients);
    }

    if (settings.slackEnabled && settings.slackChannel) {
      deliveryResults.slack = await deliverBriefToSlack(brief, clientId, settings.slackChannel);
    }

    res.json({ brief, deliveryResults });
  } catch (err) {
    console.error("[briefs] Generation error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Brief generation failed" });
  }
});

router.get("/briefs/settings/global", requireRole("owner"), async (req, res): Promise<void> => {
  if (!isPlatformAdmin(req)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const settings = await getOrCreateGlobalBriefingSettings();
  res.json(settings);
});

router.patch("/briefs/settings/global", requireRole("owner"), async (req, res): Promise<void> => {
  if (!isPlatformAdmin(req)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = UpdateBriefingSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await getOrCreateGlobalBriefingSettings();

  const [updated] = await db
    .update(briefingSettingsTable)
    .set(buildSettingsUpdates(body.data))
    .where(isNull(briefingSettingsTable.clientId))
    .returning();

  res.json(updated);
});

router.get("/briefs/settings/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId) || !assertClientAccess(req, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const settings = await getBriefingSettingsForClient(clientId);
  res.json(settings);
});

router.patch("/briefs/settings/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId) || !assertClientAccess(req, clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const body = UpdateBriefingSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await ensureBriefingSettingsForClient(clientId);

  const [updated] = await db
    .update(briefingSettingsTable)
    .set(buildSettingsUpdates(body.data))
    .where(eq(briefingSettingsTable.clientId, clientId))
    .returning();

  res.json(updated);
});

router.get("/briefs/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const briefId = Number(req.params.id);
  if (isNaN(briefId)) {
    res.status(400).json({ error: "Invalid brief ID" });
    return;
  }

  const [brief] = await db
    .select()
    .from(intelligenceBriefsTable)
    .where(eq(intelligenceBriefsTable.id, briefId));

  if (!brief) {
    res.status(404).json({ error: "Brief not found" });
    return;
  }

  if (!assertClientAccess(req, brief.clientId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  res.json(brief);
});

export default router;
