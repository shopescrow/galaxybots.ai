import {
  db,
  botAssignmentsTable,
  goalConflictsTable,
  pendingApprovalsTable,
  botsTable,
} from "@workspace/db";
import { eq, and, not } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { createNotification } from "../../admin/notifications";
import { broadcastSSE } from "../sse";

interface ConflictAnalysis {
  hasConflict: boolean;
  conflictType: string;
  description: string;
  mutuallyExclusiveActions: boolean;
}

async function analyzeGoalConflict(
  goalA: typeof botAssignmentsTable.$inferSelect,
  goalB: typeof botAssignmentsTable.$inferSelect,
): Promise<ConflictAnalysis> {
  const prompt = `Analyze whether these two bot goals conflict with each other:

Goal A (priority tier ${goalA.priorityTier}): "${goalA.objective}"
Resources A: ${JSON.stringify(goalA.resourceRequirements)}

Goal B (priority tier ${goalB.priorityTier}): "${goalB.objective}"
Resources B: ${JSON.stringify(goalB.resourceRequirements)}

Determine if they require mutually exclusive actions on the same client or compete for exclusive resources.

Respond with JSON:
{
  "hasConflict": boolean,
  "conflictType": "resource_contention|action_exclusion|client_attention|none",
  "description": "brief explanation",
  "mutuallyExclusiveActions": boolean
}`;

  try {
    const response = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: "You detect conflicts between AI agent goals. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
    return {
      hasConflict: parsed.hasConflict ?? false,
      conflictType: parsed.conflictType ?? "none",
      description: parsed.description ?? "",
      mutuallyExclusiveActions: parsed.mutuallyExclusiveActions ?? false,
    };
  } catch {
    return { hasConflict: false, conflictType: "none", description: "", mutuallyExclusiveActions: false };
  }
}

