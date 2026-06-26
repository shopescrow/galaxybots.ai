import {
  db,
  coordinatorWeightsTable,
  coordinatorWeightArchiveTable,
  coordinatorClientSettingsTable,
  weightSnapshotsTable,
  abExperimentsTable,
  botsTable,
  clientBotsTable,
  pipelineRunsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import type { CoordinatorPlan, CoordinatorRole, RoleAssignment, TaskCategory, BeliefSuppression } from "@workspace/db";
import { getDomainConfidence } from "./belief-confidence-resolver";
import {
  getCapabilitySignal,
  capabilityNudgeFactor,
  updateCapabilityFromOutcome,
  type CapabilitySignal,
} from "../gaa/self-actualization/capability-model";
import { initializeClientWeightsFromPriors, getGlobalPriors } from "../intelligence/global-priors";
import { resolveSplit } from "../intelligence/ab-experiment";
import { deriveModelTier } from "../conductor/galaxy-conductor";
import { scalingConfig, isScalingActive } from "../scaling/scaling-config";

const TASK_CATEGORIES = ["research", "analysis", "execution", "review", "legal", "financial"] as const;
const COORDINATOR_ROLES: CoordinatorRole[] = ["thinker", "worker", "verifier"];

const DEFAULT_LEARNING_RATE = 0.1;
const DEFAULT_WEIGHT_FLOOR = 0.1;
const DEFAULT_WEIGHT_CEILING = 10.0;
const UCB1_EXPLORATION_CONSTANT = parseFloat(process.env.UCB1_EXPLORATION_CONSTANT ?? "0.3");
export const COORDINATOR_QUALITY_THRESHOLD = 0.7;

const UCB1_SETTING_KEY = "ucb1_exploration_constant";

async function getClientUcb1Constant(clientId?: number): Promise<number> {
  if (clientId == null) return UCB1_EXPLORATION_CONSTANT;
  try {
    const [row] = await db
      .select({ settingValue: coordinatorClientSettingsTable.settingValue })
      .from(coordinatorClientSettingsTable)
      .where(
        and(
          eq(coordinatorClientSettingsTable.clientId, clientId),
          eq(coordinatorClientSettingsTable.settingKey, UCB1_SETTING_KEY),
        ),
      )
      .limit(1);
    return row ? parseFloat(row.settingValue) : UCB1_EXPLORATION_CONSTANT;
  } catch {
    return UCB1_EXPLORATION_CONSTANT;
  }
}

export async function setClientUcb1Constant(clientId: number, constant: number): Promise<void> {
  const clamped = Math.min(2.0, Math.max(0.01, constant));
  await db
    .insert(coordinatorClientSettingsTable)
    .values({
      clientId,
      settingKey: UCB1_SETTING_KEY,
      settingValue: String(clamped),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [coordinatorClientSettingsTable.clientId, coordinatorClientSettingsTable.settingKey],
      set: { settingValue: String(clamped), updatedAt: new Date() },
    });
  console.log(`[GalaxyCoordinator] Client ${clientId} UCB1 constant set to ${clamped}`);
}

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

function ucb1Score(
  weight: number,
  sampleCount: number,
  totalTrials: number,
  explorationConstant = UCB1_EXPLORATION_CONSTANT,
): number {
  if (totalTrials === 0) return weight;
  const explorationBonus = explorationConstant * Math.sqrt(Math.log(totalTrials + 1) / (sampleCount + 1));
  return weight + explorationBonus;
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

/**
 * Bound the candidate set before softmax sampling so role selection scales sub-linearly
 * with fleet size. When the pool exceeds the configured threshold, shortlist the top
 * candidates by their (already-computed) UCB1 weight — preserving the highest-scoring
 * arms so selection quality is equivalent — instead of softmax-sampling the whole fleet
 * on every assignment. Below the threshold the pool is returned unchanged.
 */
function shortlistCandidates(
  candidates: Array<{ botId: number; botName: string; weight: number }>,
  poolSize: number,
): Array<{ botId: number; botName: string; weight: number }> {
  if (!isScalingActive(scalingConfig.roleSelection, poolSize)) return candidates;
  const k = Math.max(scalingConfig.roleSelection.threshold, Math.ceil(Math.sqrt(candidates.length)));
  if (candidates.length <= k) return candidates;
  return [...candidates].sort((a, b) => b.weight - a.weight).slice(0, k);
}

interface WeightRow {
  weight: number;
  sampleCount: number;
}

async function getOrSeedWeights(
  botIds: number[],
  taskCategory: TaskCategory,
  clientId?: number,
): Promise<Map<number, Record<CoordinatorRole, WeightRow>>> {
  const filterClauses = [
    inArray(coordinatorWeightsTable.botId, botIds),
    eq(coordinatorWeightsTable.taskCategory, taskCategory),
  ];
  if (clientId != null) {
    filterClauses.push(eq(coordinatorWeightsTable.clientId, clientId));
  }

  let existing = await db
    .select()
    .from(coordinatorWeightsTable)
    .where(and(...filterClauses));

  if (clientId != null && existing.length === 0 && botIds.length > 0) {
    const [anyClientRow] = await db
      .select({ id: coordinatorWeightsTable.id })
      .from(coordinatorWeightsTable)
      .where(eq(coordinatorWeightsTable.clientId, clientId))
      .limit(1);

    if (!anyClientRow) {
      const [volumeRow] = await db
        .select({ total: sql<number>`COALESCE(SUM(${coordinatorWeightsTable.sampleCount}), 0)` })
        .from(coordinatorWeightsTable)
        .where(eq(coordinatorWeightsTable.clientId, clientId));
      const totalClientRuns = Number(volumeRow?.total ?? 0);
      await initializeClientWeightsFromPriors(clientId, botIds, totalClientRuns).catch((err) =>
        console.warn("[GalaxyCoordinator] Prior initialization failed, using uniform weights:", err),
      );

      existing = await db
        .select()
        .from(coordinatorWeightsTable)
        .where(and(...filterClauses));
    }
  }

  const weightMap = new Map<number, Record<CoordinatorRole, WeightRow>>();
  for (const botId of botIds) {
    weightMap.set(botId, {
      thinker: { weight: 1.0, sampleCount: 0 },
      worker: { weight: 1.0, sampleCount: 0 },
      verifier: { weight: 1.0, sampleCount: 0 },
    });
  }
  for (const row of existing) {
    const entry = weightMap.get(row.botId);
    if (entry) {
      entry[row.role as CoordinatorRole] = {
        weight: parseFloat(row.weight),
        sampleCount: row.sampleCount ?? 0,
      };
    }
  }

  const missingRows: Array<{ botId: number; clientId?: number; taskCategory: string; role: string; weight: string; sampleCount: number }> = [];
  for (const botId of botIds) {
    for (const role of COORDINATOR_ROLES) {
      const hasRow = existing.some((e) => e.botId === botId && e.role === role);
      if (!hasRow) {
        missingRows.push({ botId, ...(clientId != null ? { clientId } : {}), taskCategory, role, weight: "1.0", sampleCount: 0 });
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

export async function assignRoles(
  taskDescription: string,
  steps: Array<{ stepIndex: number; botId: number; botName: string; botTitle: string; botDepartment: string }>,
  taskCategoryOverride?: TaskCategory,
  clientId?: number,
  sessionId?: string,
): Promise<CoordinatorPlan> {
  if (steps.length === 0) throw new Error("No steps provided for role assignment");

  const taskCategory: TaskCategory = taskCategoryOverride ?? inferTaskCategory(taskDescription);
  const uniqueBotIds = [...new Set(steps.map((s) => s.botId))];

  const clientUcb1Constant = await getClientUcb1Constant(clientId).catch(() => UCB1_EXPLORATION_CONSTANT);

  let weightMap = await getOrSeedWeights(uniqueBotIds, taskCategory, clientId);

  if (clientId != null && sessionId) {
    try {
      const variant = await resolveSplit(clientId, sessionId);
      if (variant === "control") {
        const [experiment] = await db
          .select({ controlSnapshotId: abExperimentsTable.controlSnapshotId })
          .from(abExperimentsTable)
          .where(
            and(
              eq(abExperimentsTable.clientId, clientId),
              eq(abExperimentsTable.status, "running"),
            ),
          )
          .limit(1);

        if (experiment?.controlSnapshotId) {
          const [snapshot] = await db
            .select({ data: weightSnapshotsTable.data })
            .from(weightSnapshotsTable)
            .where(eq(weightSnapshotsTable.id, experiment.controlSnapshotId));

          if (snapshot?.data) {
            const snapData = snapshot.data as {
              coordinator?: Array<{ botId: number; taskCategory: string; role: string; weight: string; sampleCount: number }>;
            };
            const overrideMap = new Map<number, Record<CoordinatorRole, WeightRow>>();
            for (const row of snapData.coordinator ?? []) {
              if (row.taskCategory !== taskCategory) continue;
              if (!overrideMap.has(row.botId)) {
                overrideMap.set(row.botId, {
                  thinker: { weight: 1.0, sampleCount: 0 },
                  worker: { weight: 1.0, sampleCount: 0 },
                  verifier: { weight: 1.0, sampleCount: 0 },
                });
              }
              const entry = overrideMap.get(row.botId)!;
              entry[row.role as CoordinatorRole] = {
                weight: parseFloat(row.weight),
                sampleCount: row.sampleCount ?? 0,
              };
            }
            if (overrideMap.size > 0) {
              weightMap = overrideMap;
              console.log(`[GalaxyCoordinator] A/B control: session=${sessionId} using snapshot #${experiment.controlSnapshotId} weights`);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[GalaxyCoordinator] A/B split resolution failed, using treatment weights:", err);
    }
  }

  const totalTrials = Array.from(weightMap.values()).reduce(
    (sum, roles) => sum + Object.values(roles).reduce((s, r) => s + r.sampleCount, 0),
    0,
  );

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

  // Self-actualization capability self-model: a bounded, confidence-weighted
  // nudge applied to each bot's effective weight. Strong, confident capability
  // in this category nudges selection up; confident weakness nudges it down.
  // Always falls back to a neutral 1.0 nudge when there is no evidence.
  const capabilitySignalMap = new Map<number, CapabilitySignal>();
  await Promise.all(
    uniqueBotIds.map(async (botId) => {
      const signal = await getCapabilitySignal(botId, taskCategory, clientId).catch(
        () => null,
      );
      if (signal) capabilitySignalMap.set(botId, signal);
    }),
  );

  const effectiveWeightMap = new Map<number, Record<CoordinatorRole, number>>();
  for (const [botId, roles] of weightMap.entries()) {
    const beliefConf = beliefConfidenceMap.get(botId) ?? 0.5;
    const isSuppressed = suppressedFromThinker.has(botId);
    const capSignal = capabilitySignalMap.get(botId);
    const capNudge = capSignal ? capabilityNudgeFactor(capSignal) : 1.0;

    const thinkerUcb1 = isSuppressed
      ? 0
      : ucb1Score(
          roles.thinker.weight * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA),
          roles.thinker.sampleCount,
          totalTrials,
          clientUcb1Constant,
        ) * capNudge;
    const workerUcb1 = ucb1Score(
      roles.worker.weight * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA),
      roles.worker.sampleCount,
      totalTrials,
      clientUcb1Constant,
    ) * capNudge;
    const verifierUcb1 = ucb1Score(
      roles.verifier.weight * BELIEF_BLEND_ALPHA + beliefConf * (1 - BELIEF_BLEND_ALPHA),
      roles.verifier.sampleCount,
      totalTrials,
      clientUcb1Constant,
    ) * capNudge;

    effectiveWeightMap.set(botId, {
      thinker: thinkerUcb1,
      worker: workerUcb1,
      verifier: verifierUcb1,
    });

    const step = steps.find((s) => s.botId === botId);
    if (step) {
      console.log(
        `[GalaxyCoordinator] UCB1: bot=${step.botName}(${botId}) beliefConf=${beliefConf.toFixed(3)} ` +
        `capNudge=${capNudge.toFixed(3)}${capSignal ? `(${capSignal.strengthTier})` : ""} ` +
        `thinker=${thinkerUcb1.toFixed(4)}(n=${roles.thinker.sampleCount}) worker=${workerUcb1.toFixed(4)}(n=${roles.worker.sampleCount}) ` +
        `verifier=${verifierUcb1.toFixed(4)}(n=${roles.verifier.sampleCount}) totalTrials=${totalTrials}${isSuppressed ? " [THINKER SUPPRESSED]" : ""}`,
      );
    }
  }

  const weightsSnapshot: Record<string, Record<string, number>> = {};
  for (const [botId, roles] of weightMap.entries()) {
    const step = steps.find((s) => s.botId === botId);
    if (step) {
      const effective = effectiveWeightMap.get(botId) ?? { thinker: 1, worker: 1, verifier: 1 };
      weightsSnapshot[`${step.botName}(${botId})`] = {
        thinker: roles.thinker.weight,
        worker: roles.worker.weight,
        verifier: roles.verifier.weight,
        thinkerSamples: roles.thinker.sampleCount,
        workerSamples: roles.worker.sampleCount,
        verifierSamples: roles.verifier.sampleCount,
        effectiveThinker: effective.thinker,
        effectiveWorker: effective.worker,
        effectiveVerifier: effective.verifier,
        beliefConfidence: beliefConfidenceMap.get(botId) ?? 0.5,
      };
    }
  }

  const n = steps.length;

  const makeBestCandidates = (
    role: CoordinatorRole,
    botsForRole: typeof steps,
  ) => botsForRole.map((s) => ({
    botId: s.botId,
    botName: s.botName,
    weight: effectiveWeightMap.get(s.botId)?.[role] ?? weightMap.get(s.botId)?.[role]?.weight ?? 1.0,
  }));

  const makeAssignment = (
    selected: { botId: number; botName: string; weight: number },
    role: CoordinatorRole,
    stepIdx: number,
  ): RoleAssignment => ({
    botId: selected.botId,
    botName: selected.botName,
    role,
    weight: selected.weight,
    reasoning: `Step ${stepIdx} — ${selected.botName} assigned ${role} for ${taskCategory} task (ucb1Score: ${selected.weight.toFixed(4)}, beliefConf: ${(beliefConfidenceMap.get(selected.botId) ?? 0.5).toFixed(3)})`,
  });

  // Phase 1 — UCB1-driven bot selection: use role-specific UCB1 scores to pick the best
  // bot for each role from the deduplicated bot pool.
  const uniqueSteps = Array.from(new Map(steps.map((s) => [s.botId, s])).values());

  const poolSize = uniqueSteps.length;

  const eligibleThinkers = uniqueSteps.filter((s) => !suppressedFromThinker.has(s.botId));
  const thinkerCandidatePool = eligibleThinkers.length > 0 ? eligibleThinkers : uniqueSteps;
  const thinkerCandidate = n >= 3
    ? softmaxSample(shortlistCandidates(makeBestCandidates("thinker", thinkerCandidatePool), poolSize))
    : null;

  const workerCandidatePool = thinkerCandidate
    ? uniqueSteps.filter((s) => s.botId !== thinkerCandidate.botId)
    : uniqueSteps;
  const workerCandidate = softmaxSample(
    shortlistCandidates(makeBestCandidates("worker", workerCandidatePool.length > 0 ? workerCandidatePool : uniqueSteps), poolSize),
  );

  const verifierCandidatePool = uniqueSteps.filter(
    (s) => s.botId !== workerCandidate.botId && (!thinkerCandidate || s.botId !== thinkerCandidate.botId),
  );
  const verifierCandidate = n >= 2
    ? softmaxSample(shortlistCandidates(makeBestCandidates("verifier", verifierCandidatePool.length > 0 ? verifierCandidatePool : uniqueSteps), poolSize))
    : null;

  // Phase 2 — Execution-order preservation: sort the UCB1-selected bots by step index,
  // then assign roles positionally so that verifier always maps to the last executed step
  // and worker always precedes verifier. This preserves the orchestration invariant while
  // still allowing UCB1 scores to drive which bots are nominated for each role.
  const selectedBotIds = [
    ...(thinkerCandidate ? [thinkerCandidate.botId] : []),
    workerCandidate.botId,
    ...(verifierCandidate ? [verifierCandidate.botId] : []),
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  const selectedStepsSorted = selectedBotIds
    .map((botId) => steps.find((s) => s.botId === botId) ?? null)
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.stepIndex - b.stepIndex);

  const roleByStepIndex: Record<number, CoordinatorRole> = {};
  for (const s of steps) {
    roleByStepIndex[s.stepIndex] = "worker"; // default
  }
  if (selectedStepsSorted.length >= 3) {
    roleByStepIndex[selectedStepsSorted[0].stepIndex] = "thinker";
    roleByStepIndex[selectedStepsSorted[selectedStepsSorted.length - 1].stepIndex] = "verifier";
  } else if (selectedStepsSorted.length === 2) {
    roleByStepIndex[selectedStepsSorted[selectedStepsSorted.length - 1].stepIndex] = "verifier";
  }

  // Invariant enforcement: verifier MUST be the absolute final execution step.
  // If UCB1 assigned verifier to a selected step that is not the last step overall,
  // relocate it to the highest stepIndex in the pipeline so no worker step can run
  // after the verifier gate.
  const maxStepIndex = Math.max(...steps.map((s) => s.stepIndex));
  const currentVerifierStepIndex = steps.find((s) => roleByStepIndex[s.stepIndex] === "verifier")?.stepIndex;
  if (currentVerifierStepIndex !== undefined && currentVerifierStepIndex !== maxStepIndex) {
    roleByStepIndex[currentVerifierStepIndex] = "worker";
    roleByStepIndex[maxStepIndex] = "verifier";
  } else if (currentVerifierStepIndex === undefined && n >= 2) {
    roleByStepIndex[maxStepIndex] = "verifier";
  }

  // Resolve final step references for plan construction
  const thinkerStepFinal = selectedStepsSorted[0] ?? steps[0];
  const verifierStepFinal = steps.find((s) => s.stepIndex === maxStepIndex) ?? steps[n - 1];
  const workerStepFinal =
    steps.find((s) => roleByStepIndex[s.stepIndex] === "worker") ?? steps[Math.min(1, n - 1)];

  const thinker = makeAssignment(
    {
      botId: thinkerStepFinal.botId,
      botName: thinkerStepFinal.botName,
      weight: effectiveWeightMap.get(thinkerStepFinal.botId)?.thinker ?? 1.0,
    },
    "thinker",
    thinkerStepFinal.stepIndex,
  );
  const worker = makeAssignment(
    {
      botId: workerStepFinal.botId,
      botName: workerStepFinal.botName,
      weight: effectiveWeightMap.get(workerStepFinal.botId)?.worker ?? 1.0,
    },
    "worker",
    workerStepFinal.stepIndex,
  );
  const verifier = makeAssignment(
    {
      botId: verifierStepFinal.botId,
      botName: verifierStepFinal.botName,
      weight: effectiveWeightMap.get(verifierStepFinal.botId)?.verifier ?? 1.0,
    },
    "verifier",
    verifierStepFinal.stepIndex,
  );

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
  modelVersion?: string,
  clientId?: number,
  abVariant?: "control" | "treatment",
  modelTier?: string,
  residualizedQuality?: number,
): Promise<void> {
  if (abVariant === "control") {
    console.log(
      `[GalaxyCoordinator] Skipping weight update for control-group session (category=${taskCategory}, clientId=${clientId ?? "global"})`,
    );
    return;
  }

  const resolvedModelTier = modelTier ?? (modelVersion ? deriveModelTier(modelVersion) : undefined);

  // Use confound-residualized quality when provided; fall back to raw quality for backward compatibility.
  const effectiveQuality = residualizedQuality ?? qualityScore;
  const isSuccess = effectiveQuality >= COORDINATOR_QUALITY_THRESHOLD;

  // Self-actualization: feed the capability self-model from this outcome. One
  // update per distinct bot (the bot's competence in this category is a
  // bot-level property, independent of the role it played). Fully fault-isolated.
  const capabilityBotIds = new Set(roleAssignments.map((a) => a.botId));
  for (const botId of capabilityBotIds) {
    await updateCapabilityFromOutcome({
      botId,
      taskCategory,
      quality: effectiveQuality,
      clientId,
    });
  }

  for (const assignment of roleAssignments) {
    try {
      const filterClauses = [
        eq(coordinatorWeightsTable.botId, assignment.botId),
        eq(coordinatorWeightsTable.taskCategory, taskCategory),
        eq(coordinatorWeightsTable.role, assignment.role),
      ];
      if (clientId != null) {
        filterClauses.push(eq(coordinatorWeightsTable.clientId, clientId));
      } else {
        filterClauses.push(sql`${coordinatorWeightsTable.clientId} IS NULL`);
      }

      const [existing] = await db
        .select()
        .from(coordinatorWeightsTable)
        .where(and(...filterClauses));

      const currentWeight = existing ? parseFloat(existing.weight) : 1.0;
      const currentSampleCount = existing?.sampleCount ?? 0;

      const bayesianLR = learningRate / Math.sqrt(currentSampleCount + 1);
      const factor = isSuccess ? 1 + bayesianLR * effectiveQuality : 1 - bayesianLR * (1 - effectiveQuality);
      const newWeight = Math.min(weightCeiling, Math.max(weightFloor, currentWeight * factor));
      const newSampleCount = currentSampleCount + 1;

      if (clientId != null) {
        await db
          .insert(coordinatorWeightsTable)
          .values({
            botId: assignment.botId,
            clientId,
            taskCategory,
            role: assignment.role,
            weight: String(newWeight),
            sampleCount: newSampleCount,
            modelVersion: modelVersion ?? null,
            modelTier: resolvedModelTier ?? null,
            lastUpdated: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              coordinatorWeightsTable.clientId,
              coordinatorWeightsTable.botId,
              coordinatorWeightsTable.taskCategory,
              coordinatorWeightsTable.role,
            ],
            set: {
              weight: String(newWeight),
              sampleCount: newSampleCount,
              modelVersion: modelVersion ?? null,
              modelTier: resolvedModelTier ?? null,
              lastUpdated: new Date(),
            },
          });
      } else {
        if (existing) {
          await db
            .update(coordinatorWeightsTable)
            .set({
              weight: String(newWeight),
              sampleCount: newSampleCount,
              modelVersion: modelVersion ?? null,
              modelTier: resolvedModelTier ?? null,
              lastUpdated: new Date(),
            })
            .where(eq(coordinatorWeightsTable.id, existing.id));
        } else {
          await db
            .insert(coordinatorWeightsTable)
            .values({
              botId: assignment.botId,
              taskCategory,
              role: assignment.role,
              weight: String(newWeight),
              sampleCount: newSampleCount,
              modelVersion: modelVersion ?? null,
              modelTier: resolvedModelTier ?? null,
              lastUpdated: new Date(),
            })
            .onConflictDoNothing();
        }
      }

      console.log(
        `[GalaxyCoordinator] Weight update: bot=${assignment.botName}(${assignment.botId}) role=${assignment.role} category=${taskCategory} ` +
        `${currentWeight.toFixed(4)} → ${newWeight.toFixed(4)} (${isSuccess ? "success" : "failure"}, q=${qualityScore.toFixed(2)}, bayesianLR=${bayesianLR.toFixed(4)}, n=${newSampleCount})`,
      );
    } catch (err) {
      console.error("[GalaxyCoordinator] Weight update error:", err);
    }
  }
}

export async function detectModelVersionChange(
  taskCategory: TaskCategory,
  currentModelVersion: string,
  clientId?: number,
): Promise<boolean> {
  try {
    const filterClauses = [
      eq(coordinatorWeightsTable.taskCategory, taskCategory),
    ];
    if (clientId != null) {
      filterClauses.push(eq(coordinatorWeightsTable.clientId, clientId));
    }

    const [latestRow] = await db
      .select({ modelVersion: coordinatorWeightsTable.modelVersion })
      .from(coordinatorWeightsTable)
      .where(and(...filterClauses))
      .orderBy(desc(coordinatorWeightsTable.lastUpdated))
      .limit(1);

    if (!latestRow?.modelVersion) return false;

    return latestRow.modelVersion !== currentModelVersion;
  } catch {
    return false;
  }
}

export async function archiveAndRebaseWeights(
  taskCategory: TaskCategory,
  oldModelVersion: string,
  newModelVersion: string,
  clientId?: number,
): Promise<void> {
  try {
    const filterClauses = [
      eq(coordinatorWeightsTable.taskCategory, taskCategory),
    ];
    if (clientId != null) {
      filterClauses.push(eq(coordinatorWeightsTable.clientId, clientId));
    }

    const currentWeights = await db
      .select()
      .from(coordinatorWeightsTable)
      .where(and(...filterClauses));

    if (currentWeights.length === 0) return;

    await db.insert(coordinatorWeightArchiveTable).values(
      currentWeights.map((w) => ({
        clientId: w.clientId,
        botId: w.botId,
        taskCategory: w.taskCategory,
        role: w.role,
        weight: w.weight,
        sampleCount: w.sampleCount ?? 0,
        modelVersion: w.modelVersion,
        reason: "model_version_change",
        archivedAt: new Date(),
      })),
    );

    const priorMap = await getGlobalPriors(newModelVersion).catch(() => new Map<string, number>());

    for (const w of currentWeights) {
      const priorKey = `${w.taskCategory}::${w.role}`;
      const priorWeight = priorMap.get(priorKey) ?? 1.0;
      await db
        .update(coordinatorWeightsTable)
        .set({
          weight: String(Math.max(0.1, Math.min(10.0, priorWeight))),
          sampleCount: 0,
          modelVersion: newModelVersion,
          lastUpdated: new Date(),
        })
        .where(
          and(
            eq(coordinatorWeightsTable.id, w.id),
          ),
        );
    }

    console.log(
      `[GalaxyCoordinator] Rebasing event: category=${taskCategory} ${oldModelVersion} → ${newModelVersion}, archived ${currentWeights.length} rows`,
    );
  } catch (err) {
    console.error("[GalaxyCoordinator] archiveAndRebaseWeights failed:", err);
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
    Record<string, Array<{ botId: number; botName: string; role: string; weight: number; sampleCount: number }>>
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
      sampleCount: coordinatorWeightsTable.sampleCount,
    })
    .from(coordinatorWeightsTable)
    .leftJoin(botsTable, eq(coordinatorWeightsTable.botId, botsTable.id));

  const weights = allowedBotIds
    ? await baseQuery.where(inArray(coordinatorWeightsTable.botId, allowedBotIds))
    : await baseQuery;

  const categories: Record<
    string,
    Record<string, Array<{ botId: number; botName: string; role: string; weight: number; sampleCount: number }>>
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
      sampleCount: row.sampleCount ?? 0,
    });
  }

  for (const cat of Object.values(categories)) {
    for (const roleList of Object.values(cat)) {
      roleList.sort((a, b) => b.weight - a.weight);
    }
  }

  return { categories, totalWeights: weights.length };
}
