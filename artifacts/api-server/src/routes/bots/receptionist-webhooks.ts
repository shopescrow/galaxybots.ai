import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac } from "node:crypto";
import { db, receptionistConfigsTable, callLogsTable, clientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { initiateOutboundCall } from "../../services/bots/elevenlabs";
import { processCompletedCall } from "../../services/bots/post-call";

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

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

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
      processCompletedCall(callLog, config, CallSid).catch(err => {
        console.error("[AI Receptionist] Post-call processing failed:", err);
      });
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

router.post("/receptionist/outbound-call", requireCredentials, validateClientExists, async (req, res): Promise<void> => {
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
    const result = await initiateOutboundCall(config.elevenlabsAgentId, phoneNumber, contextNotes);
    if (!result.success) {
      res.status(result.statusCode || 500).json({ error: result.error });
      return;
    }

    const [callLog] = await db
      .insert(callLogsTable)
      .values({
        configId: config.id,
        twilioCallSid: result.callSid || null,
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

export default router;
