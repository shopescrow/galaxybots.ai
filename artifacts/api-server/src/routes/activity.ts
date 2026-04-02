import { Router, type IRouter } from "express";
import {
  db,
  toolActivityLogTable,
  aeoScoresTable,
  bingolingoContentTable,
  mcpToolCallsTable,
  platformApiKeysTable,
  notificationsTable,
  workflowRunsTable,
  workflowsTable,
  clientsTable,
  pendingApprovalsTable,
  callLogsTable,
  receptionistConfigsTable,
  sessionOutcomesTable,
  prospectsTable,
  prospectOutreachLogTable,
} from "@workspace/db";
import { eq, and, desc, gte, inArray, sql } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import { broadcastSSE } from "../services/scheduler";
export { emitActivityEvent, type ActivityEventInput } from "../services/activity-events";

const router: IRouter = Router();

type ActivityEvent = {
  id: string;
  timestamp: string;
  source: "galaxybots" | "bingolingo" | "piratemonster" | "mcp" | "system";
  eventType: string;
  description: string;
  clientId: number | null;
  clientName?: string;
  severity: "info" | "warning" | "critical";
  link?: string;
  metadata?: unknown;
};

async function getAccessibleClientIds(user: { role: string; clientId: number }): Promise<number[]> {
  if (user.role === "owner") {
    const clients = await db.select({ id: clientsTable.id }).from(clientsTable);
    return clients.map((c) => c.id);
  }
  return [user.clientId];
}

