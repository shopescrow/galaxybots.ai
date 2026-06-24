import {
  db,
  sessionOutcomesTable,
  taskSessionMessagesTable,
  taskSessionBotsTable,
  botsTable,
  conductorStrategiesTable,
  llmUsageLogTable,
} from "@workspace/db";
import { eq, inArray, sql, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { estimateHoursSaved } from "./roi";
import { createNotification } from "../admin/notifications";
import { recordStrategyOutcome, setStrategyConfoundScores } from "../conductor/galaxy-conductor";
import { recordExperimentResult } from "../intelligence/ab-experiment";

const MAX_EXPECTED_TOOLS = 20;
const MAX_ITERATIONS = 10;

function computeTaskDifficultyScore(params: {
  toolCallCount: number;
  iterationCount: number;
  inputTokenCount: number;
}): number {
  const toolComponent = Math.min(1, params.toolCallCount / MAX_EXPECTED_TOOLS);
  const iterComponent = Math.min(1, params.iterationCount / MAX_ITERATIONS);
  const tokenComponent = Math.min(1, params.inputTokenCount / 128000);
  return (toolComponent + iterComponent + tokenComponent) / 3;
}

async function scorePromptQuality(
  objective: string,
): Promise<number> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 60,
      messages: [
        {
          role: "system",
          content:
            "You are a prompt quality evaluator. Score the following user prompt on clarity, specificity, and completeness on a scale from 0.0 to 1.0. Return ONLY a decimal number like 0.75.",
        },
        {
          role: "user",
          content: `Prompt: "${objective}"`,
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "0.5").trim();
    const score = parseFloat(raw);
    return isNaN(score) ? 0.5 : Math.min(1, Math.max(0, score));
  } catch {
    return 0.5;
  }
}

