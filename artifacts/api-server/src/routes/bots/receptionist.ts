import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac } from "node:crypto";
import { db, receptionistConfigsTable, callLogsTable, callImprovementRunsTable, toolActivityLogTable, clientsTable, botsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql, type InferSelectModel } from "drizzle-orm";
import { syncCallToCRM, sendTestWebhook } from "../../services/clients/crm-adapter";
import { shouldRunImprovement, runImprovementPass, storeCallTranscriptMemory } from "../../services/bots/receptionist-improvement";
import { generateCallDebrief } from "./voice-intelligence";
import nodemailer from "nodemailer";
import { checkWorkflowTriggers } from "../../services/missions/workflow-engine";
import { requireTenantAccess } from "../../middleware/tenant";
import { sendParamError } from "../../utils/validation";

type ReceptionistConfig = InferSelectModel<typeof receptionistConfigsTable>;
type CallLog = InferSelectModel<typeof callLogsTable>;

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

router.post("/receptionist/incoming-call", requireCredentials, validateTwilioSignature, async (req, res): Promise<void> => {
  const { CallSid, From, To, CallStatus } = req.body;

  if (!To) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, we could not identify the destination number. Please try again later.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(twiml);
    return;
  }

  const [config] = await db
    .select()
    .from(receptionistConfigsTable)
    .where(and(
      eq(receptionistConfigsTable.twilioPhoneNumber, To),
      eq(receptionistConfigsTable.isActive, true)
    ));

  if (!config) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, the AI receptionist is not currently configured for this number. Please try again later.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(twiml);
    return;
  }

  await db.insert(callLogsTable).values({
    configId: config.id,
    twilioCallSid: CallSid,
    direction: "inbound",
    fromNumber: From,
    toNumber: To,
    status: CallStatus || "ringing",
  });

  const recordingCallbackUrl = `${getBaseUrl(req)}/api/receptionist/recording-status`;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && CallSid) {
    try {
      const authHeader = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${CallSid}/Recordings.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            RecordingStatusCallback: recordingCallbackUrl,
            RecordingStatusCallbackMethod: "POST",
            RecordingChannels: "dual",
          }).toString(),
        }
      );
    } catch (err) {
      console.error("[AI Receptionist] Failed to start call recording via REST API:", err);
    }
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${config.elevenlabsAgentId}" />
  </Connect>
  <Say>Thank you for calling. Goodbye.</Say>
</Response>`;

  res.type("text/xml").send(twiml);
});

router.post("/receptionist/handle-call-stream", requireCredentials, validateTwilioSignature, async (_req, res): Promise<void> => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="60"/>
  <Redirect>/api/receptionist/handle-call-stream</Redirect>
</Response>`;
  res.type("text/xml").send(twiml);
});

