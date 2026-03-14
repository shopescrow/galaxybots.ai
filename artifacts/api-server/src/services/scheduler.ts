import {
  db,
  pool,
  botAssignmentsTable,
  backgroundReportsTable,
  botsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateWeeklyBriefing } from "./roi";

const SCHEDULER_LOCK_ID = 999999;

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

let sseClients: Array<{ id: string; clientId: number; res: import("express").Response }> = [];

export function addSSEClient(id: string, res: import("express").Response, clientId: number) {
  sseClients.push({ id, clientId, res });
  res.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== id);
  });
}

export function broadcastSSE(event: string, data: Record<string, unknown>) {
  const targetClientId = data.clientId as number | undefined;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (targetClientId !== undefined && client.clientId !== targetClientId) continue;
    try {
      client.res.write(payload);
    } catch (_e) {}
  }
}

async function runAssignment(assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, assignmentId));

  if (!assignment || assignment.isActive !== "true") return null;

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, assignment.botId));

  if (!bot) return null;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You have been assigned an ongoing monitoring responsibility. Produce a professional briefing report on the current status of your assigned objective. Be specific, insightful, and actionable.`,
      },
      {
        role: "user",
        content: `STANDING OBJECTIVE: ${assignment.objective}\n\nProduce your periodic briefing report.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "Report generation failed.";

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize the following report in one concise sentence.",
      },
      { role: "user", content },
    ],
  });

  const summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);

  const [report] = await db
    .insert(backgroundReportsTable)
    .values({
      assignmentId: assignment.id,
      botId: assignment.botId,
      clientId: assignment.clientId,
      content,
      summary,
      deliveredAt: new Date(),
    })
    .returning();

  await db
    .update(botAssignmentsTable)
    .set({ lastRunAt: new Date() })
    .where(eq(botAssignmentsTable.id, assignmentId));

  broadcastSSE("background-report", {
    reportId: report.id,
    assignmentId: assignment.id,
    botId: bot.id,
    botName: bot.name,
    clientId: assignment.clientId,
    summary,
  });

  return report;
}

async function checkDueAssignments() {
  const now = new Date();

  const assignments = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.isActive, "true"));

  for (const assignment of assignments) {
    const interval = SCHEDULE_INTERVALS[assignment.schedule] ?? SCHEDULE_INTERVALS.daily;

    if (!assignment.lastRunAt) {
      try {
        await runAssignment(assignment.id);
      } catch (err) {
        console.error(`Scheduler error for assignment ${assignment.id}:`, err);
      }
      continue;
    }

    const elapsed = now.getTime() - new Date(assignment.lastRunAt).getTime();
    if (elapsed >= interval) {
      try {
        await runAssignment(assignment.id);
      } catch (err) {
        console.error(`Scheduler error for assignment ${assignment.id}:`, err);
      }
    }
  }
}

let lastWeeklyBriefingCheck = 0;
const WEEKLY_BRIEFING_INTERVAL = 7 * 24 * 60 * 60 * 1000;

async function checkWeeklyBriefings() {
  const now = Date.now();
  if (now - lastWeeklyBriefingCheck < WEEKLY_BRIEFING_INTERVAL) return;
  lastWeeklyBriefingCheck = now;

  try {
    const clients = await db.select().from(clientsTable);
    for (const client of clients) {
      try {
        const briefing = await generateWeeklyBriefing(client.id);
        broadcastSSE("weekly-briefing", {
          clientId: client.id,
          companyName: client.companyName,
          briefing: briefing.briefing,
          highlights: briefing.highlights,
          recommendation: briefing.recommendation,
        });
      } catch (err) {
        console.error(`Weekly briefing error for client ${client.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Weekly briefing check error:", err);
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

async function tryAcquireSchedulerLock(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [SCHEDULER_LOCK_ID],
    );
    return result.rows[0]?.acquired === true;
  } catch (err) {
    console.error("Failed to acquire scheduler advisory lock:", err);
    return false;
  }
}

export async function startScheduler() {
  if (schedulerInterval) return;

  const acquired = await tryAcquireSchedulerLock();
  if (!acquired) {
    console.log("Scheduler lock not acquired — another instance is running scheduled jobs");
    return;
  }

  console.log("Background autonomy scheduler started (checking every 5 minutes)");
  schedulerInterval = setInterval(() => {
    checkDueAssignments().catch((err) =>
      console.error("Scheduler tick error:", err)
    );
    checkWeeklyBriefings().catch((err) =>
      console.error("Weekly briefing tick error:", err)
    );
  }, 5 * 60 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
