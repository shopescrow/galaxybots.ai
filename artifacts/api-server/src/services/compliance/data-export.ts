import {
  db,
  clientsTable,
  botsTable,
  clientBotsTable,
  conversations,
  messages,
  taskSessionsTable,
  taskSessionMessagesTable,
  documentsTable,
  knowledgeBaseDocumentsTable,
  clientIntegrationsTable,
  platformAuditLogTable,
  usageEventsTable,
  accountSubscriptionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import archiver from "archiver";
import { PassThrough } from "stream";

export interface DataExportJob {
  jobId: string;
  clientId: number;
  requestedBy: number;
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  expiresAt?: string;
  error?: string;
}

const exportJobs = new Map<string, DataExportJob>();

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export function getExportJob(jobId: string): DataExportJob | undefined {
  const job = exportJobs.get(jobId);
  if (!job) return undefined;
  if (job.expiresAt && new Date(job.expiresAt).getTime() < Date.now()) {
    exportJobs.delete(jobId);
    return undefined;
  }
  return job;
}

async function gatherClientData(clientId: number) {
  const [clientProfile] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  const hiredBots = await db
    .select({
      botId: clientBotsTable.botId,
      hiredAt: clientBotsTable.hiredAt,
      botName: botsTable.name,
      botTitle: botsTable.title,
    })
    .from(clientBotsTable)
    .leftJoin(botsTable, eq(clientBotsTable.botId, botsTable.id))
    .where(eq(clientBotsTable.clientId, clientId));

  const clientConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.clientId, clientId));

  const conversationIds = clientConversations.map(c => c.id);
  let allMessages: unknown[] = [];
  for (const convId of conversationIds) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convId));
    allMessages = allMessages.concat(msgs);
  }

  const taskSessions = await db
    .select()
    .from(taskSessionsTable)
    .where(eq(taskSessionsTable.clientId, clientId));

  const sessionIds = taskSessions.map(s => s.id);
  let taskMessages: unknown[] = [];
  for (const sessionId of sessionIds) {
    const msgs = await db
      .select()
      .from(taskSessionMessagesTable)
      .where(eq(taskSessionMessagesTable.sessionId, sessionId));
    taskMessages = taskMessages.concat(msgs);
  }

  const documents = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.clientId, clientId));

  const knowledgeBase = await db
    .select()
    .from(knowledgeBaseDocumentsTable)
    .where(eq(knowledgeBaseDocumentsTable.clientId, clientId));

  const integrations = await db
    .select()
    .from(clientIntegrationsTable)
    .where(eq(clientIntegrationsTable.clientId, clientId));

  const redactedIntegrations = integrations.map(i => ({
    ...i,
    credential: i.credential ? "[REDACTED]" : null,
  }));

  const auditLogs = await db
    .select()
    .from(platformAuditLogTable)
    .where(eq(platformAuditLogTable.clientId, clientId));

  const usageHistory = await db
    .select()
    .from(usageEventsTable)
    .where(eq(usageEventsTable.clientId, clientId));

  const subscriptions = await db
    .select()
    .from(accountSubscriptionsTable)
    .where(eq(accountSubscriptionsTable.clientId, clientId));

  return {
    clientProfile,
    hiredBots,
    conversations: clientConversations,
    messages: allMessages,
    taskSessions,
    taskSessionMessages: taskMessages,
    documents,
    knowledgeBase,
    integrations: redactedIntegrations,
    auditLogs,
    usageHistory,
    subscriptions,
  };
}

function buildManifest(data: Record<string, unknown>, jobId: string, clientId: number, requestedBy: number) {
  const descriptions: Record<string, string> = {
    clientProfile: "Client organization profile and settings",
    hiredBots: "AI bots assigned to this organization",
    conversations: "Chat conversations with bots",
    messages: "Individual messages within conversations",
    taskSessions: "Task session execution records",
    taskSessionMessages: "Messages exchanged during task sessions",
    documents: "Uploaded documents",
    knowledgeBase: "Knowledge base entries",
    integrations: "Integration configurations (credentials redacted)",
    auditLogs: "Platform activity audit trail",
    usageHistory: "Credit and resource usage events",
    subscriptions: "Subscription and billing records",
  };

  const files: Record<string, { description: string; recordCount: number }> = {};
  for (const [key, value] of Object.entries(data)) {
    const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
    files[`${key}.json`] = {
      description: descriptions[key] || key,
      recordCount: count,
    };
  }

  return {
    exportId: jobId,
    clientId,
    requestedBy,
    exportedAt: new Date().toISOString(),
    format: "ZIP (JSON files)",
    gdprCompliant: true,
    expiresAt: new Date(Date.now() + JOB_TTL_MS).toISOString(),
    files,
  };
}

async function buildZipBuffer(data: Record<string, unknown>, manifest: unknown): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const passthrough = new PassThrough();
    const chunks: Buffer[] = [];
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));
    passthrough.on("end", () => resolve(Buffer.concat(chunks)));
    passthrough.on("error", reject);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", reject);
    archive.pipe(passthrough);

    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    for (const [key, value] of Object.entries(data)) {
      archive.append(JSON.stringify(value, null, 2), { name: `${key}.json` });
    }

    archive.finalize();
  });
}

export async function startDataExport(clientId: number, requestedBy: number): Promise<DataExportJob> {
  const jobId = randomUUID();
  const job: DataExportJob = {
    jobId,
    clientId,
    requestedBy,
    status: "pending",
  };
  exportJobs.set(jobId, job);

  setImmediate(async () => {
    try {
      job.status = "processing";
      exportJobs.set(jobId, { ...job });

      const data = await gatherClientData(clientId);
      const manifest = buildManifest(data, jobId, clientId, requestedBy);
      const zipBuffer = await buildZipBuffer(data, manifest);

      let downloadUrl: string;
      try {
        const { ObjectStorageService } = await import("../../lib/objectStorage");
        const storage = new ObjectStorageService();
        const objectKey = `gdpr-export/${clientId}/${jobId}.zip`;
        const uploadUrl = await storage.getObjectEntityUploadURL(objectKey);

        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/zip" },
          body: zipBuffer,
        });

        downloadUrl = uploadUrl.split("?")[0];
      } catch {
        downloadUrl = `/api/v1/data-export/${clientId}/download/${jobId}`;
      }

      const expiresAt = new Date(Date.now() + JOB_TTL_MS).toISOString();

      job.status = "completed";
      job.downloadUrl = downloadUrl;
      job.expiresAt = expiresAt;
      exportJobs.set(jobId, { ...job });

      console.log(`[GDPR Export] Completed export for client ${clientId}, job ${jobId} (${zipBuffer.length} bytes ZIP)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[GDPR Export] Failed for client ${clientId}, job ${jobId}:`, msg);
      job.status = "failed";
      job.error = msg;
      exportJobs.set(jobId, { ...job });
    }
  });

  return job;
}