export async function captureSessionOutcome(
  sessionId: number,
  objective: string,
  clientId?: number,
  startTime?: Date
) {
  const messages = await db
    .select()
    .from(taskSessionMessagesTable)
    .where(eq(taskSessionMessagesTable.sessionId, sessionId))
    .orderBy(taskSessionMessagesTable.createdAt);

  const sessionBotRows = await db
    .select()
    .from(taskSessionBotsTable)
    .where(eq(taskSessionBotsTable.sessionId, sessionId));

  const botIds = sessionBotRows.map((sb) => sb.botId);
  let teamBots: { id: number; name: string; department: string }[] = [];
  if (botIds.length > 0) {
    teamBots = await db
      .select({ id: botsTable.id, name: botsTable.name, department: botsTable.department })
      .from(botsTable)
      .where(inArray(botsTable.id, botIds));
  }

  const toolCalls = messages.filter((m) => m.messageType === "tool_call");
  const toolsExecuted: Record<string, number> = {};
  for (const tc of toolCalls) {
    const toolName = (tc.toolData as { toolName?: string })?.toolName || "unknown";
    toolsExecuted[toolName] = (toolsExecuted[toolName] || 0) + 1;
  }

  const toolsExecutedTotal = Object.values(toolsExecuted).reduce((a, b) => a + b, 0);
  const estimatedHours = estimateHoursSaved(toolsExecuted);

  const durationMinutes = startTime
    ? Math.round((Date.now() - startTime.getTime()) / 60000)
    : messages.length > 0
    ? Math.round(
        (new Date(messages[messages.length - 1].createdAt).getTime() -
          new Date(messages[0].createdAt).getTime()) /
          60000
      )
    : 0;

  const loopIterationMessages = messages.filter((m) => m.messageType === "loop_start" || m.messageType === "iteration");
  const iterationCount = Math.max(1, loopIterationMessages.length);

  let inputTokenCount = 0;
  try {
    const usageRows = await db
      .select({ promptTokens: llmUsageLogTable.promptTokens })
      .from(llmUsageLogTable)
      .where(
        eq(llmUsageLogTable.sessionId, sessionId),
      );
    inputTokenCount = usageRows.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  } catch {
    inputTokenCount = messages.length * 200;
  }

  const taskDifficultyScore = computeTaskDifficultyScore({
    toolCallCount: toolsExecutedTotal,
    iterationCount,
    inputTokenCount,
  });

  const [promptQualityScore] = await Promise.all([
    scorePromptQuality(objective),
  ]);

  const botMessages = messages
    .filter((m) => m.role === "bot" && m.messageType === "text")
    .slice(-5);
  const contextForSummary = botMessages.map((m) => `${m.botName}: ${m.content}`).join("\n");

  let outcomeSummary = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "You are a business analyst. Write a 2-3 sentence outcome summary for a completed task session. Focus on business value, decisions made, and concrete deliverables. Be specific and professional.",
        },
        {
          role: "user",
          content: `Task objective: ${objective}\nTeam: ${teamBots.map((b) => `${b.name} (${b.department})`).join(", ")}\nTools used: ${Object.entries(toolsExecuted).map(([t, c]) => `${t}: ${c}`).join(", ")}\n\nRecent discussion:\n${contextForSummary}`,
        },
      ],
    });
    outcomeSummary = completion.choices[0]?.message?.content ?? "";
  } catch {
    outcomeSummary = `Completed task "${objective}" with ${teamBots.length} bots, using ${toolsExecutedTotal} tool calls.`;
  }

  const primaryDepartment = teamBots.length > 0 ? teamBots[0].department : null;

  const values = {
    sessionId,
    clientId: clientId ?? null,
    botsDeployed: teamBots.map((b) => ({ botId: b.id, botName: b.name, department: b.department })),
    toolsExecuted,
    toolsExecutedTotal,
    durationMinutes: String(durationMinutes),
    estimatedHoursSaved: String(estimatedHours),
    outcomeSummary,
    department: primaryDepartment,
    taskDifficultyScore,
    promptQualityScore,
    inputTokenCount,
  };

  const [outcome] = await db
    .insert(sessionOutcomesTable)
    .values(values)
    .onConflictDoUpdate({
      target: sessionOutcomesTable.sessionId,
      set: {
        botsDeployed: sql`excluded.bots_deployed`,
        toolsExecuted: sql`excluded.tools_executed`,
        toolsExecutedTotal: sql`excluded.tools_executed_total`,
        durationMinutes: sql`excluded.duration_minutes`,
        estimatedHoursSaved: sql`excluded.estimated_hours_saved`,
        outcomeSummary: sql`excluded.outcome_summary`,
        department: sql`excluded.department`,
        taskDifficultyScore: sql`excluded.task_difficulty_score`,
        promptQualityScore: sql`excluded.prompt_quality_score`,
        inputTokenCount: sql`excluded.input_token_count`,
      },
    })
    .returning();

  try {
    const conductorRow = await db
      .select({
        id: conductorStrategiesTable.id,
        qualityScore: conductorStrategiesTable.qualityScore,
        abVariant: conductorStrategiesTable.abVariant,
      })
      .from(conductorStrategiesTable)
      .where(eq(conductorStrategiesTable.sessionId, String(sessionId)))
      .limit(1);

    if (conductorRow.length > 0) {
      const strategyId = conductorRow[0].id;

      await setStrategyConfoundScores(strategyId, taskDifficultyScore, promptQualityScore).catch(() => {});

      let finalQuality: number;
      if (conductorRow[0].qualityScore === null) {
        const completeness = toolsExecutedTotal > 0 ? Math.min(1, toolsExecutedTotal / 10) : 0.5;
        const durationScore = durationMinutes > 0 ? Math.max(0, 1 - durationMinutes / 60) : 0.7;
        finalQuality = (completeness + durationScore) / 2;
        recordStrategyOutcome(strategyId, finalQuality).catch(() => {});
      } else {
        finalQuality = Number(conductorRow[0].qualityScore);
      }

      if (clientId) {
        const storedVariant = conductorRow[0].abVariant as "control" | "treatment" | null;
        recordExperimentResult(clientId, String(sessionId), finalQuality, storedVariant ?? undefined).catch(() => {});
      }
    }
  } catch {
  }

  if (clientId) {
    const botNames = teamBots.map((b) => b.name).join(", ");
    createNotification({
      clientId,
      category: "bot",
      severity: "info",
      title: "Mission Complete",
      body: outcomeSummary || `"${objective}" completed by ${botNames || "your team"}.`,
      link: "/(tabs)",
      metadata: {
        sessionId,
        toolsUsed: toolsExecutedTotal,
        hoursSaved: estimatedHours,
        taskDifficulty: taskDifficultyScore,
        promptQuality: promptQualityScore,
      },
    }).catch(() => {});
  }

  return outcome;
}
