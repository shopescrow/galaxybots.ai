import {
  db,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  guestSessionsTable,
} from "@workspace/db";
import { eq, inArray, and, gt, desc } from "drizzle-orm";

export async function getSessionWithBots(sessionId: number) {
  const rows = await db
    .select({
      session: taskSessionsTable,
      bot: botsTable,
    })
    .from(taskSessionsTable)
    .leftJoin(
      taskSessionBotsTable,
      eq(taskSessionsTable.id, taskSessionBotsTable.sessionId),
    )
    .leftJoin(botsTable, eq(taskSessionBotsTable.botId, botsTable.id))
    .where(eq(taskSessionsTable.id, sessionId));

  if (rows.length === 0) return null;

  const session = rows[0].session;
  const teamBots = rows
    .filter(r => r.bot !== null)
    .map(r => r.bot!);

  return { ...session, teamBots };
}

export async function getSessionsWithBotsBatch(sessionIds: number[]) {
  if (sessionIds.length === 0) return [];

  const rows = await db
    .select({
      session: taskSessionsTable,
      bot: botsTable,
    })
    .from(taskSessionsTable)
    .leftJoin(
      taskSessionBotsTable,
      eq(taskSessionsTable.id, taskSessionBotsTable.sessionId),
    )
    .leftJoin(botsTable, eq(taskSessionBotsTable.botId, botsTable.id))
    .where(inArray(taskSessionsTable.id, sessionIds));

  const sessionsMap = new Map<number, typeof taskSessionsTable.$inferSelect>();
  const botsBySession = new Map<number, (typeof botsTable.$inferSelect)[]>();

  for (const row of rows) {
    const sid = row.session.id;
    if (!sessionsMap.has(sid)) {
      sessionsMap.set(sid, row.session);
      botsBySession.set(sid, []);
    }
    if (row.bot) {
      botsBySession.get(sid)!.push(row.bot);
    }
  }

  return Array.from(sessionsMap.entries()).map(([sid, session]) => ({
    ...session,
    teamBots: botsBySession.get(sid) || [],
  }));
}

export async function getTeamBotsForSession(sessionId: number): Promise<(typeof botsTable.$inferSelect)[]> {
  const rows = await db
    .select({ bot: botsTable })
    .from(taskSessionBotsTable)
    .innerJoin(botsTable, eq(taskSessionBotsTable.botId, botsTable.id))
    .where(eq(taskSessionBotsTable.sessionId, sessionId));

  return rows.map(r => r.bot);
}

export async function getSessionsByClient(clientId: number) {
  const rows = await db
    .select({
      session: taskSessionsTable,
      bot: botsTable,
    })
    .from(taskSessionsTable)
    .leftJoin(
      taskSessionBotsTable,
      eq(taskSessionsTable.id, taskSessionBotsTable.sessionId),
    )
    .leftJoin(botsTable, eq(taskSessionBotsTable.botId, botsTable.id))
    .where(eq(taskSessionsTable.clientId, clientId))
    .orderBy(desc(taskSessionsTable.createdAt));

  if (rows.length === 0) return [];

  const sessionsMap = new Map<number, typeof taskSessionsTable.$inferSelect>();
  const botsBySession = new Map<number, (typeof botsTable.$inferSelect)[]>();
  const sessionOrder: number[] = [];

  for (const row of rows) {
    const sid = row.session.id;
    if (!sessionsMap.has(sid)) {
      sessionsMap.set(sid, row.session);
      botsBySession.set(sid, []);
      sessionOrder.push(sid);
    }
    if (row.bot) {
      botsBySession.get(sid)!.push(row.bot);
    }
  }

  return sessionOrder.map(sid => ({
    ...sessionsMap.get(sid)!,
    teamBots: botsBySession.get(sid) || [],
  }));
}

export async function verifyGuestAccess(req: Express.Request, taskSessionId: number): Promise<boolean> {
  if (req.user?.role !== "guest" || !req.user.guestSessionId) return true;
  const [gs] = await db
    .select()
    .from(guestSessionsTable)
    .where(
      and(
        eq(guestSessionsTable.id, req.user.guestSessionId),
        eq(guestSessionsTable.taskSessionId, taskSessionId),
        eq(guestSessionsTable.status, "active"),
        gt(guestSessionsTable.expiresAt, new Date())
      )
    );
  return !!gs;
}
