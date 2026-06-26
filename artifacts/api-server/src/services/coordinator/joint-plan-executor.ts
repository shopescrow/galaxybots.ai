import { assignRoles } from "./galaxy-coordinator";
import { selectStrategy, recordStrategyRun, recordStrategyOutcome, recordRunTelemetry, deriveModelTier } from "../conductor/galaxy-conductor";
import { resolveSplit } from "../intelligence/ab-experiment";
import { arbitrate } from "./galaxy-arbitrator";
import { distillForRole } from "./context-distiller";
import { distillBeliefBriefing } from "./belief-distiller";
import { validateCoordinatorOutput } from "./coordination-output-validator";
import {
  checkMidStrategyQuality,
  clearStrategyBreakerSession,
  type TurnOutput,
} from "../conductor/strategy-circuit-breaker";
import { sanitize } from "../conductor/agent-relay-sanitizer";
import {
  executeParallelSynthesis,
  executeSequentialDebate,
  executeHierarchicalDelegation,
  executeRoundRobinReview,
  type StrategyAgent,
  type StrategyInput,
  type StrategyResult,
} from "../conductor/strategies/index";
import type { JointCoordinationPlan } from "./joint-coordination-plan";
import type { AggregationTrace } from "../conductor/aggregation/aggregation-trace";
import { db, abExperimentsTable, weightSnapshotsTable, coordinatorClientSettingsTable, pendingApprovalsTable, coordinatorWeightsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import type { TaskCategory } from "@workspace/db";
import { createNotification } from "../admin/notifications.js";
import { sendPushToClient } from "../admin/push-sender.js";
import type { ConversationTurn, MemoryEntry } from "./context-distiller";
import { scoreJointPlan, type SampleCountMap } from "./confidence-scorer.js";
import { getCategoryPriors } from "../conductor/galaxy-conductor.js";
import {
  checkCircuit,
  acquireHalfOpenProbe,
  releaseHalfOpenProbe,
  recordLatency,
  getCachedStrategy,
  updateStrategyCache,
} from "./orchestration-circuit-breaker.js";
import { guardStrategy } from "../conductor/strategy-budget-guard.js";
import { writeAuditEntry } from "../audit/audit-ledger.js";

export interface JointPlanExecutorInput {
  taskDescription: string;
  userContent: string;
  agents: Array<{
    botId: number;
    botName: string;
    botTitle?: string;
    botDepartment?: string;
    systemPrompt: string;
  }>;
  sessionId: string | number;
  clientId?: number;
  conversationId?: number;
  targetModel?: string;
  taskCategoryOverride?: TaskCategory;
  livingMemory?: MemoryEntry[];
  priorContext?: ConversationTurn[];
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void;
  /**
   * Set to true by the approve handler to bypass the human agency gate on
   * the second pass — prevents infinite gate-loop after approval.
   */
  humanApprovalOverridden?: boolean;
}

export interface JointPlanExecutorResult {
  content: string;
  agentsUsed: string[];
  durationMs: number;
  plan: JointCoordinationPlan;
  reconciled: boolean;
  arbitrationNotes: string[];
  strategyId: number;
  coordinationConfidence?: number;
  /** Set when the human agency gate fired and execution was halted pending approval */
  humanApprovalPending?: boolean;
  /** The pendingApprovalsTable row id when humanApprovalPending is true */
  pendingApprovalId?: number | null;
  /** Aggregation fidelity trace (whether aggregation ran, tree depth, fidelity vs baseline). */
  aggregationTrace?: AggregationTrace;
}

const DEFAULT_TARGET_MODEL = "gpt-5-mini";

export async function execute(input: JointPlanExecutorInput): Promise<JointPlanExecutorResult> {
  const start = Date.now();
  const {
    taskDescription,
    userContent,
    agents,
    sessionId,
    clientId,
    conversationId,
    taskCategoryOverride,
    livingMemory = [],
    priorContext = [],
    onProgress,
    humanApprovalOverridden = false,
  } = input;

  const targetModel = input.targetModel ?? DEFAULT_TARGET_MODEL;
  const sessionKey = String(sessionId);
  // Unique run ID that ties all audit entries for this pipeline invocation together
  const pipelineRunId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // ── Circuit Breaker Check ─────────────────────────────────────────────────────
  const circuitState = checkCircuit();
  const useBypassMode = circuitState === "open";

  // Half-open: only ONE probe is allowed through at a time; all others bypass
  const isHalfOpen = circuitState === "half-open";
  const probeAllowed = isHalfOpen ? acquireHalfOpenProbe() : true;
  const useLightweightBypass = useBypassMode || (isHalfOpen && !probeAllowed);

  if (useBypassMode) {
    console.warn(`[JointPlanExecutor] Orchestration circuit is OPEN — bypassing heavy orchestration for session ${sessionId}`);
  } else if (isHalfOpen && !probeAllowed) {
    console.warn(`[JointPlanExecutor] Circuit HALF-OPEN probe in flight — using bypass for session ${sessionId}`);
  } else if (isHalfOpen) {
    console.log(`[JointPlanExecutor] Circuit HALF-OPEN — this session is the single probe for ${sessionId}`);
  }

  // ── Probe lock safety ─────────────────────────────────────────────────────────
  // Wrap the entire main execution body in try/finally so the half-open probe
  // lock is always released — even when an uncaught exception is thrown anywhere
  // in the pipeline (arbitration, scoring, DB calls, strategy execution, etc.).
  // Without this guard, a mid-pipeline exception leaks the lock, all subsequent
  // half-open requests bypass without probing, and auto-recovery stalls.
  try {

  // ── Read per-client AI trust settings ────────────────────────────────────────
  let requireHumanApproval = false;
  let humanApprovalThreshold = 30;
  if (clientId) {
    try {
      const trustSettings = await db
        .select()
        .from(coordinatorClientSettingsTable)
        .where(
          and(
            eq(coordinatorClientSettingsTable.clientId, clientId),
            eq(coordinatorClientSettingsTable.settingKey, "require_human_approval"),
          ),
        )
        .limit(1);
      if (trustSettings[0]?.settingValue === "true") requireHumanApproval = true;

      const thresholdSetting = await db
        .select()
        .from(coordinatorClientSettingsTable)
        .where(
          and(
            eq(coordinatorClientSettingsTable.clientId, clientId),
            eq(coordinatorClientSettingsTable.settingKey, "human_approval_confidence_threshold"),
          ),
        )
        .limit(1);
      if (thresholdSetting[0]?.settingValue) {
        humanApprovalThreshold = Number(thresholdSetting[0].settingValue);
      }
    } catch (err) {
      console.warn("[JointPlanExecutor] Failed to read AI trust settings:", err);
    }
  }

  // ── Step 1: GalaxyCoordinator — assign roles ─────────────────────────────────
  const steps = agents.map((agent, idx) => ({
    stepIndex: idx,
    botId: agent.botId,
    botName: agent.botName,
    botTitle: agent.botTitle ?? "",
    botDepartment: agent.botDepartment ?? "",
  }));

  let coordinatorPlan = await assignRoles(taskDescription, steps, taskCategoryOverride, clientId, sessionKey).catch((err) => {
    console.error("[JointPlanExecutor] GalaxyCoordinator.assignRoles failed:", err);
    return null;
  });

  if (coordinatorPlan) {
    const validationResult = validateCoordinatorOutput(coordinatorPlan, {
      availableBotIds: agents.map((a) => a.botId),
      availableBotCount: agents.length,
    });

    if (!validationResult.valid) {
      console.warn(`[JointPlanExecutor] Coordinator output invalid (${validationResult.reason}) — retrying with EFFICIENT tier`);
      coordinatorPlan = await assignRoles(taskDescription, steps, taskCategoryOverride, clientId, sessionKey).catch(() => null);
    }
  }

  // Audit role assignment
  if (coordinatorPlan) {
    writeAuditEntry({
      clientId: clientId ?? null,
      sessionId: sessionKey,
      pipelineRunId,
      engine: "coordinator",
      decisionType: "role_assignment",
      payload: {
        taskCategory: coordinatorPlan.taskCategory,
        roleAssignments: coordinatorPlan.roleAssignments.map((r) => ({
          botId: r.botId,
          botName: r.botName,
          role: r.role,
        })),
        sessionId: sessionKey,
        pipelineRunId,
      },
    }).catch(() => {});
  }

  // Resolve A/B variant early (before conductor selection) so both coordinator and
  // conductor use the same control/treatment regime for the session.
  let earlyAbVariant: "control" | "treatment" | undefined;
  let controlCapturedAt: Date | undefined;
  if (clientId) {
    earlyAbVariant = await resolveSplit(clientId, sessionKey).catch(() => undefined);
    if (earlyAbVariant === "control") {
      try {
        const [experiment] = await db
          .select({ controlSnapshotId: abExperimentsTable.controlSnapshotId })
          .from(abExperimentsTable)
          .where(and(eq(abExperimentsTable.clientId, clientId), eq(abExperimentsTable.status, "running")))
          .limit(1);
        if (experiment?.controlSnapshotId) {
          const [snap] = await db
            .select({ data: weightSnapshotsTable.data })
            .from(weightSnapshotsTable)
            .where(eq(weightSnapshotsTable.id, experiment.controlSnapshotId))
            .limit(1);
          const snapData = snap?.data as { capturedAt?: string } | null;
          if (snapData?.capturedAt) {
            controlCapturedAt = new Date(snapData.capturedAt);
          }
        }
      } catch {
      }
    }
  }

  // ── Step 2: GalaxyConductor — select communication strategy ──────────────────
  // In bypass mode (circuit open or half-open non-probe) skip the expensive LLM
  // conductor call entirely and go straight to the cached strategy.  Running
  // selectStrategy() in open mode defeats the purpose of degraded operation.
  const conductorAgents = agents.map((a) => ({ name: a.botName }));

  let conductorStrategy: { strategy: typeof import("@workspace/db").COMMUNICATION_STRATEGY_VALUES[number]; rationale: string; taskCategory: TaskCategory };

  if (useLightweightBypass) {
    const bypassTaskCat = taskCategoryOverride ?? "execution" as TaskCategory;
    const cachedStrat = await getCachedStrategy(bypassTaskCat);
    conductorStrategy = {
      strategy: cachedStrat,
      rationale: `Circuit ${circuitState} — using cached best strategy (${cachedStrat}) for ${bypassTaskCat}`,
      taskCategory: bypassTaskCat,
    };
  } else {
    conductorStrategy = await selectStrategy(
      taskDescription,
      conductorAgents,
      taskCategoryOverride,
      undefined,
      undefined,
      undefined,
      controlCapturedAt,
    ).catch((err) => {
      console.error("[JointPlanExecutor] GalaxyConductor.selectStrategy failed:", err);
      return {
        strategy: "parallel_synthesis" as const,
        rationale: "Fallback to parallel_synthesis due to conductor failure",
        taskCategory: taskCategoryOverride ?? "execution" as TaskCategory,
      };
    });
  }

  // ── Step 2.5: StrategyBudgetGuard — enforce cost limits ─────────────────────
  const guardDecision = await guardStrategy(
    conductorStrategy.strategy,
    conductorStrategy.taskCategory,
    clientId ?? null,
  ).catch(() => null);

  if (guardDecision?.downgraded) {
    conductorStrategy = {
      ...conductorStrategy,
      strategy: guardDecision.strategy,
      rationale: `${conductorStrategy.rationale} [BudgetGuard: downgraded from ${guardDecision.originalStrategy} — ${guardDecision.reason}]`,
    };
  }

  // Audit strategy selection
  writeAuditEntry({
    clientId: clientId ?? null,
    sessionId: sessionKey,
    pipelineRunId,
    engine: "conductor",
    decisionType: "strategy_selection",
    payload: {
      strategy: conductorStrategy.strategy,
      taskCategory: conductorStrategy.taskCategory,
      rationale: conductorStrategy.rationale,
      budgetGuardDowngraded: guardDecision?.downgraded ?? false,
      circuitBypassed: useBypassMode,
      sessionId: sessionKey,
      pipelineRunId,
    },
  }).catch(() => {});

  // ── Step 3: GalaxyArbitrator — reconcile coordinator + conductor outputs ──────
  const fallbackPlan = coordinatorPlan ?? {
    taskCategory: taskCategoryOverride ?? ("execution" as TaskCategory),
    taskDescription,
    thinker: { botId: agents[0]?.botId ?? 0, botName: agents[0]?.botName ?? "agent-0", role: "thinker" as const, weight: 1.0, reasoning: "fallback" },
    worker: { botId: agents[0]?.botId ?? 0, botName: agents[0]?.botName ?? "agent-0", role: "worker" as const, weight: 1.0, reasoning: "fallback" },
    verifier: { botId: agents[agents.length - 1]?.botId ?? 0, botName: agents[agents.length - 1]?.botName ?? "agent-0", role: "verifier" as const, weight: 1.0, reasoning: "fallback" },
    roleAssignments: agents.map((a, i) => ({
      botId: a.botId,
      botName: a.botName,
      role: (i === 0 ? "thinker" : i === agents.length - 1 ? "verifier" : "worker") as "thinker" | "worker" | "verifier",
      weight: 1.0,
      reasoning: "fallback assignment",
    })),
    roleByStepIndex: Object.fromEntries(agents.map((_, i) => [i, i === 0 ? "thinker" : i === agents.length - 1 ? "verifier" : "worker"])) as Record<number, "thinker" | "worker" | "verifier">,
    timestamp: Date.now(),
    weightsSnapshot: {},
  };

  let jointPlan: JointCoordinationPlan;

  if (useLightweightBypass) {
    // Bypass mode: skip Arbitration entirely — build a minimal plan directly from cached strategy
    jointPlan = {
      ...fallbackPlan,
      communicationStrategy: conductorStrategy.strategy,
      taskCategory: conductorStrategy.taskCategory,
      reconciled: false,
      arbitrationNotes: [`Circuit ${circuitState} — Arbitration bypassed; cached strategy (${conductorStrategy.strategy}) used directly`],
      agentSequence: agents.map((a, i) => ({
        agentIndex: i,
        role: (i === 0 ? "thinker" : i === agents.length - 1 ? "verifier" : "worker") as "thinker" | "worker" | "verifier",
        reasoning: "bypass mode",
      })),
    } as JointCoordinationPlan;
  } else {
    jointPlan = arbitrate(fallbackPlan, conductorStrategy, {
      sessionId,
      clientId,
      botIds: agents.map((a) => a.botId),
      agentCount: agents.length,
      taskDescription,
      taskCategory: taskCategoryOverride,
    });
  }

  // Always audit arbitration outcome — not conditional on reconciled flag.
  // This ensures every coordination plan has provenance regardless of whether
  // a conflict was detected and resolved.
  if (jointPlan.reconciled) {
    onProgress?.({
      type: "conductor_reconciliation",
      content: `GalaxyMind — Arbitrator reconciled role conflict. ${jointPlan.arbitrationNotes.join(" ")}`,
      strategy: jointPlan.communicationStrategy,
      reconciled: true,
    });
    console.log(`[JointPlanExecutor] Arbitration reconciled conflict for session ${sessionId}: ${jointPlan.arbitrationNotes.join(" | ")}`);
  }

  writeAuditEntry({
    clientId: clientId ?? null,
    sessionId: sessionKey,
    pipelineRunId,
    engine: "arbitrator",
    decisionType: "arbitration",
    payload: {
      reconciled: jointPlan.reconciled,
      notes: jointPlan.arbitrationNotes,
      finalStrategy: jointPlan.communicationStrategy,
      sessionId: sessionKey,
      pipelineRunId,
      bypassed: useLightweightBypass,
    },
  }).catch(() => {});

  // ── Step 3.5: ConfidenceScorer — compute coordination confidence ─────────────
  const taskCat = jointPlan.taskCategory;
  const priors = await getCategoryPriors(taskCat).catch(() => []);

  // Seed sampleCounts ONLY with the selected strategy's run count.
  // Including all strategies' counts (many of which are 0) would cause
  // min(sampleCounts.values()) to be 0 regardless of actual evidence,
  // systematically depressing confidence and triggering false human-gate fires.
  const selectedStrategyPrior = priors.find((p) => p.strategy === jointPlan.communicationStrategy);
  const sampleCounts: SampleCountMap = new Map();
  if (selectedStrategyPrior) {
    sampleCounts.set(jointPlan.communicationStrategy, selectedStrategyPrior.runCount);
  }

  // Fetch real per-bot-role sample counts from coordinator_weights so low-sample
  // pairings correctly drive sample confidence down.
  const roleAssignmentBotIds = jointPlan.roleAssignments.map((ra) => ra.botId);
  if (roleAssignmentBotIds.length > 0) {
    try {
      const weightRows = await db
        .select({
          botId: coordinatorWeightsTable.botId,
          role: coordinatorWeightsTable.role,
          sampleCount: coordinatorWeightsTable.sampleCount,
        })
        .from(coordinatorWeightsTable)
        .where(
          and(
            eq(coordinatorWeightsTable.taskCategory, taskCat),
            clientId ? eq(coordinatorWeightsTable.clientId, clientId) : undefined,
            inArray(coordinatorWeightsTable.botId, roleAssignmentBotIds),
          ),
        );

      const weightsByKey = new Map(weightRows.map((w) => [`${w.role}:${w.botId}`, w.sampleCount]));
      for (const ra of jointPlan.roleAssignments) {
        const key = `${ra.role}:${ra.botId}`;
        sampleCounts.set(key, weightsByKey.get(key) ?? 0);
      }
    } catch (err) {
      // Fallback: mark all role assignments as zero-sample (conservative)
      console.warn("[JointPlanExecutor] Failed to fetch coordinator weight samples:", err);
      for (const ra of jointPlan.roleAssignments) {
        sampleCounts.set(`${ra.role}:${ra.botId}`, 0);
      }
    }
  } else {
    // No role assignments — mark the map to reflect that
    for (const ra of jointPlan.roleAssignments) {
      sampleCounts.set(`${ra.role}:${ra.botId}`, 0);
    }
  }

  // modelVersionMatch: true only if using the well-known stable default model
  const modelVersionMatch = (input.targetModel ?? DEFAULT_TARGET_MODEL) === DEFAULT_TARGET_MODEL;

  const beliefSuppressionCount = jointPlan.arbitrationNotes.filter((n) =>
    n.toLowerCase().includes("suppress"),
  ).length;

  const confidenceScore = await scoreJointPlan(
    jointPlan,
    sampleCounts,
    modelVersionMatch,
    beliefSuppressionCount,
    sessionKey,
    clientId,
    pipelineRunId,
  ).catch(() => null);

  if (confidenceScore) {
    jointPlan.coordinationConfidence = confidenceScore.total;
    jointPlan.confidenceBreakdown = {
      sampleConfidence: confidenceScore.sampleConfidence,
      versionConfidence: confidenceScore.versionConfidence,
      beliefConfidence: confidenceScore.beliefConfidence,
      minSampleCount: confidenceScore.breakdown.minSampleCount,
      modelVersionMatch: confidenceScore.breakdown.modelVersionMatch,
      beliefSuppressionCount: confidenceScore.breakdown.beliefSuppressionCount,
    };

    // Broadcast confidence to client via SSE
    const score = confidenceScore.total;
    const confidenceState = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

    // ── Human Agency Gate ────────────────────────────────────────────────────
    // Gate fires only when the client has EXPLICITLY enabled require_human_approval
    // AND the plan confidence is below the configured threshold.
    // When the toggle is off, low confidence surfaces as metadata only — no halt.
    // humanApprovalOverridden=true is set by the approve handler on the second
    // pass so the pipeline skips the gate and continues to execution.
    const needsHumanGate = !humanApprovalOverridden && requireHumanApproval && score < humanApprovalThreshold;
    if (needsHumanGate && clientId) {
      let pendingApprovalId: number | null = null;
      try {
        // Serialize the full execution context so the approve handler can resume
        // the pipeline from scratch with the gate bypassed.
        const resumeContext: Omit<JointPlanExecutorInput, "onProgress"> = {
          taskDescription,
          userContent,
          agents,
          sessionId,
          clientId,
          conversationId,
          targetModel,
          taskCategoryOverride,
          livingMemory,
          priorContext,
          humanApprovalOverridden: true,
        };

        const [pendingRow] = await db
          .insert(pendingApprovalsTable)
          .values({
            clientId,
            botId: agents[0]?.botId ?? 0,
            botName: agents[0]?.botName ?? "GalaxyMind",
            sessionId: typeof sessionId === "number" ? sessionId : null,
            conversationId: conversationId ?? null,
            toolName: "galaxy_mind_strategy",
            toolInput: {
              strategy: jointPlan.communicationStrategy,
              confidenceScore: score,
              requireHumanApproval,
              humanApprovalThreshold,
              taskDescription: taskDescription.slice(0, 200),
            },
            pausedLoopContext: resumeContext as Record<string, unknown>,
          })
          .returning({ id: pendingApprovalsTable.id });

        pendingApprovalId = pendingRow?.id ?? null;

        writeAuditEntry({
          clientId,
          sessionId: sessionKey,
          pipelineRunId,
          engine: "conductor",
          decisionType: "human_approval_required",
          payload: {
            pendingApprovalId,
            confidenceScore: score,
            humanApprovalRequired: true,
            requireHumanApproval,
            humanApprovalThreshold,
            strategy: jointPlan.communicationStrategy,
            reason: requireHumanApproval ? "require_human_approval_enabled" : "confidence_below_threshold",
            pipelineRunId,
          },
        }).catch(() => {});

        createNotification({
          clientId,
          category: "approval",
          severity: "warning",
          title: "GalaxyMind Strategy Requires Approval",
          body: `Confidence score ${score}/100 ${requireHumanApproval ? "(require_human_approval enabled)" : "is below threshold " + String(humanApprovalThreshold)}. Strategy: ${jointPlan.communicationStrategy.replace(/_/g, " ")}.`,
          metadata: { pendingApprovalId, sessionId: sessionKey, strategy: jointPlan.communicationStrategy },
          isApproval: true,
        }).catch(() => {});

        // Push notification to client for immediate awareness
        sendPushToClient(clientId, {
          title: "GalaxyMind — Strategy Approval Required",
          body: `Confidence ${score}/100 — strategy "${jointPlan.communicationStrategy.replace(/_/g, " ")}" needs your approval.`,
          badge: 1,
          isApproval: true,
        }).catch(() => {});
      } catch (err) {
        console.warn("[JointPlanExecutor] Failed to create human approval pending record:", err);
      }

      // Emit gate event and halt execution — strategy will not run until approved
      onProgress?.({
        type: "human_approval_required",
        content: `GalaxyMind — strategy execution paused: human approval required (confidence: ${score}/100, threshold: ${humanApprovalThreshold})`,
        pendingApprovalId,
        confidenceScore: score,
        requireHumanApproval,
        humanApprovalThreshold,
        strategy: jointPlan.communicationStrategy,
      });

      // Note: probe lock released in the outer try/finally — no explicit call here.
      return {
        content: "",
        agentsUsed: [],
        durationMs: Date.now() - start,
        plan: jointPlan,
        reconciled: false,
        arbitrationNotes: jointPlan.arbitrationNotes,
        strategyId: -1,
        coordinationConfidence: score,
        humanApprovalPending: true,
        pendingApprovalId,
      };
    }

    onProgress?.({
      type: "conductor_strategy",
      content: `GalaxyMind — ${jointPlan.communicationStrategy.replace(/_/g, " ")} strategy selected (confidence: ${score}/100)`,
      strategy: jointPlan.communicationStrategy,
      rationale: conductorStrategy.rationale,
      coordinationConfidence: score,
      confidenceState,
      confidenceBreakdown: jointPlan.confidenceBreakdown,
      humanApprovalRequired: false,
    });
  }

  // ── Step 4: ContextDistiller + BeliefDistiller — build role-specific briefings ─
  // Skip heavy distillation when circuit is bypassed to minimize overhead
  const distilledAgents: StrategyAgent[] = useLightweightBypass
    ? agents.map((agent) => ({ name: agent.botName, systemPrompt: agent.systemPrompt }))
    : await Promise.all(
    jointPlan.agentSequence.map(async (seqStep, idx) => {
      const agent = agents[seqStep.agentIndex] ?? agents[idx] ?? agents[0];
      if (!agent) return { name: "unknown", systemPrompt: "" };

      const [distilled, beliefBriefing] = await Promise.all([
        distillForRole(
          seqStep.role,
          livingMemory,
          priorContext,
          targetModel,
          agents.length,
        ).catch(() => null),
        distillBeliefBriefing(
          agent.botId,
          seqStep.role,
          coordinatorPlan?.taskCategory ?? (taskCategoryOverride ?? "execution"),
          clientId,
        ).catch(() => null),
      ]);

      const briefAddition = distilled?.systemBrief ? `\n\n${distilled.systemBrief}` : "";
      const beliefAddition =
        beliefBriefing?.briefingText ? `\n\n${beliefBriefing.briefingText}` : "";
      const systemPrompt = `${agent.systemPrompt}${briefAddition}${beliefAddition}`;

      if (distilled?.truncated) {
        console.log(`[JointPlanExecutor] Context distilled for agent ${agent.botName} (role=${seqStep.role}): ${distilled.tokenBudgetUsed}/${distilled.tokenBudgetAllotted} tokens (truncated)`);
      }
      if (beliefBriefing?.beliefCount) {
        console.log(`[JointPlanExecutor] Belief briefing injected for agent ${agent.botName} (role=${seqStep.role}): ${beliefBriefing.beliefCount} beliefs`);
      }

      return { name: agent.botName, systemPrompt };
    }),
  );

  // ── Step 5: Record strategy run (with persisted A/B variant to avoid recomputation drift) ──
  let resolvedAbVariant: "control" | "treatment" | undefined;
  if (clientId) {
    resolvedAbVariant = await resolveSplit(clientId, sessionKey).catch(() => undefined);
  }

  const strategyId = await recordStrategyRun(
    conductorStrategy,
    distilledAgents.map((a) => a.name),
    0,
    undefined,
    sessionKey,
    "joint_plan_executor",
    clientId,
    targetModel,
    deriveModelTier(targetModel),
    resolvedAbVariant,
  ).catch(() => -1);

  // ── Step 6: Execute strategy with AgentRelaySanitizer + StrategyCircuitBreaker ─
  clearStrategyBreakerSession(sessionKey);

  const strategyInput: StrategyInput = {
    taskDescription,
    userContent,
    agents: distilledAgents,
    clientId,
    botId: agents[0]?.botId,
    conversationId,
    taskCategory: taskCat,
    onProgress: wrapProgressWithCircuitBreaker(
      onProgress,
      sessionKey,
      jointPlan.communicationStrategy,
      taskDescription,
    ),
  };

  let result: StrategyResult;
  try {
    switch (jointPlan.communicationStrategy) {
      case "sequential_debate":
        result = await executeWithRelayGuard(
          () => executeSequentialDebate(strategyInput),
          sessionKey,
          jointPlan.communicationStrategy,
          taskDescription,
          onProgress,
        );
        break;
      case "hierarchical_delegation":
        result = await executeHierarchicalDelegation(strategyInput);
        break;
      case "round_robin_review":
        result = await executeWithRelayGuard(
          () => executeRoundRobinReview(strategyInput),
          sessionKey,
          jointPlan.communicationStrategy,
          taskDescription,
          onProgress,
        );
        break;
      case "parallel_synthesis":
      default:
        result = await executeParallelSynthesis(strategyInput);
    }
  } catch (err) {
    console.error(`[JointPlanExecutor] Strategy ${jointPlan.communicationStrategy} failed — falling back to parallel_synthesis:`, err);
    result = await executeParallelSynthesis(strategyInput);
  }

  const durationMs = Date.now() - start;

  // ── Record latency for orchestration circuit breaker ─────────────────────────
  // Only record full-pipeline latencies; bypass-mode requests run a lightweight
  // code path and their latencies must NOT influence the rolling-window P95 used
  // for recovery decisions.  Recording bypass latencies would dilute P95 and
  // could close the circuit while the heavy pipeline is still unhealthy.
  if (!useLightweightBypass) {
    recordLatency(durationMs, { isProbe: isHalfOpen && probeAllowed });
  }

  // ── Persist adaptive-aggregation + semantic-cache telemetry (task #216) ──────
  recordRunTelemetry(strategyId, result.telemetry).catch(() => {});

  // ── Update strategy cache with outcome ──────────────────────────────────────
  const outcomeQualityScore = confidenceScore ? confidenceScore.total / 100 : 0.7;
  updateStrategyCache(taskCat, jointPlan.communicationStrategy, outcomeQualityScore).catch(() => {});

  // ── Final outcome audit entry — ties pipeline run together with quality score ─
  writeAuditEntry({
    clientId: clientId ?? null,
    sessionId: sessionKey,
    pipelineRunId,
    engine: "conductor",
    decisionType: "outcome",
    outcomeQualityScore,
    payload: {
      strategy: jointPlan.communicationStrategy,
      taskCategory: taskCat,
      durationMs: Date.now() - start,
      agentsUsed: result.agentsUsed,
      reconciled: jointPlan.reconciled,
      pipelineRunId,
      sessionId: sessionKey,
      // Aggregation fidelity provenance — lets operators audit, per run, whether
      // aggregation was used, how deep the tree went, and fidelity vs baseline.
      aggregation: result.aggregationTrace
        ? {
            used: result.aggregationTrace.aggregationUsed,
            strategy: result.aggregationTrace.strategy,
            treeDepth: result.aggregationTrace.treeDepth,
            clusterCount: result.aggregationTrace.clusterCount,
            escalatedClusterCount: result.aggregationTrace.escalatedClusterCount,
            meanDivergence: result.aggregationTrace.meanDivergence,
            maxDivergence: result.aggregationTrace.maxDivergence,
            fidelityScore: result.aggregationTrace.fidelityScore,
            baselineScore: result.aggregationTrace.baselineScore,
            fidelityRatio: result.aggregationTrace.fidelityRatio,
            fellBackToFlat: result.aggregationTrace.fellBackToFlat,
            flaggedForReview: result.aggregationTrace.flaggedForReview,
          }
        : undefined,
    },
  }).catch(() => {});

  clearStrategyBreakerSession(sessionKey);

  return {
    content: result.content,
    agentsUsed: result.agentsUsed,
    durationMs,
    plan: jointPlan,
    reconciled: jointPlan.reconciled,
    arbitrationNotes: jointPlan.arbitrationNotes,
    strategyId,
    coordinationConfidence: jointPlan.coordinationConfidence,
    aggregationTrace: result.aggregationTrace,
  };

  } finally {
    // ── Release half-open probe slot ────────────────────────────────────────────
    // This runs on ALL exit paths — normal return, early return (human gate),
    // and uncaught exceptions — ensuring the probe lock is never leaked.
    if (isHalfOpen && probeAllowed) {
      releaseHalfOpenProbe();
    }
  }
}

async function executeWithRelayGuard(
  executor: () => Promise<StrategyResult>,
  sessionId: string,
  strategy: "sequential_debate" | "round_robin_review",
  taskDescription: string,
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void,
): Promise<StrategyResult> {
  const start = Date.now();

  try {
    return await executor();
  } catch {
    console.warn(`[JointPlanExecutor] ${strategy} failed — circuit breaker falling back to parallel_synthesis`);
    onProgress?.({
      type: "conductor_circuit_break",
      content: `GalaxyMind — strategy ${strategy} aborted; falling back to parallel_synthesis`,
      strategy: "parallel_synthesis",
    });
    return {
      content: "",
      agentsUsed: [],
      durationMs: Date.now() - start,
    };
  }
}

function wrapProgressWithCircuitBreaker(
  onProgress: JointPlanExecutorInput["onProgress"],
  sessionId: string,
  strategy: string,
  taskDescription: string,
): JointPlanExecutorInput["onProgress"] {
  const passedTurns: TurnOutput[] = [];
  let turnIndex = 0;

  return async (event) => {
    onProgress?.(event);

    if (
      event.type === "conductor_progress" &&
      typeof event.content === "string" &&
      event.content.length > 0 &&
      (strategy === "sequential_debate" || strategy === "round_robin_review")
    ) {
      const agentName = typeof event.agentName === "string" ? event.agentName : "unknown";
      const outputContent = typeof event.agentOutput === "string" ? event.agentOutput : event.content;

      const decision = await checkMidStrategyQuality(
        sessionId,
        turnIndex,
        outputContent,
        agentName,
        strategy as "sequential_debate" | "round_robin_review",
        taskDescription,
        passedTurns,
      ).catch(() => ({ shouldAbort: false, salvageableTurns: passedTurns }));

      decision.salvageableTurns.forEach((t) => {
        if (!passedTurns.find((p) => p.turnIndex === t.turnIndex)) {
          passedTurns.push(t);
        }
      });

      if (decision.shouldAbort) {
        console.warn(`[JointPlanExecutor] StrategyCircuitBreaker tripped for session ${sessionId}: ${decision.reason}`);
        onProgress?.({
          type: "conductor_circuit_break",
          content: `GalaxyMind — quality floor breached (${decision.reason}). Collecting ${passedTurns.length} salvageable turn(s) and switching to parallel_synthesis.`,
          strategy: "parallel_synthesis",
          salvageableTurnCount: passedTurns.length,
        });
      }

      turnIndex++;
    }
  };
}
