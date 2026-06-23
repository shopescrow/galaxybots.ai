import {
  db,
  botsTable,
  botAssignmentsTable,
  botBeliefsTable,
  botLoopConfigTable,
  episodicSummariesTable,
  causalOutcomesTable,
  pendingApprovalsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, desc, gte, isNull } from "drizzle-orm";
import { decomposeGoal } from "./goal-decomposition";
import { checkGoalConflicts } from "./goal-conflict-resolver";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createNotification } from "../../admin/notifications";
import { broadcastSSE } from "../sse";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let lastGoalGenerationRun = 0;

interface CandidateGoal {
  objective: string;
  horizon: "daily" | "weekly" | "monthly" | "quarterly";
  priorityTier: 1 | 2 | 3;
  impactScore: number;
  feasibilityScore: number;
  evidenceChain: string[];
  resourceRequirements: {
    timeBudgetMinutes: number;
    costBudgetCents: number;
    clientAttentionUnits: number;
  };
  reasoning: string;
}

async function generateGoalsForBot(
  bot: typeof botsTable.$inferSelect,
  clientId: number,
) {
  const [beliefs, episodics, causalPatterns] = await Promise.all([
    db
      .select()
      .from(botBeliefsTable)
      .where(
        and(
          eq(botBeliefsTable.botId, bot.id),
          eq(botBeliefsTable.clientId, clientId),
          isNull(botBeliefsTable.archivedAt),
        ),
      )
      .orderBy(desc(botBeliefsTable.confidence))
      .limit(20),

    db
      .select()
      .from(episodicSummariesTable)
      .where(
        and(
          eq(episodicSummariesTable.botId, bot.id),
          eq(episodicSummariesTable.clientId, clientId),
        ),
      )
      .orderBy(desc(episodicSummariesTable.createdAt))
      .limit(5),

    db
      .select()
      .from(causalOutcomesTable)
      .where(eq(causalOutcomesTable.clientId, clientId))
      .orderBy(desc(causalOutcomesTable.attributionConfidence))
      .limit(10),
  ]);

  const beliefSummary = beliefs
    .map((b) => `- [${b.category}] ${b.beliefText} (conf: ${b.confidence.toFixed(2)})`)
    .join("\n");

  const episodicSummary = episodics
    .map((e) => `- Period ${e.periodStart.toISOString().slice(0, 10)}: ${e.narrative.slice(0, 200)}`)
    .join("\n");

  const causalSummary = causalPatterns
    .filter((c) => c.causalPatternSummary)
    .map((c) => `- ${c.causalPatternSummary} (confidence: ${(c.attributionConfidence ?? 0).toFixed(2)})`)
    .join("\n");

  const prompt = `You are ${bot.name}, ${bot.title}. Based on your current belief state, recent history, and proven causal patterns, generate 1-3 ranked goal proposals for the coming week.

## Current Belief State
${beliefSummary || "No beliefs recorded yet."}

## Recent Episodic History
${episodicSummary || "No episodic history yet."}

## Proven Causal Patterns (control-adjusted)
${causalSummary || "No causal patterns yet."}

## Your Responsibilities
${bot.responsibilities.join("; ")}

Generate 1-3 autonomous goal proposals. Respond with a JSON array:
[
  {
    "objective": "Clear, actionable goal statement",
    "horizon": "daily|weekly|monthly|quarterly",
    "priorityTier": 1|2|3,
    "impactScore": 0-100,
    "feasibilityScore": 0-100,
    "evidenceChain": ["evidence item 1", "evidence item 2"],
    "resourceRequirements": {
      "timeBudgetMinutes": number,
      "costBudgetCents": number,
      "clientAttentionUnits": 0|1|2|3
    },
    "reasoning": "Why this goal now, what causal evidence supports it"
  }
]

Only propose goals with clear evidence support. Focus on high-impact, achievable objectives.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1500,
    messages: [
      { role: "system", content: "You generate autonomous goal proposals for AI agents. Respond only with valid JSON." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    const goals: CandidateGoal[] = Array.isArray(parsed) ? parsed : (parsed.goals ?? []);
    return goals.slice(0, 3);
  } catch {
    return [];
  }
}

async function resolveGoalTrust(
  goal: CandidateGoal,
  bot: typeof botsTable.$inferSelect,
  clientId: number,
) {
  const expectedValue = Math.round(
    (goal.impactScore * goal.feasibilityScore) / 100,
  );

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);

  const [loopConfig] = await db
    .select({ autoApproveGoalImpactThreshold: botLoopConfigTable.autoApproveGoalImpactThreshold })
    .from(botLoopConfigTable)
    .where(eq(botLoopConfigTable.botId, bot.id))
    .limit(1);

  const autoApproveThreshold = loopConfig?.autoApproveGoalImpactThreshold ?? 40;

  if (expectedValue <= autoApproveThreshold) {
    const [assignment] = await db
      .insert(botAssignmentsTable)
      .values({
        botId: bot.id,
        clientId,
        objective: goal.objective,
        schedule: goal.horizon === "daily" ? "daily" : "weekly",
        isActive: "true",
        actionMode: "active",
        actionPrompt: `${goal.objective}\n\nEvidence: ${goal.evidenceChain.join("; ")}`,
        horizon: goal.horizon,
        priorityTier: goal.priorityTier,
        generatedBy: "autonomous",
        impactScore: goal.impactScore,
        feasibilityScore: goal.feasibilityScore,
        evidenceChain: goal.evidenceChain,
        resourceRequirements: goal.resourceRequirements,
        autoApproveThreshold,
      })
      .returning();

    createNotification({
      clientId,
      category: "bot",
      severity: "info",
      title: `${bot.name} auto-approved a new goal`,
      body: `Auto-approved: "${goal.objective}" (EV score ${expectedValue} ≤ threshold ${autoApproveThreshold})`,
      link: "/command-center",
      metadata: { assignmentId: assignment.id, botId: bot.id, generatedBy: "autonomous" },
      isScheduled: true,
    }).catch(() => {});

    broadcastSSE("autonomous-goal-created", {
      clientId,
      assignmentId: assignment.id,
      botId: bot.id,
      botName: bot.name,
      objective: goal.objective,
      autoApproved: true,
    });

    console.log(`[goal-gen] Auto-approved goal for ${bot.name}: "${goal.objective}" (EV=${expectedValue})`);

    decomposeGoal(assignment.id).catch((err) =>
      console.error(`[goal-gen] decomposeGoal error for assignment ${assignment.id}:`, err),
    );
    checkGoalConflicts(assignment.id).catch((err) =>
      console.error(`[goal-gen] checkGoalConflicts error for assignment ${assignment.id}:`, err),
    );

    return assignment;
  } else {
    await db.insert(pendingApprovalsTable).values({
      clientId,
      botId: bot.id,
      botName: bot.name,
      toolName: "autonomous_goal_proposal",
      toolInput: {
        objective: goal.objective,
        horizon: goal.horizon,
        impactScore: goal.impactScore,
        feasibilityScore: goal.feasibilityScore,
        expectedValue,
        resourceRequirements: goal.resourceRequirements,
        evidenceChain: goal.evidenceChain,
        reasoning: goal.reasoning,
        priorityTier: goal.priorityTier,
        generatedBy: "autonomous",
      },
      isTimeSensitive: goal.priorityTier === 1,
      slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    createNotification({
      clientId,
      category: "bot",
      severity: "warning",
      title: `${bot.name} proposed a new goal — approval required`,
      body: `"${goal.objective}" (EV score ${expectedValue} > threshold ${autoApproveThreshold}). Review in Command Center.`,
      link: "/command-center?scroll=approvals",
      metadata: { botId: bot.id, generatedBy: "autonomous" },
      isScheduled: true,
    }).catch(() => {});

    broadcastSSE("autonomous-goal-pending", {
      clientId,
      botId: bot.id,
      botName: bot.name,
      objective: goal.objective,
      expectedValue,
    });

    console.log(`[goal-gen] Goal pending approval for ${bot.name}: "${goal.objective}" (EV=${expectedValue})`);
    return null;
  }
}

export async function runGoalGeneration() {
  const now = Date.now();
  if (now - lastGoalGenerationRun < ONE_WEEK_MS) return;
  lastGoalGenerationRun = now;

  console.log("[goal-gen] Starting weekly goal generation...");

  const bots = await db.select().from(botsTable).limit(50);

  for (const bot of bots) {
    const [existingAssignment] = await db
      .select({ clientId: botAssignmentsTable.clientId })
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.botId, bot.id))
      .orderBy(desc(botAssignmentsTable.createdAt))
      .limit(1);

    const clientId = existingAssignment?.clientId;
    if (!clientId) continue;

    try {
      const goals = await generateGoalsForBot(bot, clientId);
      for (const goal of goals) {
        await resolveGoalTrust(goal, bot, clientId);
      }
    } catch (err) {
      console.error(`[goal-gen] Error for bot ${bot.id} (${bot.name}):`, err);
    }
  }

  console.log("[goal-gen] Weekly goal generation complete.");
}
