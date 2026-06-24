import { db, coordinatorWeightsTable, botsTable, clientBotsTable, pipelineRunsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import type { CoordinatorPlan, CoordinatorRole, RoleAssignment, TaskCategory, BeliefSuppression } from "@workspace/db";
import { getDomainConfidence } from "./belief-confidence-resolver";

const TASK_CATEGORIES = ["research", "analysis", "execution", "review", "legal", "financial"] as const;
const COORDINATOR_ROLES: CoordinatorRole[] = ["thinker", "worker", "verifier"];

const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_WEIGHT_FLOOR = 0.1;
const DEFAULT_WEIGHT_CEILING = 10.0;
export const COORDINATOR_QUALITY_THRESHOLD = 0.7;

const BELIEF_BLEND_ALPHA = 0.6;

export const ROLE_PROMPTS: Record<CoordinatorRole, string> = {
  thinker:
    "\n[COORDINATOR ROLE: THINKER] Your role in this pipeline step is to explore, hypothesize, and reason broadly. Consider multiple angles, surface non-obvious insights, and lay the conceptual groundwork that the Worker will act upon. Prioritize depth of analysis over immediate action.",
  worker:
    "\n[COORDINATOR ROLE: WORKER] Your role in this pipeline step is to execute precisely. Take the groundwork provided and produce a concrete, complete deliverable. Be thorough, accurate, and actionable. Your output will be critically evaluated by the Verifier.",
  verifier:
    "\n[COORDINATOR ROLE: VERIFIER] Your role in this pipeline step is to critically evaluate the Worker's output and flag any gaps, errors, or missing elements. Check completeness, accuracy, and relevance against the original instruction. Be specific about what is missing or incorrect.",
};

function inferTaskCategory(taskDescription: string): TaskCategory {
  const text = taskDescription.toLowerCase();
  if (text.includes("legal") || text.includes("compliance") || text.includes("contract")) return "legal";
  if (text.includes("financ") || text.includes("budget") || text.includes("revenue") || text.includes("cost")) return "financial";
  if (text.includes("research") || text.includes("gather") || text.includes("collect") || text.includes("find")) return "research";
  if (text.includes("analys") || text.includes("analyz") || text.includes("evaluate") || text.includes("assess")) return "analysis";
  if (text.includes("review") || text.includes("audit") || text.includes("check") || text.includes("verify")) return "review";
  return "execution";
}

function softmaxSample(
  items: Array<{ botId: number; botName: string; weight: number }>,
): (typeof items)[0] {
  if (items.length === 0) throw new Error("Cannot sample from empty set");
  if (items.length === 1) return items[0];
  const maxW = Math.max(...items.map((i) => i.weight));
  const exps = items.map((i) => Math.exp(i.weight - maxW));
  const total = exps.reduce((s, e) => s + e, 0);
  const probs = exps.map((e) => e / total);
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < items.length; i++) {
    cumulative += probs[i];
    if (r <= cumulative) return items[i];
  }
  return items[items.length - 1];
}

async function getOrSeedWeights(
  botIds: number[],
  taskCategory: TaskCategory,
): Promise<Map<number, Record<CoordinatorRole, number>>> {
  const existing = await db
    .select()
    .from(coordinatorWeightsTable)
    .where(
      and(
        inArray(coordinatorWeightsTable.botId, botIds),
        eq(coordinatorWeightsTable.taskCategory, taskCategory),
      ),
    );

  const weightMap = new Map<number, Record<CoordinatorRole, number>>();
  for (const botId of botIds) {
    weightMap.set(botId, { thinker: 1.0, worker: 1.0, verifier: 1.0 });
  }
  for (const row of existing) {
    const entry = weightMap.get(row.botId);
    if (entry) {
      entry[row.role as CoordinatorRole] = parseFloat(row.weight);
    }
  }

  const missingRows: Array<{ botId: number; taskCategory: string; role: string; weight: string }> = [];
  for (const botId of botIds) {
    for (const role of COORDINATOR_ROLES) {
      const hasRow = existing.some((e) => e.botId === botId && e.role === role);
      if (!hasRow) {
        missingRows.push({ botId, taskCategory, role, weight: "1.0" });
      }
    }
  }

  if (missingRows.length > 0) {
    await db
      .insert(coordinatorWeightsTable)
      .values(missingRows)
      .onConflictDoNothing()
      .catch((err) => console.error("[GalaxyCoordinator] Seed weights error:", err));
  }

  return weightMap;
}

