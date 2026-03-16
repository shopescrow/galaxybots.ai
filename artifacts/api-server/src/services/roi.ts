import {
  db,
  sessionOutcomesTable,
  clientsTable,
  roiShareableReportsTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import crypto from "crypto";

const TOOL_HOUR_MULTIPLIERS: Record<string, number> = {
  web_search: 0.5,
  read_session_state: 0.1,
  write_session_state: 0.15,
  query_bots: 0.2,
  query_clients: 0.2,
  delegate_task: 0.75,
  schedule_report: 0.3,
  default: 0.25,
};

export function estimateHoursSaved(toolsExecuted: Record<string, number>): number {
  let total = 0;
  for (const [tool, count] of Object.entries(toolsExecuted)) {
    const multiplier = TOOL_HOUR_MULTIPLIERS[tool] ?? TOOL_HOUR_MULTIPLIERS.default;
    total += count * multiplier;
  }
  return Math.round(total * 100) / 100;
}

export async function getClientROI(clientId: number, dateFrom?: Date, dateTo?: Date) {
  const conditions = [eq(sessionOutcomesTable.clientId, clientId)];
  if (dateFrom) conditions.push(gte(sessionOutcomesTable.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(sessionOutcomesTable.createdAt, dateTo));

  let outcomes: (typeof sessionOutcomesTable.$inferSelect)[];
  try {
    outcomes = await db
      .select()
      .from(sessionOutcomesTable)
      .where(and(...conditions))
      .orderBy(desc(sessionOutcomesTable.createdAt));
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as Record<string, unknown>).code === "42P01") {
      console.warn(`[roi] relation "session_outcomes" does not exist yet — returning empty results`);
      outcomes = [];
    } else {
      throw err;
    }
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  const hourlyRate = client ? parseFloat(client.hourlyRate) : 150;

  let totalHoursSaved = 0;
  let totalToolsUsed = 0;
  const departmentBreakdown: Record<string, { sessions: number; hoursSaved: number }> = {};
  const botBreakdown: Record<string, { sessions: number; hoursSaved: number }> = {};
  const toolUsage: Record<string, number> = {};
  const sessionsOverTime: { date: string; sessions: number; hoursSaved: number }[] = [];
  const dailyMap: Record<string, { sessions: number; hoursSaved: number }> = {};

  for (const outcome of outcomes) {
    const hours = parseFloat(outcome.estimatedHoursSaved as string);
    totalHoursSaved += hours;
    totalToolsUsed += outcome.toolsExecutedTotal;

    const dept = outcome.department || "General";
    if (!departmentBreakdown[dept]) departmentBreakdown[dept] = { sessions: 0, hoursSaved: 0 };
    departmentBreakdown[dept].sessions += 1;
    departmentBreakdown[dept].hoursSaved += hours;

    const bots = outcome.botsDeployed as { botId: number; botName: string; department: string }[] || [];
    for (const bot of bots) {
      if (!botBreakdown[bot.botName]) botBreakdown[bot.botName] = { sessions: 0, hoursSaved: 0 };
      botBreakdown[bot.botName].sessions += 1;
      botBreakdown[bot.botName].hoursSaved += hours / Math.max(bots.length, 1);
    }

    const tools = outcome.toolsExecuted as Record<string, number> || {};
    for (const [tool, count] of Object.entries(tools)) {
      toolUsage[tool] = (toolUsage[tool] || 0) + count;
    }

    const dateKey = new Date(outcome.createdAt).toISOString().split("T")[0];
    if (!dailyMap[dateKey]) dailyMap[dateKey] = { sessions: 0, hoursSaved: 0 };
    dailyMap[dateKey].sessions += 1;
    dailyMap[dateKey].hoursSaved += hours;
  }

  for (const [date, data] of Object.entries(dailyMap).sort()) {
    sessionsOverTime.push({ date, ...data });
  }

  const topBots = Object.entries(botBreakdown)
    .sort((a, b) => b[1].hoursSaved - a[1].hoursSaved)
    .slice(0, 5)
    .map(([name, data]) => ({ name, ...data }));

  const topTools = Object.entries(toolUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    clientId,
    companyName: client?.companyName || "Unknown",
    hourlyRate,
    totalSessions: outcomes.length,
    totalHoursSaved: Math.round(totalHoursSaved * 100) / 100,
    totalDollarsSaved: Math.round(totalHoursSaved * hourlyRate * 100) / 100,
    totalToolsUsed,
    departmentBreakdown: Object.entries(departmentBreakdown).map(([name, data]) => ({ name, ...data })),
    topBots,
    topTools,
    sessionsOverTime,
    recentOutcomes: outcomes.slice(0, 10).map((o) => ({
      id: o.id,
      sessionId: o.sessionId,
      summary: o.outcomeSummary,
      hoursSaved: parseFloat(o.estimatedHoursSaved as string),
      department: o.department,
      createdAt: o.createdAt,
    })),
  };
}

export async function generateWeeklyBriefing(clientId: number) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const roi = await getClientROI(clientId, oneWeekAgo);

  if (roi.totalSessions === 0) {
    return {
      clientId,
      companyName: roi.companyName,
      briefing: "No task sessions were completed this week. Consider deploying your AI team on pending business objectives to maximize value.",
      highlights: [],
      recommendation: "Schedule a strategy session with your AI executive team to identify high-impact tasks.",
    };
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1000,
    messages: [
      {
        role: "system",
        content: `You are the Chief of Staff AI, producing a weekly executive briefing for the client's leadership team. Be concise, professional, and data-driven. Format as a board-ready summary.`,
      },
      {
        role: "user",
        content: `Generate a weekly executive briefing for ${roi.companyName} based on this week's AI team performance:

Sessions completed: ${roi.totalSessions}
Hours saved: ${roi.totalHoursSaved}
Estimated savings: $${roi.totalDollarsSaved}
Top departments: ${roi.departmentBreakdown.map((d) => `${d.name} (${d.sessions} sessions)`).join(", ")}
Top performing bots: ${roi.topBots.map((b) => `${b.name} (${b.sessions} sessions)`).join(", ")}
Recent outcomes: ${roi.recentOutcomes.map((o) => o.summary).join("; ")}

Provide:
1. A 2-3 paragraph executive summary
2. 3 key highlights (one sentence each)
3. One strategic recommendation for next week

Respond in JSON: { "summary": "...", "highlights": ["...", "...", "..."], "recommendation": "..." }`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { summary: string; highlights: string[]; recommendation: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {
      summary: `This week, your AI team completed ${roi.totalSessions} sessions, saving an estimated ${roi.totalHoursSaved} hours ($${roi.totalDollarsSaved}).`,
      highlights: [`${roi.totalSessions} sessions completed`, `$${roi.totalDollarsSaved} in estimated savings`],
      recommendation: "Continue leveraging your AI team for maximum impact.",
    };
  }

  return {
    clientId,
    companyName: roi.companyName,
    briefing: parsed.summary,
    highlights: parsed.highlights || [],
    recommendation: parsed.recommendation || "",
    metrics: {
      sessions: roi.totalSessions,
      hoursSaved: roi.totalHoursSaved,
      dollarsSaved: roi.totalDollarsSaved,
    },
  };
}

export async function createShareableReport(
  clientId: number,
  dateFrom: Date,
  dateTo: Date,
  title?: string
) {
  const roi = await getClientROI(clientId, dateFrom, dateTo);
  const shareToken = crypto.randomBytes(24).toString("hex");

  let recommendation = "";
  if (roi.totalSessions > 0) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content: "Generate a brief 'what's next' recommendation (2-3 sentences) for a client based on their AI team's ROI data. Be specific and actionable.",
          },
          {
            role: "user",
            content: `Company: ${roi.companyName}. Sessions: ${roi.totalSessions}. Hours saved: ${roi.totalHoursSaved}. Dollar value: $${roi.totalDollarsSaved}. Top departments: ${roi.departmentBreakdown.map((d) => d.name).join(", ")}. Top bots: ${roi.topBots.map((b) => b.name).join(", ")}.`,
          },
        ],
      });
      recommendation = completion.choices[0]?.message?.content ?? "";
    } catch {
      recommendation = "Consider expanding your AI team to additional departments to unlock further savings.";
    }
  }

  const reportTitle = title || `${roi.companyName} - Value Report (${dateFrom.toLocaleDateString()} to ${dateTo.toLocaleDateString()})`;

  const [report] = await db
    .insert(roiShareableReportsTable)
    .values({
      clientId,
      shareToken,
      title: reportTitle,
      dateFrom,
      dateTo,
      reportData: roi as unknown as Record<string, unknown>,
      recommendation,
    })
    .returning();

  return report;
}

export async function getShareableReport(shareToken: string) {
  const [report] = await db
    .select()
    .from(roiShareableReportsTable)
    .where(eq(roiShareableReportsTable.shareToken, shareToken));

  return report || null;
}
