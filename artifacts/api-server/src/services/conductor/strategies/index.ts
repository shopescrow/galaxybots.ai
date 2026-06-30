import { callWithFallback, ModelTier } from "../../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { trimToFitContextWindow, estimateTokens } from "../../ai-safety/context-window";
import { runFanOut } from "../../ai-safety/internal-concurrency";
import { checkCostCapAlerts } from "../../analytics/cost-caps";
import { selectTierForCategory, modelForTier } from "../../ai-safety/margin-guard";
import {
  selectModelForTask,
  recordModelSelection,
  recordModelOutcome,
  getModelOptimizerSettings,
  getModelReputationPriors,
  estimateDifficultyFromInput,
  bucketDifficulty,
  auditModelDecision,
  FRONTIER_CANDIDATE_MODELS,
  EFFICIENT_CANDIDATE_MODELS,
} from "../../ai-safety/model-router";
import { estimateCost } from "../../analytics/llm-usage";
import { decideAggregationMode, type AggregationMode } from "../adaptive-aggregation.js";
import {
  lookupSemanticCache,
  storeSemanticCache,
  withSemanticCache,
  newRunCacheStats,
  cacheHitRate,
} from "../semantic-cache.js";
import { treeAggregate } from "../../scaling/scaling-primitives";
import { scalingConfig, isScalingActive } from "../../scaling/scaling-config";
import type { CommunicationStrategy, TaskCategory } from "@workspace/db";
import { aggregateWithFidelityGuardrail, makeDefaultDeps } from "../aggregation/hierarchical-aggregator";
import type { AggregationTrace } from "../aggregation/aggregation-trace";

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
  sessionId?: number;
  /** Task category — drives per-category aggregation fidelity thresholds AND margin-aware tier routing. */
  taskCategory?: TaskCategory;
  /** Plan tier name used to size the internal fan-out concurrency pool. */
  plan?: string | null;
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void;
  /**
   * Internal: the model-selection decision resolved once per run by
   * resolveAgentModelForRun and cached here so nested strategy fallbacks
   * (e.g. sequential_debate → parallel_synthesis) reuse the same choice and
   * never double-record telemetry. Not set by callers.
   */
  __resolvedModel?: { model: string; tier: ModelTier; telemetryId: number };
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
  /** Set when hierarchical aggregation with the fidelity guardrail ran. */
  aggregationTrace?: AggregationTrace;
}

const MODEL = resolveCapability(ModelCapability.REASONING_PREMIUM);
const FALLBACK_MODEL = resolveCapability(ModelCapability.REASONING_EFFICIENT);

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

/**
 * Per-tier budget gate evaluated BEFORE each fan-out tier. When the client's
 * monthly cost cap is exhausted we degrade (collapse to a single perspective,
 * skip synthesis) instead of overshooting the cap mid-run.
 */
async function checkTierBudgetExhausted(clientId?: number): Promise<boolean> {
  if (clientId == null) return false;
  try {
    const r = await checkCostCapAlerts(clientId);
    return !r.withinBudget;
  } catch {
    return false;
  }
}

/** Resolve the model an individual agent call should use given the task category. */
function resolveAgentModel(taskCategory?: string): { model: string; tier: ModelTier } {
  const tier = taskCategory ? selectTierForCategory(taskCategory) : ModelTier.FRONTIER;
  if (tier === ModelTier.FRONTIER) return { model: MODEL, tier };
  return { model: modelForTier(tier), tier };
}

/**
 * Resolve the model for a run via the self-optimizing model router (task #231),
 * recording per-model telemetry. Resolved once per run and cached on the input
 * so nested strategy fallbacks reuse the same choice. When the optimizer is
 * disabled (default) the router returns the static `resolveAgentModel` result
 * verbatim, so behavior is identical to pre-existing fallback routing.
 *
 * Best-effort: any failure degrades to the static fallback and never breaks the
 * run. The chosen model still flows through callWithFallback (the single safe
 * execution path), so the optimizer can never bypass governance or cost caps.
 */