/**
 * Assign Thinker / Worker / Verifier roles via step-position guarantee + softmax.
 *
 * Roles are mapped to STEP INDICES (0-based), not to bot IDs:
 *   N=1 : { 0: "worker" }
 *   N=2 : { 0: "worker", 1: "verifier" }
 *   N≥3 : { 0: "thinker", 1..N-2: "worker", N-1: "verifier" }
 *
 * This guarantees:
 *   - Verifier step ALWAYS follows the Worker step in execution order.
 *   - No role collision: step index is the unique key, not bot ID.
 *   - Works correctly for 1/2/N-bot pipelines.
 *
 * The thinker/worker/verifier fields on the plan identify the BEST bot (by
 * weight) for each role — used for system-prompt context and weight updates.
 *
 * Belief confidence from the Belief System modulates effective weights:
 *   effectiveWeight = historicalWeight * beliefBlendAlpha + beliefConfidence * (1 - beliefBlendAlpha)
 * Bots with active contradictions in the task domain are suppressed from the Thinker role.
 */
export async function assignRoles(
  taskDescription: string,
  steps: Array<{ stepIndex: number; botId: number; botName: string; botTitle: string; botDepartment: string }>,
  taskCategoryOverride?: TaskCategory,
  clientId?: number,
): Promise<CoordinatorPlan> {
  if (steps.length === 0) throw new Error("No steps provided for role assignment");

  const taskCategory: TaskCategory = taskCategoryOverride ?? inferTaskCategory(taskDescription);
  const uniqueBotIds = [...new Set(steps.map((s) => s.botId))];
  const weightMap = await getOrSeedWeights(uniqueBotIds, taskCategory);

  // ── Belief confidence resolution ─────────────────────────────────────────────
  const beliefResults = await Promise.all(
    uniqueBotIds.map(async (botId) => {
      const result = await getDomainConfidence(botId, taskCategory, clientId).catch((err) => {
        console.warn(`[GalaxyCoordinator] Belief confidence fetch failed for bot ${botId}:`, err);
        return null;
      });
      return { botId, result };
    }),
  );

  const beliefConfidenceMap = new Map<number, number>();
  const beliefSuppressions: BeliefSuppression[] = [];

  for (const { botId, result } of beliefResults) {
    const confidence = result?.averageConfidence ?? 0.5;
    beliefConfidenceMap.set(botId, confidence);

    if (result?.hasActiveContradiction && result.contradictionRef) {
      beliefSuppressions.push({
        botId,
        role: "thinker",
        reason: "active_contradiction",
        contradictionRef: result.contradictionRef,
      });
      console.log(
        `[GalaxyCoordinator] Bot ${botId} suppressed from Thinker role — active contradiction: ${result.contradictionRef}`,
      );
    }
  }

  const suppressedFromThinker = new Set(beliefSuppressions.map((s) => s.botId));

  // ── Apply belief blending to historical weights ───────────────────────────────
  const effectiveWeightMap = new Map<number, Record<CoordinatorRole, number>>();
  for (const [botId, roles] of weightMap.entries()) {
    const beliefConf = beliefConfidenceMap.get(botId) ?? 0.5;
    const isSuppressed = suppressedFromThinker.has(botId);

    const effectiveThinker = isSuppressed
      ? 0
      : roles.thinker * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA);
    const effectiveWorker = roles.worker * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA);
    const effectiveVerifier = roles.verifier * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA);

    effectiveWeightMap.set(botId, {
      thinker: effectiveThinker,
      worker: effectiveWorker,
      verifier: effectiveVerifier,
    });

    const step = steps.find((s) => s.botId === botId);
    if (step) {
      console.log(
        `[GalaxyCoordinator] Belief blend: bot=${step.botName}(${botId}) beliefConf=${beliefConf.toFixed(3)} ` +
        `effectiveThinker=${effectiveThinker.toFixed(4)} effectiveWorker=${effectiveWorker.toFixed(4)} ` +
        `effectiveVerifier=${effectiveVerifier.toFixed(4)}${isSuppressed ? " [THINKER SUPPRESSED]" : ""}`,
      );
    }
  }

  const weightsSnapshot: Record<string, Record<string, number>> = {};
  for (const [botId, roles] of weightMap.entries()) {
    const step = steps.find((s) => s.botId === botId);
    if (step) {
      const effective = effectiveWeightMap.get(botId) ?? roles;
      weightsSnapshot[`${step.botName}(${botId})`] = {
        thinker: roles.thinker,
        worker: roles.worker,
        verifier: roles.verifier,
        effectiveThinker: effective.thinker,
        effectiveWorker: effective.worker,
        effectiveVerifier: effective.verifier,
        beliefConfidence: beliefConfidenceMap.get(botId) ?? 0.5,
      };
    }
  }

  // ── Step-index → role mapping ────────────────────────────────────────────────
  const roleByStepIndex: Record<number, CoordinatorRole> = {};
  const n = steps.length;

  if (n === 1) {
    roleByStepIndex[0] = "worker";
  } else if (n === 2) {
    roleByStepIndex[0] = "worker";
    roleByStepIndex[1] = "verifier";
  } else {
    roleByStepIndex[0] = "thinker";
    for (let i = 1; i < n - 1; i++) roleByStepIndex[i] = "worker";
    roleByStepIndex[n - 1] = "verifier";
  }

  // ── Identify best bot for each canonical role (using effective weights) ───────
  const makeBestCandidates = (
    role: CoordinatorRole,
    botsForRole: typeof steps,
  ) => botsForRole.map((s) => ({
    botId: s.botId,
    botName: s.botName,
    weight: effectiveWeightMap.get(s.botId)?.[role] ?? weightMap.get(s.botId)?.[role] ?? 1.0,
  }));

  // Thinker: bot assigned to the Thinker step (step 0 when N≥3; otherwise first Worker)
  const thinkerStep = steps.find((s) => roleByStepIndex[s.stepIndex] === "thinker")
    ?? steps[0];

  // Worker: pick the Worker step with highest effective weight
  const workerSteps = steps.filter((s) => roleByStepIndex[s.stepIndex] === "worker");
  const workerSelected = softmaxSample(
    makeBestCandidates("worker", workerSteps.length > 0 ? workerSteps : steps),
  );

  // Verifier: bot assigned to the last step (always the Verifier step when N≥2)
  const verifierStep = steps[n - 1];
  const verifierSelected = {
    botId: verifierStep.botId,
    botName: verifierStep.botName,
    weight: effectiveWeightMap.get(verifierStep.botId)?.verifier ?? weightMap.get(verifierStep.botId)?.verifier ?? 1.0,
  };

  const makeAssignment = (
    selected: { botId: number; botName: string; weight: number },
    role: CoordinatorRole,
    stepIdx: number,
  ): RoleAssignment => ({
    botId: selected.botId,
    botName: selected.botName,
    role,
    weight: selected.weight,
    reasoning: `Step ${stepIdx} — ${selected.botName} assigned ${role} for ${taskCategory} task (effectiveWeight: ${selected.weight.toFixed(4)}, beliefConf: ${(beliefConfidenceMap.get(selected.botId) ?? 0.5).toFixed(3)})`,
  });

  const thinker = makeAssignment(
    {
      botId: thinkerStep.botId,
      botName: thinkerStep.botName,
      weight: effectiveWeightMap.get(thinkerStep.botId)?.thinker ?? weightMap.get(thinkerStep.botId)?.thinker ?? 1.0,
    },
    "thinker",
    thinkerStep.stepIndex,
  );
  const worker = makeAssignment(workerSelected, "worker", steps.find((s) => s.botId === workerSelected.botId)?.stepIndex ?? 0);
  const verifier = makeAssignment(verifierSelected, "verifier", n - 1);

  const roleAssignments = [thinker, worker, verifier];

  return {
    taskCategory,
    taskDescription,
    thinker,
    worker,
    verifier,
    roleAssignments,
    roleByStepIndex,
    timestamp: Date.now(),
    weightsSnapshot,
    beliefSuppressions: beliefSuppressions.length > 0 ? beliefSuppressions : undefined,
  };
}

