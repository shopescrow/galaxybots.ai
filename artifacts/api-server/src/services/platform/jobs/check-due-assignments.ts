import {
  db,
  botAssignmentsTable,
  backgroundReportsTable,
  botsTable,
  conversations,
  toolActivityLogTable,
  notificationsTable,
} from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { broadcastSSE } from "../sse";
import { shouldPauseAutonomous } from "../../analytics/cost-caps";
import { createNotification } from "../../admin/notifications";
import { runAgenticLoop } from "../../../tools/agentic-loop";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

const DAILY_ASSIGNMENT_TOKEN_CAP = parseInt(process.env.DAILY_ASSIGNMENT_TOKEN_CAP || "100000", 10);

interface DailyTokenEntry {
  tokens: number;
  date: string;
  paused: boolean;
}

const assignmentDailyTokenLedger = new Map<number, DailyTokenEntry>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getAssignmentTokensToday(assignmentId: number): DailyTokenEntry {
  const today = getTodayKey();
  const entry = assignmentDailyTokenLedger.get(assignmentId);
  if (!entry || entry.date !== today) {
    const fresh: DailyTokenEntry = { tokens: 0, date: today, paused: false };
    assignmentDailyTokenLedger.set(assignmentId, fresh);
    return fresh;
  }
  return entry;
}

function recordAssignmentTokens(assignmentId: number, tokens: number, clientId: number): boolean {
  const entry = getAssignmentTokensToday(assignmentId);
  entry.tokens += tokens;
  if (entry.tokens >= DAILY_ASSIGNMENT_TOKEN_CAP && !entry.paused) {
    entry.paused = true;
    console.warn(`[scheduler] Assignment #${assignmentId} paused: daily token cap exceeded (${entry.tokens}/${DAILY_ASSIGNMENT_TOKEN_CAP})`);
    createNotification({
      clientId,
      category: "cost",
      severity: "warning",
      title: "Assignment paused — daily token limit reached",
      body: `Assignment #${assignmentId} consumed ${entry.tokens.toLocaleString()} tokens today, exceeding the ${DAILY_ASSIGNMENT_TOKEN_CAP.toLocaleString()} daily limit. It will resume tomorrow.`,
    }).catch(() => {});
    return true;
  }
  return entry.paused;
}

function isAssignmentPausedToday(assignmentId: number): boolean {
  return getAssignmentTokensToday(assignmentId).paused;
}

async function hasRecentActivity(clientId: number, since: Date): Promise<boolean> {
  try {
    const [convActivity] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(conversations)
      .where(
        eq(conversations.clientId, clientId),
      );

    if (convActivity && Number(convActivity.cnt) > 0) {
      const [recentConv] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(conversations)
        .where(
          eq(conversations.clientId, clientId),
        );
      if (recentConv && Number(recentConv.cnt) > 0) return true;
    }

    const [toolActivity] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(toolActivityLogTable)
      .where(
        eq(toolActivityLogTable.clientId, clientId),
      );

    if (toolActivity && Number(toolActivity.cnt) > 0) return true;

    const [notifActivity] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(
        eq(notificationsTable.clientId, clientId),
      );

    if (notifActivity && Number(notifActivity.cnt) > 0) return true;

    return false;
  } catch {
    return true;
  }
}

async function runPassiveAssignment(assignment: typeof botAssignmentsTable.$inferSelect, bot: typeof botsTable.$inferSelect) {
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

  return { content, summary, runStatus: "success" as const };
}

async function runActiveAssignment(assignment: typeof botAssignmentsTable.$inferSelect, bot: typeof botsTable.$inferSelect): Promise<{ content: string; summary: string; runStatus: "success" | "partial" | "failed" }> {
  const missionPrompt = assignment.actionPrompt || assignment.objective;

  const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You are executing a standing order autonomously. Use your available tools to complete the mission objective below. Take real actions — post messages, send emails, create documents, look up data — whatever is needed to fulfill the order. When done, provide a concise summary of what you accomplished.`;

  const result = await runAgenticLoop({
    model: "gpt-4o-mini",
    maxIterations: 10,
    maxTokens: 1500,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `STANDING ORDER: ${missionPrompt}\n\nExecute this order now using your available tools. Report back on what you accomplished.`,
      },
    ],
    context: {
      clientId: assignment.clientId ?? undefined,
      botId: bot.id,
      botName: bot.name,
      depth: 0,
    },
  });

  if (result.totalTokensConsumed) {
    console.log(`[scheduler] Assignment #${assignment.id} consumed ${result.totalTokensConsumed} tokens`);
    if (assignment.clientId) {
      recordAssignmentTokens(assignment.id, result.totalTokensConsumed, assignment.clientId);
    }
  }

  const hasError = result.events.some((e) => e.type === "error");
  const hasToolBlocked = result.events.some((e) => e.type === "tool_blocked");
  const paused = result.paused === true;

  let runStatus: "success" | "partial" | "failed";
  if (hasError && !result.finalContent) {
    runStatus = "failed";
  } else if (hasError || hasToolBlocked || paused) {
    runStatus = "partial";
  } else {
    runStatus = "success";
  }

  const content = result.finalContent || "Active execution completed but produced no output.";

  const summaryCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize the following execution report in one concise sentence.",
      },
      { role: "user", content },
    ],
  });

  const summary = summaryCompletion.choices[0]?.message?.content ?? content.substring(0, 200);

  return { content, summary, runStatus };
}