router.get("/activity", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const platform = req.query.platform as string | undefined;
  const eventType = req.query.type as string | undefined;
  const filterClientId = req.query.clientId ? Number(req.query.clientId) : undefined;
  const severity = req.query.severity as string | undefined;
  const since = req.query.since ? new Date(req.query.since as string) : undefined;

  const accessibleIds = await getAccessibleClientIds(req.user!);
  const clientIds = filterClientId && accessibleIds.includes(filterClientId)
    ? [filterClientId]
    : accessibleIds;

  if (clientIds.length === 0) {
    res.json({ items: [], total: 0 });
    return;
  }

  const clientsData = await db
    .select({ id: clientsTable.id, companyName: clientsTable.companyName })
    .from(clientsTable)
    .where(inArray(clientsTable.id, clientIds));
  const clientNameMap = Object.fromEntries(clientsData.map((c) => [c.id, c.companyName]));

  const events: ActivityEvent[] = [];

  const shouldInclude = (src: string) => !platform || platform === src;

  if (shouldInclude("galaxybots") && (!eventType || eventType === "tool_call")) {
    const conds = [inArray(toolActivityLogTable.clientId, clientIds)];
    if (since) conds.push(gte(toolActivityLogTable.createdAt, since));
    const rows = await db
      .select()
      .from(toolActivityLogTable)
      .where(and(...conds))
      .orderBy(desc(toolActivityLogTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `tool-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "galaxybots",
        eventType: "tool_call",
        description: `${row.botName ?? "Bot"} used ${row.toolName}`,
        clientId: row.clientId,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: "info",
        link: "/bots",
        metadata: row.metadata,
      });
    }
  }

  if ((shouldInclude("piratemonster") || shouldInclude("galaxybots")) && (!eventType || eventType === "aeo_update")) {
    const conds = [inArray(aeoScoresTable.clientId, clientIds)];
    if (since) conds.push(gte(aeoScoresTable.scannedAt, since));
    const rows = await db
      .select()
      .from(aeoScoresTable)
      .where(and(...conds))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `aeo-${row.id}`,
        timestamp: row.scannedAt.toISOString(),
        source: "piratemonster",
        eventType: "aeo_update",
        description: `AEO score updated: ${row.overallScore} for ${row.sourceUrl ?? "unknown"}`,
        clientId: row.clientId,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: row.overallScore < 40 ? "critical" : row.overallScore < 60 ? "warning" : "info",
        link: "/analytics",
        metadata: { overallScore: row.overallScore, scanType: row.scanType },
      });
    }
  }

  if (shouldInclude("bingolingo") && (!eventType || eventType === "content_published")) {
    const conds = [inArray(bingolingoContentTable.clientId, clientIds)];
    if (since) conds.push(gte(bingolingoContentTable.createdAt, since));
    const rows = await db
      .select()
      .from(bingolingoContentTable)
      .where(and(...conds))
      .orderBy(desc(bingolingoContentTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `bingo-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "bingolingo",
        eventType: "content_published",
        description: `BingoLingo: ${row.status === "published" ? "Published" : "Created draft"} "${row.title}"`,
        clientId: row.clientId ?? null,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: "info",
        link: "/bingolingo",
        metadata: { contentType: row.type, status: row.status },
      });
    }
  }

  if (shouldInclude("mcp") && (!eventType || eventType === "mcp_call")) {
    const conds = [inArray(platformApiKeysTable.clientId, clientIds)];
    if (since) conds.push(gte(mcpToolCallsTable.calledAt, since));
    const rows = await db
      .select({
        id: mcpToolCallsTable.id,
        toolName: mcpToolCallsTable.toolName,
        responseStatus: mcpToolCallsTable.responseStatus,
        calledAt: mcpToolCallsTable.calledAt,
        clientId: platformApiKeysTable.clientId,
      })
      .from(mcpToolCallsTable)
      .innerJoin(platformApiKeysTable, eq(mcpToolCallsTable.partnerKeyId, platformApiKeysTable.id))
      .where(and(...conds))
      .orderBy(desc(mcpToolCallsTable.calledAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `mcp-${row.id}`,
        timestamp: row.calledAt.toISOString(),
        source: "mcp",
        eventType: "mcp_call",
        description: `MCP tool call: ${row.toolName}`,
        clientId: row.clientId ?? null,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: row.responseStatus === "error" ? "warning" : "info",
        link: "/developers",
        metadata: { toolName: row.toolName, status: row.responseStatus },
      });
    }
  }

  if (shouldInclude("system") && (!eventType || eventType === "notification")) {
    const conds = [inArray(notificationsTable.clientId, clientIds)];
    if (since) conds.push(gte(notificationsTable.createdAt, since));
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(and(...conds))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `notif-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "system",
        eventType: "notification",
        description: `${row.title}: ${row.body.substring(0, 100)}`,
        clientId: row.clientId ?? null,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: (row.severity as "info" | "warning" | "critical") ?? "info",
        link: row.link ?? undefined,
        metadata: row.metadata,
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "workflow_run")) {
    const conds = [inArray(workflowRunsTable.clientId, clientIds)];
    if (since) conds.push(gte(workflowRunsTable.createdAt, since));
    const rows = await db
      .select({
        run: workflowRunsTable,
        workflowName: workflowsTable.name,
      })
      .from(workflowRunsTable)
      .leftJoin(workflowsTable, eq(workflowRunsTable.workflowId, workflowsTable.id))
      .where(and(...conds))
      .orderBy(desc(workflowRunsTable.createdAt))
      .limit(limit);
    for (const { run, workflowName } of rows) {
      events.push({
        id: `workflow-run-${run.id}`,
        timestamp: run.createdAt.toISOString(),
        source: "galaxybots",
        eventType: "workflow_run",
        description: `Workflow "${workflowName ?? "Unknown"}" ${run.status === "done" ? "completed" : run.status === "failed" ? "failed" : "ran"}`,
        clientId: run.clientId,
        clientName: clientNameMap[run.clientId],
        severity: run.status === "failed" ? "critical" : "info",
        link: "/process-studio",
        metadata: { workflowId: run.workflowId, status: run.status, triggeredBy: run.triggeredBy },
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "approval")) {
    const conds = [inArray(pendingApprovalsTable.clientId, clientIds)];
    if (since) conds.push(gte(pendingApprovalsTable.createdAt, since));
    const rows = await db
      .select()
      .from(pendingApprovalsTable)
      .where(and(...conds))
      .orderBy(desc(pendingApprovalsTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `approval-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "galaxybots",
        eventType: "approval",
        description: `Approval ${row.status}: ${row.botName ?? "Bot"} requested ${row.toolName}`,
        clientId: row.clientId,
        clientName: clientNameMap[row.clientId],
        severity: row.status === "pending" ? "warning" : "info",
        link: "/command-center",
        metadata: { toolName: row.toolName, status: row.status },
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "call")) {
    const conds = [inArray(receptionistConfigsTable.clientId, clientIds)];
    if (since) conds.push(gte(callLogsTable.createdAt, since));
    const rows = await db
      .select({
        id: callLogsTable.id,
        status: callLogsTable.status,
        durationSeconds: callLogsTable.durationSeconds,
        twilioCallSid: callLogsTable.twilioCallSid,
        createdAt: callLogsTable.createdAt,
        clientId: receptionistConfigsTable.clientId,
      })
      .from(callLogsTable)
      .innerJoin(receptionistConfigsTable, eq(callLogsTable.configId, receptionistConfigsTable.id))
      .where(and(...conds))
      .orderBy(desc(callLogsTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `call-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "galaxybots",
        eventType: "call",
        description: `Call ${row.status === "completed" ? "completed" : "received"} — ${row.durationSeconds ?? 0}s`,
        clientId: row.clientId,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: "info",
        link: "/receptionist",
        metadata: { callSid: row.twilioCallSid, status: row.status, durationSeconds: row.durationSeconds },
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "session_outcome")) {
    const conds = [inArray(sessionOutcomesTable.clientId, clientIds)];
    if (since) conds.push(gte(sessionOutcomesTable.createdAt, since));
    const rows = await db
      .select()
      .from(sessionOutcomesTable)
      .where(and(...conds))
      .orderBy(desc(sessionOutcomesTable.createdAt))
      .limit(limit);
    for (const row of rows) {
      events.push({
        id: `session-${row.id}`,
        timestamp: row.createdAt.toISOString(),
        source: "galaxybots",
        eventType: "session_outcome",
        description: row.outcomeSummary ? row.outcomeSummary.substring(0, 120) : `Session completed — ${row.toolsExecutedTotal} tools used`,
        clientId: row.clientId ?? null,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: "info",
        link: "/bots",
        metadata: { sessionId: row.sessionId, toolsExecutedTotal: row.toolsExecutedTotal, estimatedHoursSaved: row.estimatedHoursSaved },
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "prospect")) {
    const conds = [inArray(prospectsTable.clientId, clientIds)];
    if (since) conds.push(gte(prospectsTable.updatedAt, since));
    const rows = await db
      .select()
      .from(prospectsTable)
      .where(and(...conds))
      .orderBy(desc(prospectsTable.updatedAt))
      .limit(limit);
    for (const row of rows) {
      const isQualified = row.status === "qualified";
      events.push({
        id: `prospect-${row.id}`,
        timestamp: row.updatedAt.toISOString(),
        source: "galaxybots",
        eventType: "prospect",
        description: `Prospect ${isQualified ? "qualified" : row.status}: ${row.companyName ?? "Unknown company"}`,
        clientId: row.clientId,
        clientName: row.clientId ? clientNameMap[row.clientId] : undefined,
        severity: isQualified ? "info" : row.status === "rejected" ? "warning" : "info",
        link: "/prospects",
        metadata: { companyName: row.companyName, status: row.status, confidenceScore: row.confidenceScore },
      });
    }
  }

  if (shouldInclude("galaxybots") && (!eventType || eventType === "prospect_outreach")) {
    const prospectsForClient = await db
      .select({ id: prospectsTable.id, clientId: prospectsTable.clientId, companyName: prospectsTable.companyName })
      .from(prospectsTable)
      .where(inArray(prospectsTable.clientId, clientIds));
    const prospectIds = prospectsForClient.map((p) => p.id);
    const prospectMap = Object.fromEntries(prospectsForClient.map((p) => [p.id, p]));
    if (prospectIds.length > 0) {
      const conds: ReturnType<typeof gte>[] = [];
      if (since) conds.push(gte(prospectOutreachLogTable.createdAt, since));
      const rows = await db
        .select()
        .from(prospectOutreachLogTable)
        .where(
          conds.length > 0
            ? and(inArray(prospectOutreachLogTable.prospectId, prospectIds), ...conds)
            : inArray(prospectOutreachLogTable.prospectId, prospectIds)
        )
        .orderBy(desc(prospectOutreachLogTable.createdAt))
        .limit(limit);
      for (const row of rows) {
        const prospect = prospectMap[row.prospectId];
        const cId = prospect?.clientId ?? null;
        events.push({
          id: `outreach-${row.id}`,
          timestamp: row.createdAt.toISOString(),
          source: "galaxybots",
          eventType: "prospect_outreach",
          description: `Outreach via ${row.channel} to ${prospect?.companyName ?? "prospect"}: ${row.subject ?? row.messageBody.substring(0, 80)}`,
          clientId: cId,
          clientName: cId ? clientNameMap[cId] : undefined,
          severity: row.deliveryStatus === "failed" ? "warning" : "info",
          link: "/prospects",
          metadata: { prospectId: row.prospectId, channel: row.channel, deliveryStatus: row.deliveryStatus },
        });
      }
    }
  }

  const filtered = severity
    ? events.filter((e) => e.severity === severity)
    : events;

  const sorted = filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const paginated = sorted.slice(0, limit);

  res.json({ items: paginated, total: sorted.length });
});

export default router;