router.post("/receptionist/call-status", requireCredentials, validateTwilioSignature, async (req, res): Promise<void> => {
  const { CallSid, CallStatus, CallDuration } = req.body;

  if (!CallSid) {
    res.status(400).json({ error: "CallSid required" });
    return;
  }

  const [callLog] = await db
    .select()
    .from(callLogsTable)
    .where(eq(callLogsTable.twilioCallSid, CallSid));

  if (!callLog) {
    res.status(404).json({ error: "Call log not found" });
    return;
  }

  await db
    .update(callLogsTable)
    .set({
      status: CallStatus || callLog.status,
      durationSeconds: CallDuration ? Number(CallDuration) : callLog.durationSeconds,
    })
    .where(eq(callLogsTable.id, callLog.id));

  const alreadyCompleted = callLog.status === "completed";

  if (CallStatus === "completed" && !alreadyCompleted) {
    const [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.id, callLog.configId));

    if (config) {
      let transcriptText: string | null = null;
      let transcriptSummary: string | null = null;

      if (config.elevenlabsAgentId && ELEVENLABS_API_KEY) {
        try {
          const convResult = await fetchElevenLabsTranscript(config.elevenlabsAgentId, CallSid);
          transcriptText = convResult.transcript;
          transcriptSummary = convResult.summary;
          if (transcriptText) {
            await db
              .update(callLogsTable)
              .set({ transcriptText, transcriptSummary })
              .where(eq(callLogsTable.id, callLog.id));

            const veraBotId = await getVeraBotId();
            if (veraBotId) {
              storeCallTranscriptMemory({
                botId: veraBotId,
                configId: callLog.configId,
                callLogId: callLog.id,
                transcript: transcriptText,
                summary: transcriptSummary || `Call transcript from ${callLog.direction} call`,
              }).catch(() => {});
            }

            generateCallDebrief(
              callLog.id,
              config.clientId,
              transcriptText,
              callLog.fromNumber || undefined
            ).catch(err => {
              console.error("[AI Receptionist] Auto-debrief generation failed:", err);
            });
          }
        } catch (err) {
          console.error("[AI Receptionist] Transcript fetch failed:", err);
        }
      }

      const [updatedLog] = await db
        .select()
        .from(callLogsTable)
        .where(eq(callLogsTable.id, callLog.id));

      try {
        const crmResult = await syncCallToCRM(updatedLog, config);
        await db
          .update(callLogsTable)
          .set({
            crmSynced: crmResult.success,
            crmSyncError: crmResult.error || null,
          })
          .where(eq(callLogsTable.id, callLog.id));
      } catch (err) {
        await db
          .update(callLogsTable)
          .set({
            crmSynced: false,
            crmSyncError: err instanceof Error ? err.message : "CRM sync failed",
          })
          .where(eq(callLogsTable.id, callLog.id));
      }

      if (config.notificationEmail) {
        const [logForEmail] = await db
          .select()
          .from(callLogsTable)
          .where(eq(callLogsTable.id, callLog.id));

        if (!logForEmail.transcriptText && config.elevenlabsAgentId && ELEVENLABS_API_KEY) {
          setTimeout(async () => {
            try {
              const retryResult = await fetchElevenLabsTranscript(config.elevenlabsAgentId!, CallSid);
              if (retryResult.transcript) {
                await db
                  .update(callLogsTable)
                  .set({
                    transcriptText: retryResult.transcript,
                    transcriptSummary: retryResult.summary,
                  })
                  .where(eq(callLogsTable.id, callLog.id));
              }
              const [refreshedLog] = await db
                .select()
                .from(callLogsTable)
                .where(eq(callLogsTable.id, callLog.id));
              await sendPostCallEmail(refreshedLog, config);
            } catch (err) {
              console.error("[AI Receptionist] Deferred email send failed:", err);
            }
          }, 30000);
        } else {
          sendPostCallEmail(logForEmail, config).catch(err => {
            console.error("[AI Receptionist] Email send failed:", err);
          });
        }
      }

      await db
        .update(receptionistConfigsTable)
        .set({
          improvementCallCount: sql`${receptionistConfigsTable.improvementCallCount} + 1`,
        })
        .where(eq(receptionistConfigsTable.id, config.id));

      const [refreshedConfig] = await db
        .select()
        .from(receptionistConfigsTable)
        .where(eq(receptionistConfigsTable.id, config.id));

      if (refreshedConfig && await shouldRunImprovement(refreshedConfig)) {
        runImprovementPass(config.id).catch(err => {
          console.error("[AI Receptionist] Improvement pass failed:", err);
        });
      }

      checkWorkflowTriggers("twilio_call_ended", {
        callSid: CallSid,
        callLogId: callLog.id,
        configId: callLog.configId,
        clientId: config.clientId,
        durationSeconds: Number(req.body.CallDuration || 0),
        status: "completed",
      }, config.clientId).catch((e) => console.error("[workflow-trigger] twilio_call_ended:", e));
    }
  }

  res.json({ success: true });
});

router.post("/receptionist/recording-status", requireCredentials, validateTwilioSignature, async (req, res): Promise<void> => {
  const { CallSid, RecordingUrl, RecordingStatus } = req.body;

  if (!CallSid || !RecordingUrl) {
    res.status(400).json({ error: "CallSid and RecordingUrl required" });
    return;
  }

  if (RecordingStatus === "completed") {
    await db
      .update(callLogsTable)
      .set({ twilioRecordingUrl: RecordingUrl })
      .where(eq(callLogsTable.twilioCallSid, CallSid));
  }

  res.json({ success: true });
});

router.post("/receptionist/outbound-call", requireCredentials, requireTenantAccess("clientId"), validateClientExists, async (req, res): Promise<void> => {
  const { phoneNumber, configId, contextNotes } = req.body;

  if (!phoneNumber) {
    res.status(400).json({ error: "phoneNumber is required" });
    return;
  }

  const { clientId } = req.body;
  let config;
  if (configId) {
    [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.id, Number(configId)));
  } else if (clientId) {
    [config] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(and(
        eq(receptionistConfigsTable.clientId, Number(clientId)),
        eq(receptionistConfigsTable.isActive, true)
      ));
  } else {
    res.status(400).json({ error: "configId or clientId is required" });
    return;
  }

  if (!config) {
    res.status(404).json({ error: "No active receptionist config found" });
    return;
  }

  if (!config.elevenlabsAgentId) {
    res.status(400).json({ error: "ElevenLabs Agent ID not configured" });
    return;
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: config.elevenlabsAgentId,
        agent_phone_number_id: TWILIO_PHONE_NUMBER,
        to_number: phoneNumber,
        ...(contextNotes ? { custom_llm_extra_body: { context: contextNotes } } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({ error: `ElevenLabs API error: ${errText}` });
      return;
    }

    const data = await response.json() as { call_sid?: string };

    const [callLog] = await db
      .insert(callLogsTable)
      .values({
        configId: config.id,
        twilioCallSid: data.call_sid || null,
        direction: "outbound",
        fromNumber: TWILIO_PHONE_NUMBER || null,
        toNumber: phoneNumber,
        status: "initiated",
      })
      .returning();

    res.json({ success: true, callLog });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to initiate outbound call" });
  }
});

