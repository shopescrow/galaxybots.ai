import { callWithFallback } from "../../ai-safety/model-fallback";
import { trimToFitContextWindow, estimateTokens } from "../../ai-safety/context-window";
import { estimateCost } from "../../analytics/llm-usage";
import { decideAggregationMode, type AggregationMode } from "../adaptive-aggregation.js";
import {
  lookupSemanticCache,
  storeSemanticCache,
  withSemanticCache,
  newRunCacheStats,
  cacheHitRate,
  type RunCacheStats,
} from "../semantic-cache.js";
import type { CommunicationStrategy } from "@workspace/db";

export interface StrategyAgent {
  name: string;
  systemPrompt: string;
}

export interface StrategyInput {
  taskDescription: string;
  userContent: string;
  agents: StrategyAgent[];
  clientId?: number;
  botId?: number;
  conversationId?: number;
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void;
}

export interface StrategyTelemetry {
  /** Aggregation path chosen for the synthesis step (parallel_synthesis only). */
  aggregationMode?: AggregationMode | null;
  /** Whether the final answer was served from the semantic cache. */
  cacheHit?: boolean;
  /** Fraction of cache lookups in this run that hit. */
  cacheHitRate?: number;
  /** Similarity of the served cache hit (or best sub-call hit). */
  cacheSimilarity?: number | null;
  /** Estimated USD avoided via cache hits this run. */
  cacheSavingsUsd?: number;
  /** Estimated USD avoided by adaptive aggregation vs the rejected path. */
  adaptiveSavingsUsd?: number;
  /** Estimated ms avoided by adaptive aggregation vs the rejected path. */
  adaptiveSavingsMs?: number;
}

export interface StrategyResult {
  content: string;
  agentsUsed: string[];
  durationMs: number;
  telemetry?: StrategyTelemetry;
}

const MODEL = "gpt-5.4";
const FALLBACK_MODEL = "gpt-5-mini";

// ── Semantic cache helpers (task #216) ───────────────────────────────────────

/** Rough projection of the full multi-agent run cost, used to value cache hits. */
function estimateFullRunCostUsd(input: StrategyInput): number {
  const userTokens = estimateTokens(input.userContent);
  const perAgentPrompt = userTokens + 200;
  const perAgentCompletion = 700;
  const agentCost = Math.max(1, input.agents.length) * estimateCost(MODEL, perAgentPrompt, perAgentCompletion);
  const synthPrompt = Math.max(1, input.agents.length) * perAgentCompletion + 300;
  const synthCost = estimateCost(MODEL, synthPrompt, 900);
  return agentCost + synthCost;
}

/** Check the semantic cache for a near-duplicate final answer for this client. */
async function tryServeFinalFromCache(
  input: StrategyInput,
): Promise<{ content: string; similarity: number; savedCostUsd: number } | null> {
  const lookup = await lookupSemanticCache({
    clientId: input.clientId,
    kind: "summary",
    queryText: input.userContent,
  });
  if (!lookup.hit) return null;
  return {
    content: lookup.response,
    similarity: lookup.similarity,
    savedCostUsd: lookup.savedCostUsd || estimateFullRunCostUsd(input),
  };
}

/** Persist a completed final answer so future near-duplicate runs can reuse it. */
async function storeFinalInCache(input: StrategyInput, content: string): Promise<void> {
  await storeSemanticCache({
    clientId: input.clientId,
    kind: "summary",
    queryText: input.userContent,
    responseText: content,
    model: MODEL,
    costUsd: estimateFullRunCostUsd(input),
  });
}

/** Build a cache-hit StrategyResult (no agents were run). */
function cacheHitResult(
  input: StrategyInput,
  served: { content: string; similarity: number; savedCostUsd: number },
  start: number,
): StrategyResult {
  return {
    content: served.content,
    agentsUsed: [],
    durationMs: Date.now() - start,
    telemetry: {
      cacheHit: true,
      cacheHitRate: 1,
      cacheSimilarity: served.similarity,
      cacheSavingsUsd: served.savedCostUsd,
    },
  };
}

