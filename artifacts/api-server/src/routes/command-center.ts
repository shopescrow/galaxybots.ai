import { Router, type IRouter } from "express";
import {
  db,
  toolActivityLogTable,
  platformAuditLogTable,
  pendingApprovalsTable,
  backgroundReportsTable,
  botAssignmentsTable,
  clientsTable,
  taskSessionsTable,
  botsTable,
  clientHealthScoresTable,
} from "@workspace/db";
import { eq, desc, and, inArray, sql, or } from "drizzle-orm";
import { requireRole } from "../middleware/auth";

const router: IRouter = Router();

async function getAccessibleClientIds(user: { role: string; clientId: number }): Promise<number[]> {
  if (user.role === "owner") {
    const clients = await db.select({ id: clientsTable.id }).from(clientsTable);
    return clients.map((c) => c.id);
  }
  return [user.clientId];
}

router.get("/command-center/activity", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const clientIds = await getAccessibleClientIds(req.user!);

  if (clientIds.length === 0) {
    res.json({ items: [], total: 0 });
    return;
  }

  const fetchSize = offset + limit;

  const [toolLogs, auditLogs, toolCount, auditCount] = await Promise.all([
    db
      .select({
        id: toolActivityLogTable.id,
        type: sql<string>`'tool_call'`,
        clientId: toolActivityLogTable.clientId,
        action: toolActivityLogTable.toolName,
        resource: sql<string>`'tool'`,
        botName: toolActivityLogTable.botName,
        metadata: toolActivityLogTable.metadata,
        createdAt: toolActivityLogTable.createdAt,
      })
      .from(toolActivityLogTable)
      .where(inArray(toolActivityLogTable.clientId, clientIds))
      .orderBy(desc(toolActivityLogTable.createdAt))
      .limit(fetchSize),
    db
      .select({
        id: platformAuditLogTable.id,
        type: sql<string>`'audit'`,
        clientId: platformAuditLogTable.clientId,
        action: platformAuditLogTable.action,
        resource: platformAuditLogTable.resource,
        botName: sql<string>`null`,
        metadata: platformAuditLogTable.metadata,
        createdAt: platformAuditLogTable.createdAt,
      })
      .from(platformAuditLogTable)
      .where(inArray(platformAuditLogTable.clientId, clientIds))
      .orderBy(desc(platformAuditLogTable.createdAt))
      .limit(fetchSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(toolActivityLogTable)
      .where(inArray(toolActivityLogTable.clientId, clientIds)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(platformAuditLogTable)
      .where(inArray(platformAuditLogTable.clientId, clientIds)),
  ]);

  const total = (toolCount[0]?.count || 0) + (auditCount[0]?.count || 0);

  const combined = [...toolLogs, ...auditLogs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(offset, offset + limit);

  res.json({ items: combined, total });
});

router.get("/command-center/approvals", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const status = (req.query.status as string) || "pending";
  const clientIds = await getAccessibleClientIds(req.user!);

  if (clientIds.length === 0) {
    res.json([]);
    return;
  }

  const approvals = await db
    .select()
    .from(pendingApprovalsTable)
    .where(
      and(
        inArray(pendingApprovalsTable.clientId, clientIds),
        eq(pendingApprovalsTable.status, status)
      )
    )
    .orderBy(desc(pendingApprovalsTable.createdAt));

  res.json(approvals);
});

router.get("/command-center/alerts", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const clientIds = await getAccessibleClientIds(req.user!);

  if (clientIds.length === 0) {
    res.json([]);
    return;
  }

  const alerts = await db
    .select({
      id: backgroundReportsTable.id,
      assignmentId: backgroundReportsTable.assignmentId,
      botId: backgroundReportsTable.botId,
      clientId: backgroundReportsTable.clientId,
      summary: backgroundReportsTable.summary,
      runStatus: backgroundReportsTable.runStatus,
      createdAt: backgroundReportsTable.createdAt,
    })
    .from(backgroundReportsTable)
    .where(
      and(
        inArray(backgroundReportsTable.clientId, clientIds),
        or(
          eq(backgroundReportsTable.runStatus, "failed"),
          eq(backgroundReportsTable.runStatus, "partial")
        )
      )
    )
    .orderBy(desc(backgroundReportsTable.createdAt))
    .limit(limit);

  const botIds = [...new Set(alerts.map((a) => a.botId))];
  let botsMap: Record<number, string> = {};
  if (botIds.length > 0) {
    const bots = await db
      .select({ id: botsTable.id, name: botsTable.name })
      .from(botsTable)
      .where(inArray(botsTable.id, botIds));
    botsMap = Object.fromEntries(bots.map((b) => [b.id, b.name]));
  }

  const enriched = alerts.map((a) => ({
    ...a,
    botName: botsMap[a.botId] || `Bot #${a.botId}`,
  }));

  res.json(enriched);
});

