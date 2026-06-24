import type { CoordinatorPlan, RoleAssignment, CoordinatorRole } from "@workspace/db";
import type { StrategySelection } from "../conductor/galaxy-conductor";
import type { JointCoordinationPlan, AgentSequenceStep, SessionContext } from "./joint-coordination-plan";

const DEFAULT_CONTEXT_BUDGET = 8192;

function makeSequenceStep(
  agentIndex: number,
  assignment: RoleAssignment,
  position: AgentSequenceStep["position"],
): AgentSequenceStep {
  return {
    agentIndex,
    agentId: String(assignment.botId),
    agentName: assignment.botName,
    role: assignment.role,
    position,
  };
}

export function arbitrate(
  coordinatorPlan: CoordinatorPlan,
  conductorStrategy: StrategySelection,
  sessionContext: SessionContext,
): JointCoordinationPlan {
  const notes: string[] = [];
  const { strategy } = conductorStrategy;
  const { thinker, worker, verifier, roleAssignments, taskCategory, taskDescription } = coordinatorPlan;

  let agentSequence: AgentSequenceStep[] = [];
  let reconciled = false;

  if (strategy === "parallel_synthesis") {
    agentSequence = roleAssignments.map((assignment, i) =>
      makeSequenceStep(i, assignment, "parallel"),
    );
    notes.push("parallel_synthesis: Coordinator role assignments apply independently to all parallel agents.");
  } else if (strategy === "sequential_debate") {
    const thinkerBotId = thinker.botId;
    const verifierBotId = verifier.botId;

    if (thinkerBotId === verifierBotId) {
      reconciled = true;
      const workerAssignment: RoleAssignment = {
        botId: worker.botId,
        botName: worker.botName,
        role: "verifier" as CoordinatorRole,
        weight: worker.weight,
        reasoning: `Arbitrator reassigned critic position: bot ${thinkerBotId} held both proposer and critic — next-highest-weight bot (${worker.botName}) assigned as critic.`,
      };
      agentSequence = [
        makeSequenceStep(0, thinker, "proposer"),
        makeSequenceStep(1, workerAssignment, "critic"),
      ];
      notes.push(
        `sequential_debate conflict: bot ${thinkerBotId} (${thinker.botName}) was assigned both Thinker and Verifier. ` +
        `Arbitrator reassigned critic position to ${worker.botName} (next-highest weight: ${worker.weight.toFixed(4)}).`,
      );
    } else {
      agentSequence = [
        makeSequenceStep(0, thinker, "proposer"),
        ...roleAssignments
          .filter((a) => a.botId !== thinkerBotId && a.botId !== verifierBotId)
          .map((a, i) => makeSequenceStep(i + 1, a, "critic")),
        makeSequenceStep(roleAssignments.length - 1, verifier, "critic"),
      ];
      notes.push("sequential_debate: Thinker mapped to proposer, Verifier mapped to final critic position.");
    }
  } else if (strategy === "hierarchical_delegation") {
    const lead = thinker;
    const subtaskPool = roleAssignments.filter((a) => a.botId !== thinker.botId);

    agentSequence = [
      makeSequenceStep(0, lead, "lead"),
      ...subtaskPool.map((a, i) => makeSequenceStep(i + 1, a, "specialist")),
    ];
    notes.push(
      `hierarchical_delegation: Thinker (${thinker.botName}) mapped to lead. ` +
      `${subtaskPool.length} remaining assignment(s) form the subtask pool.`,
    );
  } else if (strategy === "round_robin_review") {
    const verifierBotId = verifier.botId;
    const nonVerifier = roleAssignments.filter((a) => a.botId !== verifierBotId);
    const orderedAssignments = [...nonVerifier, verifier];

    agentSequence = orderedAssignments.map((a, i) =>
      makeSequenceStep(i, a, i === orderedAssignments.length - 1 ? "reviewer" : "parallel"),
    );
    notes.push(
      `round_robin_review: Verifier (${verifier.botName}) placed last in sequence regardless of weight order.`,
    );
  } else {
    agentSequence = roleAssignments.map((a, i) => makeSequenceStep(i, a, "parallel"));
    notes.push(`Unknown strategy "${strategy}" — defaulting to parallel sequencing.`);
  }

  const contextBudgetPerAgent = sessionContext.agentCount > 0
    ? Math.floor(DEFAULT_CONTEXT_BUDGET / sessionContext.agentCount)
    : DEFAULT_CONTEXT_BUDGET;

  return {
    roleAssignments,
    communicationStrategy: strategy,
    agentSequence,
    arbitrationNotes: notes,
    contextBudgetPerAgent,
    taskCategory: taskCategory ?? "execution",
    taskDescription,
    timestamp: Date.now(),
    reconciled,
  };
}