async function resolveConflict(
  goalA: typeof botAssignmentsTable.$inferSelect,
  goalB: typeof botAssignmentsTable.$inferSelect,
  conflict: ConflictAnalysis,
  clientId: number,
) {
  const samePriority = goalA.priorityTier === goalB.priorityTier;

  if (samePriority) {
    await db.insert(goalConflictsTable).values({
      goalAId: goalA.id,
      goalBId: goalB.id,
      clientId,
      conflictType: conflict.conflictType,
      resolution: "escalated_to_human",
      resolutionReason: `Equal priority tiers (${goalA.priorityTier}) — human judgment required. ${conflict.description}`,
      resolvedBy: "system",
      escalatedToHuman: 1,
    });

    await db.insert(pendingApprovalsTable).values({
      clientId,
      botId: goalA.botId,
      toolName: "goal_conflict_resolution",
      toolInput: {
        goalAId: goalA.id,
        goalAObjective: goalA.objective,
        goalBId: goalB.id,
        goalBObjective: goalB.objective,
        conflictType: conflict.conflictType,
        description: conflict.description,
        priorityTier: goalA.priorityTier,
      },
      isTimeSensitive: true,
      slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    createNotification({
      clientId,
      category: "bot",
      severity: "warning",
      title: "Goal conflict requires your decision",
      body: `Two equal-priority goals conflict: "${goalA.objective}" vs "${goalB.objective}". ${conflict.description}`,
      link: "/command-center?scroll=approvals",
      metadata: { goalAId: goalA.id, goalBId: goalB.id },
      isScheduled: true,
    }).catch(() => {});

    broadcastSSE("goal-conflict-escalated", {
      clientId,
      goalAId: goalA.id,
      goalBId: goalB.id,
      conflictType: conflict.conflictType,
    });
  } else {
    const lowerPriorityGoal = goalA.priorityTier > goalB.priorityTier ? goalA : goalB;
    const higherPriorityGoal = goalA.priorityTier > goalB.priorityTier ? goalB : goalA;

    await db
      .update(botAssignmentsTable)
      .set({
        isActive: "paused",
        blockingOn: [{ reason: `Paused: conflicts with higher-priority goal #${higherPriorityGoal.id} — "${higherPriorityGoal.objective}"`, since: new Date().toISOString() }],
      })
      .where(eq(botAssignmentsTable.id, lowerPriorityGoal.id));

    const lowerReqs = (lowerPriorityGoal.resourceRequirements ?? {}) as { timeBudgetMinutes?: number; costBudgetCents?: number; clientAttentionUnits?: number };
    const higherReqs = (higherPriorityGoal.resourceRequirements ?? {}) as { timeBudgetMinutes?: number; costBudgetCents?: number; clientAttentionUnits?: number };

    const updatedReqs = {
      timeBudgetMinutes: (higherReqs.timeBudgetMinutes ?? 60) + (lowerReqs.timeBudgetMinutes ?? 0),
      costBudgetCents: (higherReqs.costBudgetCents ?? 500) + (lowerReqs.costBudgetCents ?? 0),
      clientAttentionUnits: Math.max(higherReqs.clientAttentionUnits ?? 1, lowerReqs.clientAttentionUnits ?? 0),
    };

    await db
      .update(botAssignmentsTable)
      .set({ resourceRequirements: updatedReqs })
      .where(eq(botAssignmentsTable.id, higherPriorityGoal.id));

    await db.insert(goalConflictsTable).values({
      goalAId: higherPriorityGoal.id,
      goalBId: lowerPriorityGoal.id,
      clientId,
      conflictType: conflict.conflictType,
      resolution: "lower_priority_paused",
      resolutionReason: `Goal #${lowerPriorityGoal.id} (tier ${lowerPriorityGoal.priorityTier}) paused; resources transferred to goal #${higherPriorityGoal.id} (tier ${higherPriorityGoal.priorityTier}). ${conflict.description}`,
      resolvedAt: new Date(),
      resolvedBy: "system",
      escalatedToHuman: 0,
    });

    createNotification({
      clientId,
      category: "bot",
      severity: "info",
      title: "Goal conflict auto-resolved",
      body: `Goal "${lowerPriorityGoal.objective}" paused — resources reallocated to higher-priority "${higherPriorityGoal.objective}".`,
      link: "/command-center",
      metadata: { lowerGoalId: lowerPriorityGoal.id, higherGoalId: higherPriorityGoal.id },
      isScheduled: true,
    }).catch(() => {});

    console.log(`[goal-conflict] Auto-resolved: goal #${lowerPriorityGoal.id} paused in favor of #${higherPriorityGoal.id}`);
  }
}

export async function checkGoalConflicts(newAssignmentId?: number) {
  const activeGoals = await db
    .select()
    .from(botAssignmentsTable)
    .where(eq(botAssignmentsTable.isActive, "true"));

  const toCheck = newAssignmentId
    ? activeGoals.filter((g) => g.id === newAssignmentId || g.id !== newAssignmentId)
    : activeGoals;

  const checkedPairs = new Set<string>();

  for (const goalA of toCheck) {
    if (!goalA.clientId) continue;

    const sameClientGoals = activeGoals.filter(
      (g) => g.id !== goalA.id && g.clientId === goalA.clientId && g.botId === goalA.botId,
    );

    for (const goalB of sameClientGoals) {
      const pairKey = [goalA.id, goalB.id].sort((a, b) => a - b).join(":");
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      if (newAssignmentId && goalA.id !== newAssignmentId && goalB.id !== newAssignmentId) continue;

      try {
        const conflict = await analyzeGoalConflict(goalA, goalB);
        if (conflict.hasConflict && conflict.mutuallyExclusiveActions) {
          await resolveConflict(goalA, goalB, conflict, goalA.clientId);
        }
      } catch (err) {
        console.error(`[goal-conflict] Error checking pair ${pairKey}:`, err);
      }
    }
  }
}
