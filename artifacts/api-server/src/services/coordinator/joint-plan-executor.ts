import { assignRoles } from "./galaxy-coordinator";
import { selectStrategy, recordStrategyRun, recordStrategyOutcome } from "../conductor/galaxy-conductor";
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
} from "../conductor/strategies/index";
import type { JointCoordinationPlan } from "./joint-coordination-plan";
import type { TaskCategory } from "@workspace/db";
import type { ConversationTurn, MemoryEntry } from "./context-distiller";

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
}

export interface JointPlanExecutorResult {
  content: string;
  agentsUsed: string[];
  durationMs: number;
  plan: JointCoordinationPlan;
  reconciled: boolean;
  arbitrationNotes: string[];
  strategyId: number;
}

const DEFAULT_TARGET_MODEL = "gpt-4o-mini";

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
  } = input;

  const targetModel = input.targetModel ?? DEFAULT_TARGET_MODEL;
  const sessionKey = String(sessionId);

  // ── Step 1: GalaxyCoordinator — assign roles ─────────────────────────────────
  const steps = agents.map((agent, idx) => ({
    stepIndex: idx,
    botId: agent.botId,
    botName: agent.botName,
    botTitle: agent.botTitle ?? "",
    botDepartment: agent.botDepartment ?? "",
  }));

  let coordinatorPlan = await assignRoles(taskDescription, steps, taskCategoryOverride, clientId).catch((err) => {
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
      coordinatorPlan = await assignRoles(taskDescription, steps, taskCategoryOverride, clientId).catch(() => null);
    }
  }

  // ── Step 2: GalaxyConductor — select communication strategy ──────────────────
  const conductorAgents = agents.map((a) => ({ name: a.botName }));
  const conductorStrategy = await selectStrategy(
    taskDescription,
    conductorAgents,
    taskCategoryOverride,
  ).catch((err) => {
    console.error("[JointPlanExecutor] GalaxyConductor.selectStrategy failed:", err);
    return {
      strategy: "parallel_synthesis" as const,
      rationale: "Fallback to parallel_synthesis due to conductor failure",
      taskCategory: taskCategoryOverride ?? "execution" as TaskCategory,
    };
  });

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

  const jointPlan = arbitrate(fallbackPlan, conductorStrategy, {
    sessionId,
    clientId,
    botIds: agents.map((a) => a.botId),
    agentCount: agents.length,
    taskDescription,
    taskCategory: taskCategoryOverride,
  });

  if (jointPlan.reconciled) {
    onProgress?.({
      type: "conductor_reconciliation",
      content: `GalaxyMind — Arbitrator reconciled role conflict. ${jointPlan.arbitrationNotes.join(" ")}`,
      strategy: jointPlan.communicationStrategy,
      reconciled: true,
    });
    console.log(`[JointPlanExecutor] Arbitration reconciled conflict for session ${sessionId}: ${jointPlan.arbitrationNotes.join(" | ")}`);
  }

  // ── Step 4: ContextDistiller + BeliefDistiller — build role-specific briefings ─
  const distilledAgents: StrategyAgent[] = await Promise.all(
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

  // ── Step 5: Record strategy run ───────────────────────────────────────────────
  const strategyId = await recordStrategyRun(
    conductorStrategy,
    distilledAgents.map((a) => a.name),
    0,
    undefined,
    sessionKey,
    "joint_plan_executor",
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
    onProgress: wrapProgressWithCircuitBreaker(
      onProgress,
      sessionKey,
      jointPlan.communicationStrategy,
      taskDescription,
    ),
  };

  let result;
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

  recordStrategyOutcome(strategyId, 0.7).catch(() => {});
  clearStrategyBreakerSession(sessionKey);

  return {
    content: result.content,
    agentsUsed: result.agentsUsed,
    durationMs,
    plan: jointPlan,
    reconciled: jointPlan.reconciled,
    arbitrationNotes: jointPlan.arbitrationNotes,
    strategyId,
  };
}

async function executeWithRelayGuard(
  executor: () => Promise<{ content: string; agentsUsed: string[]; durationMs: number }>,
  sessionId: string,
  strategy: "sequential_debate" | "round_robin_review",
  taskDescription: string,
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void,
): Promise<{ content: string; agentsUsed: string[]; durationMs: number }> {
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
