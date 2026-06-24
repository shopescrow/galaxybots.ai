import { callWithFallback } from "../ai-safety/model-fallback";
import type { CoordinatorRole } from "@workspace/db";

export interface MemoryEntry {
  key: string;
  value: string;
  tags?: string[];
  recency?: number;
  domain?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DistilledContext {
  systemBrief: string;
  tokenBudgetUsed: number;
  tokenBudgetAllotted: number;
  truncated: boolean;
  role: CoordinatorRole;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.4": 128_000,
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "claude-sonnet-4-6": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-haiku": 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 32_000;
const CONTEXT_BUDGET_RATIO = 0.60;
const APPROX_CHARS_PER_TOKEN = 4;
const SUMMARY_MODEL = "gpt-4o-mini";

const ROLE_MEMORY_TAGS: Record<CoordinatorRole, string[]> = {
  thinker: ["strategic", "analytical", "research", "planning", "hypothesis", "insight"],
  worker: ["operational", "procedural", "execution", "task", "implementation", "action"],
  verifier: ["risk", "error", "correction", "validation", "audit", "review", "failure"],
};

function getContextWindowSize(targetModel: string): number {
  return MODEL_CONTEXT_WINDOWS[targetModel] ?? DEFAULT_CONTEXT_WINDOW;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function filterMemoryByRole(entries: MemoryEntry[], role: CoordinatorRole): MemoryEntry[] {
  const relevantTags = ROLE_MEMORY_TAGS[role];

  const scored = entries.map((entry) => {
    const entryText = `${entry.key} ${entry.value} ${(entry.tags ?? []).join(" ")} ${entry.domain ?? ""}`.toLowerCase();
    let score = 0;
    for (const tag of relevantTags) {
      if (entryText.includes(tag)) score += 2;
    }
    score += (entry.recency ?? 0) * 0.5;
    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);
}

async function summarizeContext(content: string, role: CoordinatorRole, budgetChars: number): Promise<string> {
  const roleFocus = {
    thinker: "strategic insights, analytical findings, and planning context",
    worker: "operational procedures, task requirements, and execution context",
    verifier: "risks, errors, corrections, and validation criteria",
  }[role];

  try {
    const prompt = `Summarize the following context for a ${role} agent. Focus on ${roleFocus}. Be concise and keep under ${Math.floor(budgetChars / APPROX_CHARS_PER_TOKEN)} tokens.

Context to summarize:
${content.slice(0, budgetChars * 2)}`;

    const result = await callWithFallback({
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: "You are a precise context distiller. Preserve only the most critical information for the specified role." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: Math.floor(budgetChars / APPROX_CHARS_PER_TOKEN),
    });

    return result.completion.choices[0]?.message?.content ?? content.slice(0, budgetChars);
  } catch {
    return content.slice(0, budgetChars);
  }
}

export async function distillForRole(
  role: CoordinatorRole,
  livingMemory: MemoryEntry[],
  priorContext: ConversationTurn[],
  targetModel: string,
  agentCount = 1,
): Promise<DistilledContext> {
  const contextWindowSize = getContextWindowSize(targetModel);
  const totalBudgetTokens = Math.floor(contextWindowSize * CONTEXT_BUDGET_RATIO);
  const perAgentBudgetTokens = Math.floor(totalBudgetTokens / Math.max(agentCount, 1));
  const perAgentBudgetChars = perAgentBudgetTokens * APPROX_CHARS_PER_TOKEN;

  const filteredMemory = filterMemoryByRole(livingMemory, role);

  const memorySection = filteredMemory.length > 0
    ? filteredMemory
        .map((e) => `[Memory] ${e.key}: ${e.value}`)
        .join("\n")
    : "";

  const conversationSection = priorContext
    .filter((t) => t.role !== "system")
    .slice(-10)
    .map((t) => `[${t.role}]: ${t.content}`)
    .join("\n");

  const combined = [memorySection, conversationSection].filter(Boolean).join("\n\n");

  let brief = combined;
  let truncated = false;

  if (estimateTokens(brief) > perAgentBudgetTokens) {
    brief = await summarizeContext(combined, role, perAgentBudgetChars);
    truncated = true;

    if (estimateTokens(brief) > perAgentBudgetTokens) {
      brief = brief.slice(0, perAgentBudgetChars);
      truncated = true;
    }
  }

  const tokenBudgetUsed = estimateTokens(brief);

  const roleLabel = {
    thinker: "STRATEGIC CONTEXT (for analytical reasoning)",
    worker: "OPERATIONAL CONTEXT (for task execution)",
    verifier: "RISK & VALIDATION CONTEXT (for quality verification)",
  }[role];

  const systemBrief = brief.length > 0
    ? `[Context Distiller — ${roleLabel}]\n${brief}`
    : "";

  return {
    systemBrief,
    tokenBudgetUsed,
    tokenBudgetAllotted: perAgentBudgetTokens,
    truncated,
    role,
  };
}
