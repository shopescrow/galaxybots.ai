import {
  db,
  taskSessionsTable,
  taskSessionBotsTable,
  employeeLearningEventsTable,
} from "@workspace/db";
import { eq, and, gte, ne, isNotNull, notInArray, sql } from "drizzle-orm";
import { runEmployeeProfileUpdate, refreshEmployeeProfileFromEvents, computeOrgBaseline } from "../../gaa/employee-learning";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastOrgBaselineRun = 0;

export async function runEmployeeProfileUpdateCycle(): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const recentSessions = await db
    .select({
      id: taskSessionsTable.id,
      clientId: taskSessionsTable.clientId,
      userId: taskSessionsTable.userId,
    })
    .from(taskSessionsTable)
    .where(
      and(
        gte(taskSessionsTable.updatedAt, cutoff),
        ne(taskSessionsTable.status, "active"),
        isNotNull(taskSessionsTable.userId),
      ),
    );

  for (const session of recentSessions) {
    if (!session.userId || !session.clientId) continue;
    try {
      await processSessionLearning(session.id, session.clientId, session.userId);
    } catch (err) {
      console.warn(
        `[employee-profile-update] session ${session.id} failed (non-fatal):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await processConversationEvents(cutoff);

  const now = Date.now();
  if (now - lastOrgBaselineRun >= ONE_WEEK_MS) {
    lastOrgBaselineRun = now;
    await runOrgBaselineUpdate();
  }
}

async function processSessionLearning(sessionId: number, clientId: number, userId: number): Promise<void> {
  const botRows = await db
    .select({ botId: taskSessionBotsTable.botId })
    .from(taskSessionBotsTable)
    .where(eq(taskSessionBotsTable.sessionId, sessionId));

  const botIds = botRows.map((r) => r.botId);
  if (botIds.length === 0) return;

  for (const botId of botIds) {
    await runEmployeeProfileUpdate({
      sessionId,
      userId,
      botId,
      clientId,
    }).catch((err) => {
      console.warn(
        `[employee-profile-update] update failed for user ${userId} bot ${botId}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }
}

async function processConversationEvents(cutoff: Date): Promise<void> {
  const recentConversationPairs = await db
    .selectDistinct({
      userId: employeeLearningEventsTable.userId,
      botId: employeeLearningEventsTable.botId,
      clientId: employeeLearningEventsTable.clientId,
    })
    .from(employeeLearningEventsTable)
    .where(
      and(
        gte(employeeLearningEventsTable.createdAt, cutoff),
        sql`${employeeLearningEventsTable.taskSessionId} < 0`,
      ),
    );

  for (const pair of recentConversationPairs) {
    if (!pair.clientId) continue;
    await refreshEmployeeProfileFromEvents({
      userId: pair.userId,
      botId: pair.botId,
      clientId: pair.clientId,
    }).catch((err) => {
      console.warn(
        `[employee-profile-update] conversation refresh failed for user ${pair.userId} bot ${pair.botId}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }
}

async function runOrgBaselineUpdate(): Promise<void> {
  console.log("[employee-profile-update] computing org behavioral baselines...");
  const clients = await db
    .select({ id: taskSessionsTable.clientId })
    .from(taskSessionsTable)
    .groupBy(taskSessionsTable.clientId);

  for (const row of clients) {
    if (!row.id) continue;
    await computeOrgBaseline(row.id).catch((err) => {
      console.warn(
        `[employee-profile-update] org baseline failed for client ${row.id}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }
}
