import { callWithFallback, ModelTier } from "../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import { generateEmbeddings } from "../bots/memory";
import { topKBySimilarity } from "../scaling/scaling-primitives";
import { scalingConfig, isScalingActive } from "../scaling/scaling-config";
import type { CoordinatorRole } from "@workspace/db";
import { rolePriorScore, clamp01, type CoordinatorRoleLike } from "../bots/hybrid-retrieval";

/**
 * Cost attribution for internal summarization calls. Without threading the
 * client/bot identity into callWithFallback, distillation usage is never logged
 * to llm_usage_log — a silent margin leak. All distillation rides the EFFICIENT
 * tier.
 */
export interface DistillAttribution {
  clientId?: number;
  botId?: number;
  sessionId?: number;
  conversationId?: number;
}

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

const MODEL_CONTEXT_WINDOWS: Record<string, number> = { // model-router-lint-ignore — lookup table, not a routing decision
  "gpt-5.4": 128_000,
  "gpt-4o": 128_000,
  "gpt-5-mini": 128_000,
  "claude-sonnet-4-6": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-haiku": 200_000,
};

const DEFAULT_CONTEXT_WINDOW = 32_000;
const CONTEXT_BUDGET_RATIO = 0.60;
const APPROX_CHARS_PER_TOKEN = 4;
const SUMMARY_MODEL = resolveCapability(ModelCapability.REASONING_EFFICIENT);

function getContextWindowSize(targetModel: string): number {
  return MODEL_CONTEXT_WINDOWS[targetModel] ?? DEFAULT_CONTEXT_WINDOW;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

// Weights for the in-memory (living-memory) rerank. This is the small,
// transient scratchpad path; it shares the role-prior + recency blend used by
// the DB-backed ANN retrieval (see services/bots/hybrid-retrieval.ts) so ranking
// stays consistent across both paths. No vector similarity is available here.
const LIVING_MEMORY_WEIGHTS = { rolePrior: 1, recency: 0.5 };

function filterMemoryByRole(
  entries: MemoryEntry[],
  role: CoordinatorRole,
  weights: { rolePrior: number; recency: number } = LIVING_MEMORY_WEIGHTS,
): MemoryEntry[] {
  const scored = entries.map((entry) => {
    const entryText = `${entry.key} ${entry.value} ${(entry.tags ?? []).join(" ")} ${entry.domain ?? ""}`;
    const rolePrior = rolePriorScore(entryText, role as CoordinatorRoleLike);
    const recency = clamp01(entry.recency ?? 0);
    const score = weights.rolePrior * rolePrior + weights.recency * recency;
    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);
}

function entryToText(entry: MemoryEntry): string {
  return `${entry.key} ${entry.value} ${(entry.tags ?? []).join(" ")} ${entry.domain ?? ""}`.trim();
}

/**
 * Select the role-relevant memory entries using semantic top-k vector retrieval instead of a
 * full lexical scan. The role query is built from the role's memory tags plus the latest user
 * turn; entries are ranked by cosine similarity and the top-k are returned. Gated by the
 * memoryRetrieval flag/threshold — below threshold (or on any embedding failure) it falls back
 * to the exact lexical \`filterMemoryByRole\`, so behavior is unchanged for small memory sets.
 */
async function selectMemoryForRole(
  entries: MemoryEntry[],
  role: CoordinatorRole,
  priorContext: ConversationTurn[],
): Promise<MemoryEntry[]> {
  if (!isScalingActive(scalingConfig.memoryRetrieval, entries.length)) {
    return filterMemoryByRole(entries, role);
  }

  try {
    const lastUserTurn = [...priorContext].reverse().find((t) => t.role === "user")?.content ?? "";
    const roleQuery = `${ROLE_MEMORY_TAGS[role].join(" ")} ${lastUserTurn}`.trim();

    const [queryEmbedding, ...entryEmbeddings] = await generateEmbeddings([
      roleQuery,
      ...entries.map(entryToText),
    ]);

    if (!queryEmbedding || entryEmbeddings.length !== entries.length) {
      return filterMemoryByRole(entries, role);
    }

    const k = scalingConfig.memoryTopK > 0 ? scalingConfig.memoryTopK : entries.length;
    const ranked = topKBySimilarity(
      queryEmbedding,
      entries.map((entry, i) => ({ item: entry, embedding: entryEmbeddings[i] })),
      k,
    );
    return ranked.map((r) => r.item);
  } catch {
    return filterMemoryByRole(entries, role);
  }
}

async function summarizeContext(
  content: string,
  role: CoordinatorRole,
  budgetChars: number,
  attribution?: DistillAttribution,
): Promise<string> {
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
      clientId: attribution?.clientId,
      botId: attribution?.botId,
      sessionId: attribution?.sessionId,
      conversationId: attribution?.conversationId,
      preferredTier: ModelTier.EFFICIENT,
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
  attribution?: DistillAttribution,
): Promise<DistilledContext> {
  const contextWindowSize = getContextWindowSize(targetModel);
  const totalBudgetTokens = Math.floor(contextWindowSize * CONTEXT_BUDGET_RATIO);
  const perAgentBudgetTokens = Math.floor(totalBudgetTokens / Math.max(agentCount, 1));
  const perAgentBudgetChars = perAgentBudgetTokens * APPROX_CHARS_PER_TOKEN;

  const filteredMemory = await selectMemoryForRole(livingMemory, role, priorContext);

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
    brief = await summarizeContext(combined, role, perAgentBudgetChars, attribution);
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
