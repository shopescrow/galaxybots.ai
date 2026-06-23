export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LLMCompletionOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  clientId?: number;
  botId?: number;
  sessionId?: number;
  conversationId?: number;
}

export interface LLMCompletion {
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  promptTokens: number;
  completionTokens: number;
  costCents: number;
  model: string;
}

export interface LLMProvider {
  complete(options: LLMCompletionOptions): Promise<LLMCompletion>;
  isAvailable(): boolean;
}

export interface ToolInput {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolOutput {
  result: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolRegistry {
  execute(toolName: string, args: Record<string, unknown>, context: Record<string, unknown>): Promise<ToolOutput>;
  getSchemas(): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  hasIdempotencyKey(toolName: string, key: string): boolean;
}

export interface MemoryEntry {
  key: string;
  value: string;
  source?: string;
}

export interface MemoryStore {
  retrieve(sessionId: number, keys?: string[]): Promise<MemoryEntry[]>;
  store(sessionId: number, entries: MemoryEntry[]): Promise<void>;
}

export interface SessionStore {
  getSession(sessionId: number): Promise<{ id: number; objective: string; status: string } | null>;
  updateSessionOutcome(sessionId: number, data: {
    loopIterations?: number;
    costCents?: number;
    terminationReason?: string;
    failureCategory?: string;
    loopTrace?: Record<string, unknown>;
  }): Promise<void>;
}

export interface FailureRecord {
  botId?: number;
  clientId?: number;
  sessionId?: number;
  conversationId?: number;
  failureCategory: FailureCategory;
  failureDetail: string;
  userInput?: string;
  lastThought?: string;
  iterationsCompleted: number;
  costCents: number;
  durationMs: number;
  toolsAttempted: string[];
  traceSnapshot?: Record<string, unknown>;
}

export type FailureCategory =
  | "information_gap"
  | "tool_limitation"
  | "reasoning_failure"
  | "budget_exhaustion"
  | "time_exhaustion"
  | "circuit_open"
  | "quality_gate_failure"
  | "permission_denied"
  | "context_overflow"
  | "unknown";

export interface FailureLogStore {
  logFailure(record: FailureRecord): Promise<void>;
}

export interface AgentLoopConfig {
  maxIterations: number;
  timeBudgetMs: number;
  costBudgetCents: number;
  qualityThreshold: number;
  enableSelfEvaluation: boolean;
  enableBrowserAgent: boolean;
  model: string;
  fallbackModel?: string;
  networkAllowList: string[];
}

export interface ConfigProvider {
  getLoopConfig(botId: number, clientId?: number): Promise<AgentLoopConfig>;
}

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxIterations: 10,
  timeBudgetMs: 120_000,
  costBudgetCents: 500,
  qualityThreshold: 0.7,
  enableSelfEvaluation: true,
  enableBrowserAgent: false,
  model: "gpt-4o-mini",
  networkAllowList: [],
};