async function runAssignment(assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, assignmentId));

  if (!assignment || assignment.isActive !== "true") return null;

  if (!assignment.clientId) {
    console.warn(`[scheduler] Skipping assignment #${assignmentId}: no clientId — cannot stamp notifications or SSE events without tenant scope`);
    return null;
  }

  if (assignment.clientId && assignment.lastRunAt) {
    const lastRun = new Date(assignment.lastRunAt);
    const activity = await hasRecentActivity(assignment.clientId, lastRun);
    if (!activity) {
      console.log(`[scheduler] Skipping assignment #${assignmentId}: no activity since ${lastRun.toISOString()}`);
      await db
        .update(botAssignmentsTable)
        .set({ lastRunAt: new Date() })
        .where(eq(botAssignmentsTable.id, assignmentId));
      return null;
    }
  }

  if (isAssignmentPausedToday(assignmentId)) {
    console.log(`[scheduler] Skipping assignment #${assignmentId}: daily token cap already exceeded`);
    return null;
  }

  if (assignment.clientId) {
    const paused = await shouldPauseAutonomous(assignment.clientId);
    if (paused) {
      broadcastSSE("cost_alert", {
        clientId: assignment.clientId,
        level: "critical",
        message: `Autonomous run skipped for assignment #${assignmentId}: monthly cost cap exceeded`,
      });
      createNotification({
        clientId: assignment.clientId,
        category: "cost",
        severity: "critical",
        title: "Autonomous run skipped",
        body: `Autonomous run skipped for assignment #${assignmentId}: monthly cost cap exceeded`,
        link: "/analytics",
        isScheduled: true,
      }).catch((e) => console.error("[notifications] Failed to create cost_alert notification:", e));
      return null;
    }
  }

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, assignment.botId));

  if (!bot) return null;

  let reportData: { content: string; summary: string; runStatus: "success" | "partial" | "failed" };

  if (assignment.actionMode === "active") {
    reportData = await runActiveAssignment(assignment, bot);
  } else {
    reportData = await runPassiveAssignment(assignment, bot);
  }

  const [report] = await db
    .insert(backgroundReportsTable)
    .values({
      assignmentId: assignment.id,
      botId: assignment.botId,
      clientId: assignment.clientId,
      content: reportData.content,
      summary: reportData.summary,
      runStatus: reportData.runStatus,
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
    summary: reportData.summary,
    runStatus: reportData.runStatus,
    actionMode: assignment.actionMode,
  });

  createNotification({
    clientId: assignment.clientId,
    category: "bot",
    severity: "info",
    title: `Background report from ${bot.name}`,
    body: reportData.summary,
    link: "/command-center",
    metadata: { reportId: report.id, botId: bot.id },
    isScheduled: true,
  }).catch((e) => console.error("[notifications] Failed to create background-report notification:", e));

  if (reportData.runStatus === "failed" || reportData.runStatus === "partial") {
    broadcastSSE("assignment-alert", {
      reportId: report.id,
      assignmentId: assignment.id,
      botId: bot.id,
      botName: bot.name,
      clientId: assignment.clientId,
      runStatus: reportData.runStatus,
      summary: reportData.summary,
      message: reportData.runStatus === "failed"
        ? `Standing order failed for ${bot.name}: ${reportData.summary}`
        : `Standing order partially completed by ${bot.name}: ${reportData.summary}`,
    });

    createNotification({
      clientId: assignment.clientId,
      category: "bot",
      severity: reportData.runStatus === "failed" ? "critical" : "warning",
      title: reportData.runStatus === "failed"
        ? `Standing order failed for ${bot.name}`
        : `Standing order partially completed by ${bot.name}`,
      body: reportData.summary,
      link: "/bots",
      metadata: { reportId: report.id, assignmentId: assignment.id, botId: bot.id },
      isScheduled: true,
    }).catch((e) => console.error("[notifications] Failed to create assignment-alert notification:", e));
  }

  return report;
}

export async function checkDueAssignments() {
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
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${assignment.clientId ?? 'unknown'}: assignment ${assignment.id} failed — ${errMsg(err)}`);
      }
      continue;
    }

    const elapsed = now.getTime() - new Date(assignment.lastRunAt).getTime();
    if (elapsed >= interval) {
      try {
        await runAssignment(assignment.id);
      } catch (err: unknown) {
        console.error(`[scheduler] Error for client ${assignment.clientId ?? 'unknown'}: assignment ${assignment.id} failed — ${errMsg(err)}`);
      }
    }
  }
}