router.get("/receptionist/call-logs", requireTenantAccess("clientId"), validateClientExists, async (req, res): Promise<void> => {
  const {
    configId,
    clientId,
    direction,
    crmSynced,
    startDate,
    endDate,
    page = "1",
    limit = "20",
  } = req.query;

  if (!configId && !clientId) {
    res.status(400).json({ error: "configId or clientId query parameter is required for tenant scoping" });
    return;
  }

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pageNum - 1) * limitNum;

  let query = db.select().from(callLogsTable).$dynamic();

  const conditions = [];

  if (configId) {
    conditions.push(eq(callLogsTable.configId, Number(configId)));
  } else if (clientId) {
    const [tenantConfig] = await db
      .select()
      .from(receptionistConfigsTable)
      .where(eq(receptionistConfigsTable.clientId, Number(clientId)));
    if (!tenantConfig) {
      res.json({ data: [], pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 } });
      return;
    }
    conditions.push(eq(callLogsTable.configId, tenantConfig.id));
  }
  if (direction) {
    conditions.push(eq(callLogsTable.direction, String(direction)));
  }
  if (crmSynced !== undefined) {
    conditions.push(eq(callLogsTable.crmSynced, crmSynced === "true"));
  }
  if (startDate) {
    conditions.push(gte(callLogsTable.createdAt, new Date(String(startDate))));
  }
  if (endDate) {
    conditions.push(lte(callLogsTable.createdAt, new Date(String(endDate))));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const logs = await query
    .orderBy(desc(callLogsTable.createdAt))
    .limit(limitNum)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({
    data: logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countResult?.count || 0,
      totalPages: Math.ceil((countResult?.count || 0) / limitNum),
    },
  });
});

router.get("/receptionist/improvement-history/:configId", async (req, res): Promise<void> => {
  const configId = Number(req.params.configId);
  if (isNaN(configId)) {
    sendParamError(res, "Invalid config ID");
    return;
  }

  const [config] = await db.select({ id: receptionistConfigsTable.id, clientId: receptionistConfigsTable.clientId }).from(receptionistConfigsTable).where(eq(receptionistConfigsTable.id, configId));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }

  const runs = await db
    .select()
    .from(callImprovementRunsTable)
    .where(eq(callImprovementRunsTable.configId, configId))
    .orderBy(desc(callImprovementRunsTable.createdAt))
    .limit(10);

  res.json(runs);
});

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

async function sendPostCallEmail(callLog: CallLog, config: ReceptionistConfig): Promise<void> {
  const email = config.notificationEmail;
  if (!email) return;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[AI Receptionist] SMTP not configured, skipping post-call email");
    return;
  }

  const summary = callLog.transcriptSummary || "No summary available.";
  const transcript = callLog.transcriptText || "No transcript available.";
  const duration = callLog.durationSeconds ? `${Math.floor(callLog.durationSeconds / 60)}m ${callLog.durationSeconds % 60}s` : "Unknown";

  const subject = `[${config.businessName || "AI Receptionist"}] ${callLog.direction === "inbound" ? "Inbound" : "Outbound"} Call Summary — ${callLog.fromNumber || "Unknown"}`;

  const body = `Call Summary
═══════════════════════════════════

Direction: ${callLog.direction === "inbound" ? "Inbound" : "Outbound"}
Caller: ${callLog.fromNumber || "Unknown"}
Called: ${callLog.toNumber || "Unknown"}
Duration: ${duration}
Timestamp: ${callLog.createdAt ? new Date(callLog.createdAt).toLocaleString() : "Unknown"}
Status: ${callLog.status}

Summary
───────────────────────────────────
${summary}

Full Transcript
───────────────────────────────────
${transcript}

${callLog.twilioRecordingUrl ? `Recording: ${callLog.twilioRecordingUrl}` : "Recording not yet available."}
`;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: smtpFrom || smtpUser,
    to: email,
    subject,
    text: body,
  });

  await db
    .update(callLogsTable)
    .set({ emailSent: true })
    .where(eq(callLogsTable.id, callLog.id));
}

export default router;