async function callAgent(
  systemPrompt: string,
  userContent: string,
  temperature = 0.7,
  clientId?: number,
  botId?: number,
  conversationId?: number,
): Promise<string> {
  const msgs = trimToFitContextWindow(
    [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const result = await callWithFallback({
    model: MODEL,
    messages: msgs,
    temperature,
    clientId,
    botId,
    conversationId,
  });
  return result.completion.choices[0]?.message?.content ?? "";
}

/** Flat aggregation: a single synthesis call over all perspectives (current behaviour). */
async function synthesizeFlat(perspectives: string[], userContent: string, input: StrategyInput): Promise<string> {
  const valid = perspectives.filter(Boolean);
  const synthesisPrompt = `You are synthesizing ${valid.length} independent analytical perspectives on the same question. Produce a single, definitive, authoritative response.

Rules:
- Integrate the strongest reasoning from all perspectives
- Resolve contradictions by choosing the most defensible position  
- Capture nuances raised across multiple perspectives
- Eliminate redundancy and write as a single unified voice

The ${valid.length} perspectives:

${valid.map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n")}

Write the single definitive synthesized response:`;

  const synthMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: synthesisPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const synthResult = await callWithFallback({ model: MODEL, messages: synthMsgs, clientId: input.clientId, botId: input.botId, conversationId: input.conversationId });
  return synthResult.completion.choices[0]?.message?.content ?? valid[0] ?? "";
}

/**
 * Tree aggregation: split perspectives into groups, summarise each group in
 * parallel, then merge the group summaries. Each group summary is itself cached
 * (kind "summary") so repeated subsets across runs avoid re-summarisation.
 */
async function synthesizeHierarchical(
  perspectives: string[],
  userContent: string,
  groupSize: number,
  input: StrategyInput,
  cacheStats: RunCacheStats,
  onProgress?: StrategyInput["onProgress"],
): Promise<string> {
  const valid = perspectives.filter(Boolean);
  const groups: string[][] = [];
  for (let i = 0; i < valid.length; i += groupSize) {
    groups.push(valid.slice(i, i + groupSize));
  }

  const summaries = await Promise.all(
    groups.map(async (group, gi) => {
      const groupText = group.map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n");
      const groupPrompt = `You are consolidating a subset of ${group.length} independent analytical perspectives on the same question. Produce a faithful, comprehensive summary that preserves every distinct point, fact, and nuance. Do not drop information or editorialize.

The ${group.length} perspectives:

${groupText}

Question: ${userContent}

Write the consolidated summary of this subset:`;

      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — summarizing group ${gi + 1}/${groups.length}…`, strategy: "parallel_synthesis" });

      const result = await withSemanticCache(
        { clientId: input.clientId, kind: "summary", queryText: `group-summary:${groupText}`, model: MODEL, estimatedCostUsd: estimateCost(MODEL, estimateTokens(groupText) + 250, 500) },
        async () => {
          const msgs = trimToFitContextWindow(
            [{ role: "system" as const, content: groupPrompt }, { role: "user" as const, content: userContent }],
            MODEL,
          );
          const r = await callWithFallback({ model: MODEL, messages: msgs, clientId: input.clientId, botId: input.botId, conversationId: input.conversationId });
          return r.completion.choices[0]?.message?.content ?? group[0] ?? "";
        },
        cacheStats,
      );
      return result.content;
    }),
  );

  const validSummaries = summaries.filter(Boolean);
  if (validSummaries.length === 1) return validSummaries[0];

  onProgress?.({ type: "conductor_synthesizing", content: `GalaxyMind — merging ${validSummaries.length} group summaries…`, strategy: "parallel_synthesis" });

  const mergePrompt = `You are synthesizing ${validSummaries.length} consolidated summaries (each already merged from several independent perspectives) into one definitive, authoritative response.

Rules:
- Integrate the strongest reasoning across all summaries
- Resolve contradictions by choosing the most defensible position
- Capture nuances raised across summaries
- Eliminate redundancy and write as a single unified voice

The ${validSummaries.length} summaries:

${validSummaries.map((s, i) => `--- Summary ${i + 1} ---\n${s}`).join("\n\n")}

Write the single definitive synthesized response:`;

  const mergeMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: mergePrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const mergeResult = await callWithFallback({ model: MODEL, messages: mergeMsgs, clientId: input.clientId, botId: input.botId, conversationId: input.conversationId });
  return mergeResult.completion.choices[0]?.message?.content ?? validSummaries[0] ?? "";
}

export async function executeParallelSynthesis(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  // Serve near-duplicate questions straight from the semantic cache.
  const served = await tryServeFinalFromCache(input);
  if (served) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — reusing cached answer for a near-identical question…", strategy: "parallel_synthesis" });
    return cacheHitResult(input, served, start);
  }

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — running ${agents.length} agents in parallel…`, strategy: "parallel_synthesis" });

  const temperatures = agents.map((_, i) => parseFloat((0.3 + i * (0.5 / Math.max(agents.length - 1, 1))).toFixed(2)));

  const perspectives: string[] = new Array(agents.length).fill("");
  let completed = 0;

  await Promise.all(
    agents.map(async (agent, i) => {
      try {
        perspectives[i] = await callAgent(agent.systemPrompt, userContent, temperatures[i], clientId, botId, conversationId);
      } catch {
        perspectives[i] = "";
      }
      completed++;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${completed}/${agents.length} perspectives captured`, strategy: "parallel_synthesis" });
    }),
  );

  // Adaptively choose flat vs hierarchical aggregation by projected cost/latency.
  const valid = perspectives.filter(Boolean);
  const decision = decideAggregationMode(valid, MODEL, input.taskDescription);
  const cacheStats = newRunCacheStats();
  console.log(`[ParallelSynthesis] aggregation=${decision.mode} — ${decision.rationale}`);

  let content: string;
  if (decision.mode === "hierarchical") {
    content = await synthesizeHierarchical(perspectives, userContent, decision.groupSize, input, cacheStats, onProgress);
  } else {
    onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — synthesizing all perspectives into one definitive response…", strategy: "parallel_synthesis" });
    content = await synthesizeFlat(perspectives, userContent, input);
  }

  if (!content) content = valid[0] ?? "";

  await storeFinalInCache(input, content);

  return {
    content,
    agentsUsed: agents.map((a) => a.name),
    durationMs: Date.now() - start,
    telemetry: {
      aggregationMode: decision.mode,
      cacheHit: false,
      cacheHitRate: cacheHitRate(cacheStats),
      cacheSimilarity: cacheStats.hits > 0 ? cacheStats.bestSimilarity : null,
      cacheSavingsUsd: cacheStats.savedCostUsd,
      adaptiveSavingsUsd: decision.savingsUsd,
      adaptiveSavingsMs: Math.round(decision.savingsMs),
    },
  };
}

export async function executeSequentialDebate(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  const served = await tryServeFinalFromCache(input);
  if (served) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — reusing cached answer for a near-identical question…", strategy: "sequential_debate" });
    return cacheHitResult(input, served, start);
  }

  onProgress?.({ type: "conductor_progress", content: "GalaxyMind — starting sequential debate…", strategy: "sequential_debate" });

  const [proposer, ...debaters] = agents;

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${proposer.name} forming initial position…`, strategy: "sequential_debate" });
  let currentPosition = await callAgent(proposer.systemPrompt, userContent, 0.7, clientId, botId, conversationId);

  for (let i = 0; i < debaters.length; i++) {
    const debater = debaters[i];
    const debatePrompt = `${debater.systemPrompt}

The previous agent produced this position:
---
${currentPosition}
---

Critically evaluate this position. Identify weaknesses, gaps, or errors. Then produce a refined, improved response that incorporates the strongest elements while correcting the flaws. User's original question: ${userContent}`;

    onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${debater.name} critiquing and refining… (${i + 2}/${agents.length})`, strategy: "sequential_debate" });
    const refined = await callAgent(debater.systemPrompt, debatePrompt, 0.6, clientId, botId, conversationId);
    if (refined) currentPosition = refined;
  }

  onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — debate complete, finalizing response…", strategy: "sequential_debate" });

  await storeFinalInCache(input, currentPosition);

  return {
    content: currentPosition,
    agentsUsed: agents.map((a) => a.name),
    durationMs: Date.now() - start,
    telemetry: { cacheHit: false, cacheHitRate: 0, cacheSavingsUsd: 0 },
  };
}

export async function executeHierarchicalDelegation(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  const served = await tryServeFinalFromCache(input);
  if (served) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — reusing cached answer for a near-identical question…", strategy: "hierarchical_delegation" });
    return cacheHitResult(input, served, start);
  }

  const cacheStats = newRunCacheStats();
  const [lead, ...specialists] = agents;

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${lead.name} decomposing task into subtasks…`, strategy: "hierarchical_delegation" });

  const decompositionPrompt = `${lead.systemPrompt}

You are the lead agent. Decompose the following task into exactly ${specialists.length} specific subtask(s), one per available specialist agent.
Available specialists: ${specialists.map((s, i) => `${i + 1}. ${s.name}`).join(", ")}

Task: ${userContent}

Return a JSON array of subtask strings, one per specialist, in order. Return ONLY valid JSON like: ["subtask for specialist 1", "subtask for specialist 2"]`;

  const decompositionMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: decompositionPrompt }, { role: "user" as const, content: userContent }],
    FALLBACK_MODEL,
  );
  const decompResult = await callWithFallback({ model: FALLBACK_MODEL, messages: decompositionMsgs, clientId, botId, conversationId });
  const decompRaw = decompResult.completion.choices[0]?.message?.content ?? "[]";

  let subtasks: string[] = [];
  try {
    const match = decompRaw.match(/\[[\s\S]*\]/);
    subtasks = match ? (JSON.parse(match[0]) as string[]) : [];
  } catch {
    subtasks = specialists.map(() => userContent);
  }

  const specialistOutputs: Array<{ name: string; output: string }> = [];

  await Promise.all(
    specialists.map(async (specialist, i) => {
      const subtask = subtasks[i] ?? userContent;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${specialist.name} executing subtask ${i + 1}/${specialists.length}…`, strategy: "hierarchical_delegation" });
      // Specialist subtasks recur across runs — cache by role + subtask.
      const { content: out } = await withSemanticCache(
        {
          clientId,
          kind: "agent",
          queryText: `${specialist.name}: ${subtask}`,
          model: MODEL,
          estimatedCostUsd: estimateCost(MODEL, estimateTokens(subtask) + 250, 700),
        },
        () => callAgent(specialist.systemPrompt, subtask, 0.6, clientId, botId, conversationId),
        cacheStats,
      );
      specialistOutputs[i] = { name: specialist.name, output: out };
    }),
  );

  onProgress?.({ type: "conductor_synthesizing", content: `GalaxyMind — ${lead.name} integrating specialist outputs…`, strategy: "hierarchical_delegation" });

  const integrationPrompt = `${lead.systemPrompt}

You decomposed a task and your specialists have completed their subtasks. Integrate their outputs into a single, coherent, complete response.

Original task: ${userContent}

Specialist outputs:
${specialistOutputs.map((s, i) => `--- ${s.name} (subtask ${i + 1}) ---\n${s.output}`).join("\n\n")}

Write the final integrated response that synthesizes all specialist work into a unified answer:`;

  const integrationMsgs = trimToFitContextWindow(
    [{ role: "system" as const, content: integrationPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const integrationResult = await callWithFallback({ model: MODEL, messages: integrationMsgs, clientId, botId, conversationId });
  const content = integrationResult.completion.choices[0]?.message?.content ?? specialistOutputs.map((s) => s.output).join("\n\n");

  await storeFinalInCache(input, content);

  return {
    content,
    agentsUsed: agents.map((a) => a.name),
    durationMs: Date.now() - start,
    telemetry: {
      cacheHit: false,
      cacheHitRate: cacheHitRate(cacheStats),
      cacheSimilarity: cacheStats.hits > 0 ? cacheStats.bestSimilarity : null,
      cacheSavingsUsd: cacheStats.savedCostUsd,
    },
  };
}

export async function executeRoundRobinReview(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId } = input;

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  const served = await tryServeFinalFromCache(input);
  if (served) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — reusing cached answer for a near-identical question…", strategy: "round_robin_review" });
    return cacheHitResult(input, served, start);
  }

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${agents[0].name} drafting initial response…`, strategy: "round_robin_review" });

  let currentDraft = await callAgent(agents[0].systemPrompt, userContent, 0.7, clientId, botId, conversationId);

  for (let i = 1; i < agents.length; i++) {
    const agent = agents[i];
    const buildOnPrompt = `${agent.systemPrompt}

A previous agent drafted this response to the user's question:
---
${currentDraft}
---

Build on this draft. Enhance it with your expertise — add depth, correct any errors, fill gaps, and improve clarity. The result should be meaningfully better than the draft.

Original question: ${userContent}`;

    onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${agent.name} building on draft… (${i + 1}/${agents.length})`, strategy: "round_robin_review" });
    const improved = await callAgent(agent.systemPrompt, buildOnPrompt, 0.65, clientId, botId, conversationId);
    if (improved) currentDraft = improved;
  }

  onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — round robin complete, delivering final response…", strategy: "round_robin_review" });

  await storeFinalInCache(input, currentDraft);

  return {
    content: currentDraft,
    agentsUsed: agents.map((a) => a.name),
    durationMs: Date.now() - start,
    telemetry: { cacheHit: false, cacheHitRate: 0, cacheSavingsUsd: 0 },
  };
}

export async function executeStrategy(
  strategy: CommunicationStrategy,
  input: StrategyInput,
): Promise<StrategyResult> {
  switch (strategy) {
    case "parallel_synthesis":
      return executeParallelSynthesis(input);
    case "sequential_debate":
      return executeSequentialDebate(input);
    case "hierarchical_delegation":
      return executeHierarchicalDelegation(input);
    case "round_robin_review":
      return executeRoundRobinReview(input);
    default:
      return executeParallelSynthesis(input);
  }
}