router.get("/command-center/companies", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientIds = await getAccessibleClientIds(req.user!);

  if (clientIds.length === 0) {
    res.json([]);
    return;
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(inArray(clientsTable.id, clientIds));

  const [activeSessions, lastToolActions, nextRuns, healthScores] = await Promise.all([
    db
      .select({
        clientId: taskSessionsTable.clientId,
        count: sql<number>`count(*)::int`,
      })
      .from(taskSessionsTable)
      .where(
        and(
          inArray(taskSessionsTable.clientId, clientIds),
          eq(taskSessionsTable.status, "active")
        )
      )
      .groupBy(taskSessionsTable.clientId),
    db.execute(sql`
      SELECT DISTINCT ON (client_id)
        client_id AS "clientId",
        created_at AS "lastAction",
        tool_name AS "lastToolName"
      FROM tool_activity_log
      WHERE client_id = ANY(${clientIds})
      ORDER BY client_id, created_at DESC
    `),
    db
      .select({
        clientId: botAssignmentsTable.clientId,
        schedule: botAssignmentsTable.schedule,
        lastRunAt: botAssignmentsTable.lastRunAt,
        objective: botAssignmentsTable.objective,
      })
      .from(botAssignmentsTable)
      .where(
        and(
          inArray(botAssignmentsTable.clientId, clientIds),
          eq(botAssignmentsTable.isActive, "true")
        )
      ),
    db.execute(sql`
      SELECT DISTINCT ON (client_id)
        client_id AS "clientId",
        score,
        trend,
        tag,
        recommended_action AS "recommendedAction",
        computed_at AS "computedAt"
      FROM client_health_scores
      WHERE client_id = ANY(${clientIds})
      ORDER BY client_id, computed_at DESC
    `),
  ]);

  const sessionMap = Object.fromEntries(activeSessions.map((s) => [s.clientId, s.count]));

  const actionMap: Record<number, { lastAction: string; toolName: string }> = {};
  for (const row of lastToolActions.rows as Array<{ clientId: number; lastAction: string; lastToolName: string }>) {
    actionMap[row.clientId] = { lastAction: row.lastAction, toolName: row.lastToolName };
  }

  const SCHEDULE_MS: Record<string, number> = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
  };

  const healthMap: Record<number, { score: number; trend: string; tag: string; recommendedAction: string | null }> = {};
  for (const row of healthScores.rows as Array<{ clientId: number; score: number; trend: string; tag: string; recommendedAction: string | null }>) {
    healthMap[row.clientId] = { score: row.score, trend: row.trend, tag: row.tag, recommendedAction: row.recommendedAction };
  }

  const nextRunMap: Record<number, { nextRun: string; objective: string } | null> = {};
  for (const run of nextRuns) {
    const cid = run.clientId;
    if (cid === null) continue;
    const interval = SCHEDULE_MS[run.schedule] ?? SCHEDULE_MS.daily;
    const lastRun = run.lastRunAt ? new Date(run.lastRunAt).getTime() : Date.now();
    const nextRunTime = new Date(lastRun + interval).toISOString();
    if (!nextRunMap[cid] || nextRunTime < nextRunMap[cid]!.nextRun) {
      nextRunMap[cid] = { nextRun: nextRunTime, objective: run.objective };
    }
  }

  const cards = clients.map((client) => ({
    id: client.id,
    companyName: client.companyName,
    status: client.status,
    plan: client.plan,
    activeSessions: sessionMap[client.id] || 0,
    lastBotAction: actionMap[client.id]?.lastAction || null,
    lastToolName: actionMap[client.id]?.toolName || null,
    nextScheduledRun: nextRunMap[client.id]?.nextRun || null,
    nextRunObjective: nextRunMap[client.id]?.objective || null,
    healthScore: healthMap[client.id]?.score ?? null,
    healthTag: healthMap[client.id]?.tag ?? null,
    healthTrend: healthMap[client.id]?.trend ?? null,
  }));

  res.json(cards);
});

export default router;