async function resolveAgentModelForRun(
  input: StrategyInput,
): Promise<{ model: string; tier: ModelTier; telemetryId: number }> {
  if (input.__resolvedModel) return input.__resolvedModel;

  const fallback = resolveAgentModel(input.taskCategory);
  const taskCategory = input.taskCategory ?? "general";

  let resolved: { model: string; tier: ModelTier; telemetryId: number } = {
    model: fallback.model,
    tier: fallback.tier,
    telemetryId: -1,
  };

  try {
    const difficultyScore = estimateDifficultyFromInput(estimateTokens(input.userContent));
    const decision = await selectModelForTask({
      taskCategory,
      clientId: input.clientId,
      botId: input.botId,
      difficultyScore,
      fallbackModel: fallback.model,
      fallbackTier: fallback.tier,
    });

    const telemetryId = await recordModelSelection({
      clientId: input.clientId,
      botId: input.botId,
      sessionId: input.sessionId,
      taskCategory,
      model: decision.model,
      modelTier: decision.tier,
      difficultyBucket: decision.difficultyBucket,
      selectionMode: decision.mode,
      chosenModel: decision.pendingModel ?? undefined,
    });

    auditModelDecision(decision, { clientId: input.clientId, sessionId: input.sessionId, botId: input.botId }).catch(() => {});

    resolved = { model: decision.model, tier: decision.tier, telemetryId };
  } catch (err) {
    console.warn("[Strategies] resolveAgentModelForRun failed, using fallback:", err instanceof Error ? err.message : err);
  }

  input.__resolvedModel = resolved;
  return resolved;
}

