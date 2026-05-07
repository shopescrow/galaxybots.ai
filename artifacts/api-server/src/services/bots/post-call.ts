import { db, callLogsTable, receptionistConfigsTable, botsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { syncCallToCRM } from "../clients/crm-adapter";
import { shouldRunImprovement, runImprovementPass, storeCallTranscriptMemory } from "./receptionist-improvement";
import { generateCallDebrief } from "./call-debrief";
import { fetchElevenLabsTranscript } from "./elevenlabs";
import { checkWorkflowTriggers } from "../missions/workflow-engine";
import type { CallLog, ReceptionistConfig } from "@workspace/db";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

async function getVeraBotId(): Promise<number | null> {
  const [bot] = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(eq(botsTable.addonType, "receptionist"));
  return bot?.id ?? null;
}

export async function sendPostCallEmail(callLog: CallLog, config: ReceptionistConfig): Promise<void> {
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

export async function processCompletedCall(callLog: CallLog, config: ReceptionistConfig, callSid: string): Promise<void> {
  let transcriptText: string | null = null;
  let transcriptSummary: string | null = null;

  if (config.elevenlabsAgentId && ELEVENLABS_API_KEY) {
    try {
      const convResult = await fetchElevenLabsTranscript(config.elevenlabsAgentId, callSid);
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
          const retryResult = await fetchElevenLabsTranscript(config.elevenlabsAgentId!, callSid);
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
    callSid,
    callLogId: callLog.id,
    configId: callLog.configId,
    clientId: config.clientId,
    durationSeconds: callLog.durationSeconds || 0,
    status: "completed",
  }, config.clientId).catch((e) => console.error("[workflow-trigger] twilio_call_ended:", e));
}
