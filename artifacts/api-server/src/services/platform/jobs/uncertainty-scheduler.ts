import {
  db,
  botAssignmentsTable,
  botBeliefsTable,
  uncertaintySchedulesTable,
} from "@workspace/db";
import { eq, and, isNull, lt } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { createNotification } from "../../admin/notifications";

const REQUIRED_CONFIDENCE_DEFAULT = 0.7;
const LEAD_TIME_DAYS_DEFAULT = 2;

interface BeliefDependency {
  beliefText: string;
  requiredConfidence: number;
  reason: string;
}

async function identifyBeliefDependencies(
  assignment: typeof botAssignmentsTable.$inferSelect,
): Promise<BeliefDependency[]> {
  const prompt = `You are analyzing a bot goal to identify which beliefs it depends on.

Goal: "${assignment.objective}"
Horizon: ${assignment.horizon}
Evidence chain: ${(assignment.evidenceChain ?? []).join("; ")}

List the key beliefs this goal depends on to execute correctly. For each belief, specify the minimum confidence required.

Respond with JSON array:
[
  {
    "beliefText": "The belief statement this goal depends on",
    "requiredConfidence": 0.0-1.0,
    "reason": "Why this belief is needed for the goal"
  }
]

Return empty array [] if the goal has no critical belief dependencies.`;

  try {
    const response = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: "Identify belief dependencies for AI agent goals. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const deps: BeliefDependency[] = Array.isArray(parsed) ? parsed : (parsed.dependencies ?? []);
    return deps;
  } catch {
    return [];
  }
}

export async function scheduleUncertaintyGathering(assignmentId: number) {
  const [assignment] = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.id, assignmentId));

  if (!assignment || !assignment.clientId) return;

  const horizonDays: Record<string, number> = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
  };
  const daysUntilExecution = horizonDays[assignment.horizon] ?? 7;
  const leadTimeDays = Math.min(LEAD_TIME_DAYS_DEFAULT, daysUntilExecution - 1);

  if (leadTimeDays < 1) return;

  const dependencies = await identifyBeliefDependencies(assignment);
  if (dependencies.length === 0) return;

  const currentBeliefs = await db
    .select()
    .from(botBeliefsTable)
    .where(
      and(
        eq(botBeliefsTable.botId, assignment.botId),
        eq(botBeliefsTable.clientId, assignment.clientId),
        isNull(botBeliefsTable.archivedAt),
      ),
    );

  for (const dep of dependencies) {
    const matchingBelief = currentBeliefs.find((b) =>
      b.beliefText.toLowerCase().includes(dep.beliefText.toLowerCase().slice(0, 30)),
    );

    const currentConfidence = matchingBelief?.confidence ?? 0;

    if (currentConfidence >= dep.requiredConfidence) continue;

    const scheduledGatherAt = new Date(
      Date.now() + (daysUntilExecution - leadTimeDays) * 24 * 60 * 60 * 1000,
    );

    await db.insert(uncertaintySchedulesTable).values({
      beliefId: matchingBelief?.id ?? null,
      goalId: assignment.id,
      botId: assignment.botId,
      clientId: assignment.clientId,
      beliefText: dep.beliefText,
      currentConfidence,
      requiredConfidence: dep.requiredConfidence,
      scheduledGatherAt,
      status: "pending",
      leadTimeDays,
    });

    console.log(
      `[uncertainty-scheduler] Scheduled belief research for assignment #${assignment.id}: "${dep.beliefText}" (current conf: ${currentConfidence.toFixed(2)}, required: ${dep.requiredConfidence})`,
    );
  }
}

export async function checkUncertaintySchedules() {
  const now = new Date();

  const due = await db
    .select()
    .from(uncertaintySchedulesTable)
    .where(
      and(
        eq(uncertaintySchedulesTable.status, "pending"),
        lt(uncertaintySchedulesTable.scheduledGatherAt, now),
      ),
    )
    .limit(20);

  for (const schedule of due) {
    try {
      const [assignment] = await db
        .select()
        .from(botAssignmentsTable)
        .where(eq(botAssignmentsTable.id, schedule.goalId));

      if (!assignment || !schedule.clientId) continue;

      await db
        .update(uncertaintySchedulesTable)
        .set({ status: "dispatched" })
        .where(eq(uncertaintySchedulesTable.id, schedule.id));

      createNotification({
        clientId: schedule.clientId,
        category: "bot",
        severity: "info",
        title: "Proactive belief research dispatched",
        body: `Gathering data on "${schedule.beliefText}" (current confidence ${(schedule.currentConfidence * 100).toFixed(0)}% < required ${(schedule.requiredConfidence * 100).toFixed(0)}%) before goal execution.`,
        link: "/belief-browser",
        metadata: { scheduleId: schedule.id, goalId: schedule.goalId, botId: schedule.botId },
        isScheduled: true,
      }).catch(() => {});

      console.log(
        `[uncertainty-scheduler] Dispatched belief research #${schedule.id} for goal #${schedule.goalId}`,
      );
    } catch (err) {
      console.error(`[uncertainty-scheduler] Error processing schedule #${schedule.id}:`, err);
    }
  }
}
