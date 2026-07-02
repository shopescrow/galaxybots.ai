import { createHmac } from "node:crypto";
import { db, clientIntegrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decryptCredential } from "../../utils/credential-encryption";
import type { CallLog, ReceptionistConfig } from "@workspace/db";
import { assertSafeUrl, safeFetch } from "../../lib/ssrf-guard";

async function getClientCredential(clientId: number, service: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.clientId, clientId),
      eq(clientIntegrationsTable.service, service),
      eq(clientIntegrationsTable.status, "connected")
    ));
  if (!row) return null;
  return decryptCredential(row.credential);
}

function buildCallPayload(callLog: CallLog, config: ReceptionistConfig) {
  return {
    callSid: callLog.twilioCallSid,
    direction: callLog.direction,
    fromNumber: callLog.fromNumber,
    toNumber: callLog.toNumber,
    status: callLog.status,
    durationSeconds: callLog.durationSeconds,
    transcript: callLog.transcriptText,
    summary: callLog.transcriptSummary,
    recordingUrl: callLog.twilioRecordingUrl,
    businessName: config.businessName,
    timestamp: callLog.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function syncToHubSpot(callLog: CallLog, config: ReceptionistConfig): Promise<{ success: boolean; error?: string }> {
  const credential = await getClientCredential(config.clientId, "hubspot");
  if (!credential) {
    return { success: false, error: "No HubSpot credential configured" };
  }

  const body = {
    properties: {
      hs_timestamp: callLog.createdAt?.toISOString() ?? new Date().toISOString(),
      hs_call_title: `${config.businessName || "AI Receptionist"} - ${callLog.direction} call`,
      hs_call_body: callLog.transcriptSummary || callLog.transcriptText || "No transcript available",
      hs_call_duration: String((callLog.durationSeconds || 0) * 1000),
      hs_call_from_number: callLog.fromNumber || "",
      hs_call_to_number: callLog.toNumber || "",
      hs_call_direction: callLog.direction === "inbound" ? "INBOUND" : "OUTBOUND",
      hs_call_status: callLog.status === "completed" ? "COMPLETED" : "NO_ANSWER",
      hs_call_recording_url: callLog.twilioRecordingUrl || "",
    },
  };

  const response = await fetch("https://api.hubapi.com/crm/v3/objects/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `HubSpot API error ${response.status}: ${errText}` };
  }

  return { success: true };
}

async function syncToSalesforce(callLog: CallLog, config: ReceptionistConfig): Promise<{ success: boolean; error?: string }> {
  const credential = await getClientCredential(config.clientId, "salesforce");
  if (!credential) {
    return { success: false, error: "No Salesforce credential configured. Add Salesforce credentials via the CRM Integration tab." };
  }

  let sfConfig: { client_id: string; client_secret: string; login_url?: string };
  try {
    sfConfig = JSON.parse(credential);
  } catch {
    return { success: false, error: "Invalid Salesforce credential format in credential store" };
  }

  if (!sfConfig.client_id || !sfConfig.client_secret) {
    return { success: false, error: "Salesforce credential missing client_id or client_secret" };
  }

  const sfLoginUrl = sfConfig.login_url || "https://login.salesforce.com";
  const tokenRes = await fetch(`${sfLoginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: sfConfig.client_id,
      client_secret: sfConfig.client_secret,
    }),
  });
  if (!tokenRes.ok) {
    return { success: false, error: `Salesforce OAuth failed: ${tokenRes.status}` };
  }
  const tokenData = await tokenRes.json() as { access_token: string; instance_url: string };
  const accessToken = tokenData.access_token;
  const instanceUrl = tokenData.instance_url;

  const taskBody = {
    Subject: `${config.businessName || "AI Receptionist"} - ${callLog.direction} call from ${callLog.fromNumber || "unknown"}`,
    Description: callLog.transcriptSummary || callLog.transcriptText || "No transcript",
    Status: "Completed",
    Priority: "Normal",
    TaskSubtype: "Call",
    CallDurationInSeconds: callLog.durationSeconds || 0,
    CallType: callLog.direction === "inbound" ? "Inbound" : "Outbound",
  };

  const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(taskBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    return { success: false, error: `Salesforce API error ${response.status}: ${errText}` };
  }

  return { success: true };
}

async function syncToWebhook(callLog: CallLog, config: ReceptionistConfig): Promise<{ success: boolean; error?: string }> {
  if (!config.crmWebhookUrl) {
    return { success: false, error: "No webhook URL configured" };
  }

  try {
    const parsed = new URL(config.crmWebhookUrl);
    if (parsed.protocol !== "https:") {
      return { success: false, error: "Invalid webhook URL: Webhook URL must use HTTPS" };
    }
    await assertSafeUrl(config.crmWebhookUrl);
  } catch (err) {
    return { success: false, error: `Invalid webhook URL: ${err instanceof Error ? err.message : "URL validation failed"}` };
  }

  const payload = buildCallPayload(callLog, config);
  const payloadStr = JSON.stringify(payload);

  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return { success: false, error: "WEBHOOK_SIGNING_SECRET environment variable is not configured" };
  }
  const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

  const response = await safeFetch(config.crmWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GalaxyBots-Signature": signature,
    },
    body: payloadStr,
  });

  if (!response.ok) {
    return { success: false, error: `Webhook error ${response.status}` };
  }

  return { success: true };
}

export async function syncCallToCRM(
  callLog: CallLog,
  config: ReceptionistConfig
): Promise<{ success: boolean; error?: string }> {
  switch (config.crmType) {
    case "hubspot":
      return syncToHubSpot(callLog, config);
    case "salesforce":
      return syncToSalesforce(callLog, config);
    case "custom_webhook":
      return syncToWebhook(callLog, config);
    case "none":
    default:
      return { success: true };
  }
}

export async function sendTestWebhook(webhookUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== "https:") {
      return { success: false, error: "Invalid webhook URL: Webhook URL must use HTTPS" };
    }
    await assertSafeUrl(webhookUrl);
  } catch (err) {
    return { success: false, error: `Invalid webhook URL: ${err instanceof Error ? err.message : "URL validation failed"}` };
  }

  const testPayload = {
    test: true,
    source: "galaxybots-receptionist",
    timestamp: new Date().toISOString(),
    callSid: "TEST_CALL_SID",
    direction: "inbound",
    fromNumber: "+15551234567",
    toNumber: "+15559876543",
    status: "completed",
    durationSeconds: 120,
    transcript: "This is a test transcript.",
    summary: "Test call summary.",
  };

  const payloadStr = JSON.stringify(testPayload);
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return { success: false, error: "WEBHOOK_SIGNING_SECRET environment variable is not configured. Set it before using webhook CRM integration." };
  }
  const signature = createHmac("sha256", secret).update(payloadStr).digest("hex");

  try {
    const response = await safeFetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GalaxyBots-Signature": signature,
      },
      body: payloadStr,
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Webhook request failed" };
  }
}
