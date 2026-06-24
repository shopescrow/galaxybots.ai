import type { CoordinatorRole, RoleAssignment, TaskCategory } from "@workspace/db";
import type { CommunicationStrategy } from "@workspace/db";

export interface AgentSequenceStep {
  agentIndex: number;
  agentId: string;
  agentName: string;
  role: CoordinatorRole;
  position: "proposer" | "critic" | "lead" | "specialist" | "reviewer" | "parallel";
}

export interface JointCoordinationPlan {
  roleAssignments: RoleAssignment[];
  communicationStrategy: CommunicationStrategy;
  agentSequence: AgentSequenceStep[];
  arbitrationNotes: string[];
  contextBudgetPerAgent: number;
  taskCategory: TaskCategory;
  taskDescription: string;
  timestamp: number;
  reconciled: boolean;
}

export interface SessionContext {
  sessionId: string | number;
  clientId?: number;
  botIds?: number[];
  agentCount: number;
  taskDescription: string;
  taskCategory?: TaskCategory;
}