export function getRoleSystemPromptAddition(role: CoordinatorRole | null): string {
  if (!role) return "";
  return ROLE_PROMPTS[role];
}

export async function updateRoutingWeights(
  roleAssignments: RoleAssignment[],
  taskCategory: TaskCategory,
  qualityScore: number,
  learningRate = DEFAULT_LEARNING_RATE,
  weightFloor = DEFAULT_WEIGHT_FLOOR,
  weightCeiling = DEFAULT_WEIGHT_CEILING,
): Promise<void> {
  const isSuccess = qualityScore >= COORDINATOR_QUALITY_THRESHOLD;
  const factor = isSuccess ? 1 + learningRate : 1 - learningRate;

  for (const assignment of roleAssignments) {
    try {
      const [existing] = await db
        .select()
        .from(coordinatorWeightsTable)
        .where(
          and(
            eq(coordinatorWeightsTable.botId, assignment.botId),
            eq(coordinatorWeightsTable.taskCategory, taskCategory),
            eq(coordinatorWeightsTable.role, assignment.role),
          ),
        );

      const currentWeight = existing ? parseFloat(existing.weight) : 1.0;
      const newWeight = Math.min(weightCeiling, Math.max(weightFloor, currentWeight * factor));

      await db
        .insert(coordinatorWeightsTable)
        .values({
          botId: assignment.botId,
          taskCategory,
          role: assignment.role,
          weight: String(newWeight),
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            coordinatorWeightsTable.botId,
            coordinatorWeightsTable.taskCategory,
            coordinatorWeightsTable.role,
          ],
          set: {
            weight: String(newWeight),
            lastUpdated: new Date(),
          },
        });

      console.log(
        `[GalaxyCoordinator] Weight update: bot=${assignment.botName}(${assignment.botId}) role=${assignment.role} category=${taskCategory} ${currentWeight.toFixed(4)} → ${newWeight.toFixed(4)} (${isSuccess ? "success" : "failure"}, q=${qualityScore.toFixed(2)})`,
      );
    } catch (err) {
      console.error("[GalaxyCoordinator] Weight update error:", err);
    }
  }
}