/** Use an LLM judge to score two answers (0..1 each) against the question. */
async function judgeAnswers(question: string, liveAnswer: string, candidateAnswer: string, ctx: CallCtx): Promise<{ live: number; candidate: number } | null> {
  try {
    const prompt = `You are an impartial answer-quality judge. Score each of the two answers to the user's question on a 0.0–1.0 scale (1.0 = excellent, complete, accurate; 0.0 = useless or wrong).

Question:
${question}

Answer A:
${liveAnswer.slice(0, 4000)}

Answer B:
${candidateAnswer.slice(0, 4000)}

Return ONLY valid JSON: {"a": <0..1>, "b": <0..1>}`;
    const res = await callWithFallback({
      model: FALLBACK_MODEL,
      messages: [
        { role: "system", content: "You are a strict answer-quality judge. Return only JSON." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: 60,
      preferredTier: ModelTier.EFFICIENT,
      clientId: ctx.clientId,
      botId: ctx.botId,
      conversationId: ctx.conversationId,
    });
    let raw = (res.completion.choices[0]?.message?.content ?? "{}").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) raw = match[0];
    const parsed = JSON.parse(raw) as { a?: number; b?: number };
    const live = Math.min(1, Math.max(0, Number(parsed.a)));
    const candidate = Math.min(1, Math.max(0, Number(parsed.b)));
    if (!Number.isFinite(live) || !Number.isFinite(candidate)) return null;
    return { live, candidate };
  } catch {
    return null;
  }
}

/**
 * Shadow/comparison rollout (task #231 step 4). On an owner-gated sample, run a
 * candidate model (the best-reputation model NOT currently serving) in parallel
 * on the same question, score both with a judge, and record the candidate as a
 * SHADOW telemetry row with its resolved reward. Shadow rows are excluded from
 * live selection priors until the periodic re-evaluation job promotes a winner.
 *
 * Fire-and-forget: never blocks or alters the live user response. The candidate
 * answer is discarded — only its score is recorded.
 */
async function maybeRunShadow(input: StrategyInput, liveContent: string, liveModel: string): Promise<void> {
  try {
    if (input.clientId == null || !liveContent) return;
    const settings = await getModelOptimizerSettings(input.clientId);
    if (!settings.enabled || !settings.shadowEnabled) return;
    if (Math.random() >= settings.shadowSampleRate) return;

    const taskCategory = input.taskCategory ?? "general";
    const liveTier = input.__resolvedModel?.tier ?? ModelTier.FRONTIER;
    const pool = liveTier === ModelTier.FRONTIER ? FRONTIER_CANDIDATE_MODELS : EFFICIENT_CANDIDATE_MODELS;
    const difficultyBucket = bucketDifficulty(estimateDifficultyFromInput(estimateTokens(input.userContent)));

    // Candidate = highest-reputation model that is NOT the one that served live.
    const priors = await getModelReputationPriors(taskCategory, pool, difficultyBucket);
    const candidate = priors
      .filter((p) => p.model !== liveModel)
      .sort((a, b) => b.avgReward - a.avgReward)[0]?.model;
    if (!candidate) return;

    const callStart = Date.now();
    const candidateAnswer = await callAgent(
      "You are an expert assistant. Answer the user's question directly and completely.",
      input.userContent,
      0.7,
      input.clientId,
      input.botId,
      input.conversationId,
      input.sessionId,
      candidate,
    );
    const latencyMs = Date.now() - callStart;
    if (!candidateAnswer) return;

    const scores = await judgeAnswers(input.userContent, liveContent, candidateAnswer, {
      clientId: input.clientId,
      botId: input.botId,
      conversationId: input.conversationId,
    });
    if (!scores) return;

    const candidateCost = estimateCost(candidate, estimateTokens(input.userContent) + 200, estimateTokens(candidateAnswer));
    const shadowId = await recordModelSelection({
      clientId: input.clientId,
      botId: input.botId,
      sessionId: input.sessionId,
      taskCategory,
      model: candidate,
      modelTier: liveTier,
      difficultyBucket,
      selectionMode: "shadow",
      shadow: true,
      chosenModel: liveModel,
    });
    await recordModelOutcome(shadowId, {
      quality: scores.candidate,
      costUsd: candidateCost,
      latencyMs,
      qualityWeight: settings.qualityWeight,
    });
    console.log(`[Strategies] shadow comparison: live=${liveModel}(${scores.live.toFixed(2)}) candidate=${candidate}(${scores.candidate.toFixed(2)})`);
  } catch (err) {
    console.warn("[Strategies] maybeRunShadow failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

async function callAgent(
  systemPrompt: string,
  userContent: string,
  temperature = 0.7,
  clientId?: number,
  botId?: number,
  conversationId?: number,
  sessionId?: number,
  model: string = MODEL,
  preferredTier?: ModelTier,
): Promise<string> {
  const msgs = trimToFitContextWindow(
    [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: userContent }],
    model,
  );
  const result = await callWithFallback({
    model,
    messages: msgs,
    temperature,
    clientId,
    botId,
    conversationId,
    sessionId,
    ...(preferredTier ? { preferredTier } : {}),
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

interface CallCtx {
  clientId?: number;
  botId?: number;
  conversationId?: number;
}

async function llmCombine(systemPrompt: string, userContent: string, ctx: CallCtx): Promise<string> {
  const msgs = trimToFitContextWindow(
    [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: userContent }],
    MODEL,
  );
  const result = await callWithFallback({ model: MODEL, messages: msgs, ...ctx });
  return result.completion.choices[0]?.message?.content ?? "";
}

type ProgressFn = StrategyInput["onProgress"];

/**
 * Hierarchically aggregate N independent perspectives into one definitive response.
 * Clusters into ~√n groups, consolidates each group, then synthesizes the bounded set of
 * group summaries — keeping the largest prompt O(√n) so large fan-outs never overflow the
 * context window. Streams a progress event per aggregation tier.
 */
async function aggregatePerspectives(
  perspectives: string[],
  userContent: string,
  ctx: CallCtx,
  onProgress: ProgressFn,
  strategy: string,
): Promise<string> {
  const items = perspectives.filter(Boolean);

  return treeAggregate<string>({
    items,
    toText: (p) => p,
    fanIn: scalingConfig.aggregationFanIn,
    onTier: (info) =>
      onProgress?.({
        type: "conductor_progress",
        content: `GalaxyMind — tree-aggregating ${info.total} perspectives into ${info.groups} clusters (tier ${info.tier})…`,
        strategy,
      }),
    summarizeGroup: async (texts, meta) => {
      const groupPrompt = `You are consolidating ${texts.length} independent analytical perspectives (cluster ${meta.groupIndex + 1} of ${meta.groupCount}) on the same question into ONE cohesive intermediate perspective.

Rules:
- Integrate the strongest reasoning across these perspectives
- Resolve trivial contradictions and remove redundancy
- Preserve every distinct insight and nuance

The ${texts.length} perspectives:

${texts.map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n")}

Write the consolidated intermediate perspective:`;
      const out = await llmCombine(groupPrompt, userContent, ctx);
      return out || texts.join("\n\n");
    },
    finalCombine: async (texts) => {
      const finalPrompt = `You are synthesizing ${texts.length} consolidated analytical perspectives on the same question. Produce a single, definitive, authoritative response.

Rules:
- Integrate the strongest reasoning from all perspectives
- Resolve contradictions by choosing the most defensible position
- Capture nuances raised across multiple perspectives
- Eliminate redundancy and write as a single unified voice

The ${texts.length} perspectives:

${texts.map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n")}

Write the single definitive synthesized response:`;
      const out = await llmCombine(finalPrompt, userContent, ctx);
      return out || texts.find(Boolean) || "";
    },
  });
}

export async function executeParallelSynthesis(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { userContent, onProgress, clientId, botId, conversationId, sessionId, taskCategory, plan } = input;
  let { agents } = input;
  const { model: agentModel, tier: agentTier } = await resolveAgentModelForRun(input);

  // ── In-loop budget gate: degrade to a single perspective if the cap is hit ──
  if (await checkTierBudgetExhausted(clientId)) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — monthly cost cap reached; degrading to a single perspective.", strategy: "parallel_synthesis", degraded: true });
    agents = agents.slice(0, 1);
  }

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

  await runFanOut(
    agents.map((agent, i) => async () => {
      try {
        perspectives[i] = await callAgent(agent.systemPrompt, userContent, temperatures[i], clientId, botId, conversationId, sessionId, agentModel, agentTier);
      } catch {
        perspectives[i] = "";
      }
      completed++;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${completed}/${agents.length} perspectives captured`, strategy: "parallel_synthesis" });
    }),
    { clientId, plan },
  );

  const valid = perspectives.filter(Boolean);

  // Single-agent (or budget-degraded) runs skip the synthesis call entirely.
  if (agents.length < 2) {
    return { content: valid[0] ?? "", agentsUsed: agents.map((a) => a.name), durationMs: Date.now() - start };
  }

  // Adaptively choose flat vs hierarchical aggregation by projected cost/latency.
  const decision = decideAggregationMode(valid, MODEL, input.taskDescription);
  const cacheStats = newRunCacheStats();
  console.log(`[ParallelSynthesis] aggregation=${decision.mode} — ${decision.rationale}`);

  let content: string;
  let aggregationMode: AggregationMode = decision.mode;
  let aggregationTrace: AggregationTrace | undefined;
  if (isScalingActive(scalingConfig.synthesisAggregation, agents.length)) {
    // Large fan-out (task #213): bounded √n recursive tree-aggregation keeps each synthesis
    // prompt O(√n) so very large agent counts never overflow the context window. This takes
    // precedence over the adaptive flat/hierarchical decision once past the configured threshold.
    aggregationMode = "hierarchical";
    content =
      (await aggregatePerspectives(perspectives, userContent, { clientId, botId, conversationId }, onProgress, "parallel_synthesis")) ||
      valid[0] ||
      "";
  } else if (decision.mode === "hierarchical") {
    // Group-summary cache: reuse summaries of repeated perspective subsets across
    // runs, wired into the fidelity guardrail's summarize step so the cost
    // optimization survives alongside the guardrail.
    const baseDeps = makeDefaultDeps({ clientId, botId, conversationId });
    const cachedSummarize = async (texts: string[], uc: string): Promise<string> => {
      const groupText = texts.map((p, i) => `--- Perspective ${i + 1} ---\n${p}`).join("\n\n");
      const res = await withSemanticCache(
        { clientId, kind: "summary", queryText: `group-summary:${groupText}`, model: MODEL, estimatedCostUsd: estimateCost(MODEL, estimateTokens(groupText) + 250, 500) },
        () => baseDeps.summarize(texts, uc),
        cacheStats,
      );
      return res.content;
    };

    // Fidelity guardrail: cluster perspectives, expand high-disagreement branches
    // losslessly, score against a flat baseline and fall back to flat synthesis
    // if fidelity degrades. Adaptive group sizing flows in as the cluster size.
    const aggregation = await aggregateWithFidelityGuardrail({
      perspectives,
      userContent,
      taskCategory,
      clientId,
      botId,
      conversationId,
      onProgress,
      configOverrides: { clusterSize: decision.groupSize },
      deps: { summarize: cachedSummarize },
    });
    content = aggregation.content;
    aggregationTrace = aggregation.trace;
  } else {
    onProgress?.({ type: "conductor_synthesizing", content: "GalaxyMind — synthesizing all perspectives into one definitive response…", strategy: "parallel_synthesis" });
    content = await synthesizeFlat(perspectives, userContent, input);
  }

  if (!content) content = valid[0] ?? "";

  await storeFinalInCache(input, content);

  // Owner-gated shadow rollout — offline learning, never blocks the response.
  void maybeRunShadow(input, content, agentModel);

  return {
    content,
    agentsUsed: agents.map((a) => a.name),
    durationMs: Date.now() - start,
    telemetry: {
      aggregationMode,
      cacheHit: false,
      cacheHitRate: cacheHitRate(cacheStats),
      cacheSimilarity: cacheStats.hits > 0 ? cacheStats.bestSimilarity : null,
      cacheSavingsUsd: cacheStats.savedCostUsd,
      adaptiveSavingsUsd: decision.savingsUsd,
      adaptiveSavingsMs: Math.round(decision.savingsMs),
    },
    aggregationTrace,
  };
}

export async function executeSequentialDebate(input: StrategyInput): Promise<StrategyResult> {
  const start = Date.now();
  const { agents, userContent, onProgress, clientId, botId, conversationId, sessionId, taskCategory } = input;
  const { model: agentModel, tier: agentTier } = await resolveAgentModelForRun(input);

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
  let currentPosition = await callAgent(proposer.systemPrompt, userContent, 0.7, clientId, botId, conversationId, sessionId, agentModel, agentTier);

  for (let i = 0; i < debaters.length; i++) {
    const debater = debaters[i];
    const debatePrompt = `${debater.systemPrompt}

The previous agent produced this position:
---
${currentPosition}
---

Critically evaluate this position. Identify weaknesses, gaps, or errors. Then produce a refined, improved response that incorporates the strongest elements while correcting the flaws. User's original question: ${userContent}`;

    onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${debater.name} critiquing and refining… (${i + 2}/${agents.length})`, strategy: "sequential_debate" });
    const refined = await callAgent(debater.systemPrompt, debatePrompt, 0.6, clientId, botId, conversationId, sessionId, agentModel, agentTier);
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
  const { agents, userContent, onProgress, clientId, botId, conversationId, sessionId, taskCategory, plan } = input;
  const { model: agentModel, tier: agentTier } = await resolveAgentModelForRun(input);

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  // ── In-loop budget gate: degrade to single-perspective parallel run on cap ──
  if (await checkTierBudgetExhausted(clientId)) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — monthly cost cap reached; degrading hierarchical delegation.", strategy: "hierarchical_delegation", degraded: true });
    return executeParallelSynthesis({ ...input, agents: agents.slice(0, 1) });
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
  const decompResult = await callWithFallback({ model: FALLBACK_MODEL, messages: decompositionMsgs, clientId, botId, conversationId, sessionId, preferredTier: ModelTier.EFFICIENT });
  const decompRaw = decompResult.completion.choices[0]?.message?.content ?? "[]";

  let subtasks: string[] = [];
  try {
    const match = decompRaw.match(/\[[\s\S]*\]/);
    subtasks = match ? (JSON.parse(match[0]) as string[]) : [];
  } catch {
    subtasks = specialists.map(() => userContent);
  }

  const specialistOutputs: Array<{ name: string; output: string }> = [];

  await runFanOut(
    specialists.map((specialist, i) => async () => {
      const subtask = subtasks[i] ?? userContent;
      onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${specialist.name} executing subtask ${i + 1}/${specialists.length}…`, strategy: "hierarchical_delegation" });
      // Specialist subtasks recur across runs — cache by role + subtask.
      const { content: out } = await withSemanticCache(
        {
          clientId,
          kind: "agent",
          queryText: `${specialist.name}: ${subtask}`,
          model: agentModel,
          estimatedCostUsd: estimateCost(agentModel, estimateTokens(subtask) + 250, 700),
        },
        () => callAgent(specialist.systemPrompt, subtask, 0.6, clientId, botId, conversationId, sessionId, agentModel, agentTier),
        cacheStats,
      );
      specialistOutputs[i] = { name: specialist.name, output: out };
    }),
    { clientId, plan },
  );

  onProgress?.({ type: "conductor_synthesizing", content: `GalaxyMind — ${lead.name} integrating specialist outputs…`, strategy: "hierarchical_delegation" });

  let content: string;
  if (isScalingActive(scalingConfig.synthesisAggregation, specialists.length)) {
    // Many specialists: tree-aggregate their outputs so the lead's integration prompt stays bounded.
    const renderOutput = (s: { name: string; output: string }, i: number) => `--- ${s.name} (subtask ${i + 1}) ---\n${s.output}`;
    content =
      (await treeAggregate<{ name: string; output: string }>({
        items: specialistOutputs.filter((s) => s && s.output),
        toText: renderOutput,
        fanIn: scalingConfig.aggregationFanIn,
        onTier: (info) =>
          onProgress?.({
            type: "conductor_progress",
            content: `GalaxyMind — ${lead.name} integrating ${info.total} specialist outputs in ${info.groups} clusters (tier ${info.tier})…`,
            strategy: "hierarchical_delegation",
          }),
        summarizeGroup: async (texts, meta) => {
          const groupPrompt = `${lead.systemPrompt}

You are integrating a cluster of specialist outputs (cluster ${meta.groupIndex + 1} of ${meta.groupCount}) for the task below into ONE cohesive partial result. Preserve every distinct contribution.

Original task: ${userContent}

Specialist outputs:
${texts.join("\n\n")}

Write the consolidated partial result for this cluster:`;
          const out = await llmCombine(groupPrompt, userContent, { clientId, botId, conversationId });
          return out || texts.join("\n\n");
        },
        finalCombine: async (texts) => {
          const finalPrompt = `${lead.systemPrompt}

You decomposed a task and your specialists' work has been consolidated into ${texts.length} cluster result(s). Integrate them into a single, coherent, complete response.

Original task: ${userContent}

Consolidated specialist results:
${texts.map((t, i) => `--- Cluster ${i + 1} ---\n${t}`).join("\n\n")}

Write the final integrated response that synthesizes all specialist work into a unified answer:`;
          const out = await llmCombine(finalPrompt, userContent, { clientId, botId, conversationId });
          return out || texts.join("\n\n");
        },
      })) || specialistOutputs.map((s) => s.output).join("\n\n");
  } else {
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
    const integrationResult = await callWithFallback({ model: MODEL, messages: integrationMsgs, clientId, botId, conversationId, sessionId });
    content = integrationResult.completion.choices[0]?.message?.content ?? specialistOutputs.map((s) => s.output).join("\n\n");
  }

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
  const { agents, userContent, onProgress, clientId, botId, conversationId, sessionId, taskCategory } = input;
  const { model: agentModel, tier: agentTier } = await resolveAgentModelForRun(input);

  if (agents.length < 2) {
    return executeParallelSynthesis(input);
  }

  const served = await tryServeFinalFromCache(input);
  if (served) {
    onProgress?.({ type: "conductor_progress", content: "GalaxyMind — reusing cached answer for a near-identical question…", strategy: "round_robin_review" });
    return cacheHitResult(input, served, start);
  }

  onProgress?.({ type: "conductor_progress", content: `GalaxyMind — ${agents[0].name} drafting initial response…`, strategy: "round_robin_review" });

  let currentDraft = await callAgent(agents[0].systemPrompt, userContent, 0.7, clientId, botId, conversationId, sessionId, agentModel, agentTier);

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
    const improved = await callAgent(agent.systemPrompt, buildOnPrompt, 0.65, clientId, botId, conversationId, sessionId, agentModel, agentTier);
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