export async function writeCoordinatorTrace(runId: number, plan: CoordinatorPlan): Promise<void> {
  try {
    await db
      .update(pipelineRunsTable)
      .set({ coordinatorTrace: plan as unknown as Record<string, unknown> })
      .where(eq(pipelineRunsTable.id, runId));
  } catch (err) {
    console.error("[GalaxyCoordinator] Failed to write coordinator trace:", err);
  }
}

export async function seedWeightsForAllBots(): Promise<void> {
  const allBots = await db.select({ id: botsTable.id }).from(botsTable);
  const botIds = allBots.map((b) => b.id);
  if (botIds.length === 0) return;

  for (const category of TASK_CATEGORIES) {
    await getOrSeedWeights(botIds, category).catch((err) =>
      console.error(`[GalaxyCoordinator] Seed error for category ${category}:`, err),
    );
  }
  console.log(
    `[GalaxyCoordinator] Seeded weights for ${botIds.length} bots across ${TASK_CATEGORIES.length} task categories`,
  );
}

export async function getCoordinatorStats(clientId?: number): Promise<{
  categories: Record<
    string,
    Record<string, Array<{ botId: number; botName: string; role: string; weight: number }>>
  >;
  totalWeights: number;
}> {
  let allowedBotIds: number[] | null = null;

  if (clientId !== undefined) {
    const clientBotRows = await db
      .select({ botId: clientBotsTable.botId })
      .from(clientBotsTable)
      .where(and(eq(clientBotsTable.clientId, clientId), eq(clientBotsTable.status, "active")));
    allowedBotIds = clientBotRows.map((r) => r.botId);
    if (allowedBotIds.length === 0) {
      return { categories: {}, totalWeights: 0 };
    }
  }

  const baseQuery = db
    .select({
      botId: coordinatorWeightsTable.botId,
      botName: botsTable.name,
      taskCategory: coordinatorWeightsTable.taskCategory,
      role: coordinatorWeightsTable.role,
      weight: coordinatorWeightsTable.weight,
    })
    .from(coordinatorWeightsTable)
    .leftJoin(botsTable, eq(coordinatorWeightsTable.botId, botsTable.id));

  const weights = allowedBotIds
    ? await baseQuery.where(inArray(coordinatorWeightsTable.botId, allowedBotIds))
    : await baseQuery;

  const categories: Record<
    string,
    Record<string, Array<{ botId: number; botName: string; role: string; weight: number }>>
  > = {};

  for (const row of weights) {
    const cat = row.taskCategory;
    const role = row.role;
    if (!categories[cat]) categories[cat] = {};
    if (!categories[cat][role]) categories[cat][role] = [];
    categories[cat][role].push({
      botId: row.botId,
      botName: row.botName ?? `bot-${row.botId}`,
      role,
      weight: parseFloat(row.weight),
    });
  }

  for (const cat of Object.values(categories)) {
    for (const roleList of Object.values(cat)) {
      roleList.sort((a, b) => b.weight - a.weight);
    }
  }

  return { categories, totalWeights: weights.length };
}
