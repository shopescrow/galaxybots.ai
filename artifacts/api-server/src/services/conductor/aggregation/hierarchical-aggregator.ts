import type { TaskCategory } from "@workspace/db";
import { callWithFallback, ModelTier } from "../../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { trimToFitContextWindow } from "../../ai-safety/context-window";
import { computeDivergence, computePairwiseDivergence } from "./divergence";
import { getAggregationConfig, type AggregationFidelityConfig } from "./fidelity-config";
import { type AggregationTrace, type AggregationClusterTrace, emptyAggregationTrace } from "./aggregation-trace";

const SYNTH_MODEL = resolveCapability(ModelCapability.REASONING_PREMIUM);
const EFFICIENT_MODEL = resolveCapability(ModelCapability.REASONING_EFFICIENT);

/**
 * Injectable side-effecting dependencies. Production wires these to real LLM
 * calls; the golden-set harness injects deterministic, network-free stubs so
 * aggregation quality can be regression-tested in CI.
 */
export interface AggregatorDeps {
  /** Summarize a cluster of member outputs into a compact, lossy summary. */
  summarize: (texts: string[], userContent: string) => Promise<string>;
  /** Synthesize cluster parts (summaries and/or expansions) into one answer. */
  synthesize: (parts: string[], userContent: string) => Promise<string>;
  /** Score answer quality 0..1 for the given prompt (the evaluator gate). */
  scoreQuality: (content: string, prompt: string) => Promise<number>;
  /** Source of randomness for fidelity sampling (override for determinism). */
  random?: () => number;
}

export interface AggregateInput {
  perspectives: string[];
  userContent: string;
  taskCategory?: TaskCategory;
  configOverrides?: Partial<AggregationFidelityConfig>;
  clientId?: number;
  botId?: number;
  conversationId?: number;
  onProgress?: (event: { type: string; content: string; [key: string]: unknown }) => void;
  deps?: Partial<AggregatorDeps>;
}

export interface AggregateResult {
  content: string;
  trace: AggregationTrace;
}

// ── Default production dependencies (real LLM calls) ─────────────────────────

export function makeDefaultDeps(ctx: {
  clientId?: number;
  botId?: number;
  conversationId?: number;
}): AggregatorDeps {
  const { clientId, botId, conversationId } = ctx;

  return {
    async summarize(texts, userContent) {
      const prompt = `You are condensing ${texts.length} closely-aligned analytical perspectives that largely agree. Produce a faithful, compact summary that preserves every distinct claim, caveat, and recommendation. Do NOT drop minority points.

Question: ${userContent}

Perspectives:
${texts.map((t, i) => `--- ${i + 1} ---\n${t}`).join("\n\n")}

Faithful compact summary:`;
      const msgs = trimToFitContextWindow(
        [{ role: "system" as const, content: prompt }, { role: "user" as const, content: userContent }],
        EFFICIENT_MODEL,
      );
      const res = await callWithFallback({ model: EFFICIENT_MODEL, messages: msgs, clientId, botId, conversationId, preferredTier: ModelTier.EFFICIENT });
      return res.completion.choices[0]?.message?.content ?? texts.find(Boolean) ?? "";
    },

    async synthesize(parts, userContent) {
      const prompt = `You are synthesizing ${parts.length} analytical branches into a single, definitive, authoritative response. Some branches are summaries of agreeing perspectives; others are expanded sets of CONFLICTING perspectives that must NOT be flattened — surface genuine disagreements explicitly rather than silently picking one side.

Rules:
- Integrate the strongest reasoning across all branches
- Where branches genuinely conflict, present the conflict and the conditions under which each holds
- Preserve nuance and minority signal
- Write as a single unified voice, no redundancy

The ${parts.length} branches:

${parts.map((p, i) => `--- Branch ${i + 1} ---\n${p}`).join("\n\n")}

Write the single definitive synthesized response:`;
      const msgs = trimToFitContextWindow(
        [{ role: "system" as const, content: prompt }, { role: "user" as const, content: userContent }],
        SYNTH_MODEL,
      );
      const res = await callWithFallback({ model: SYNTH_MODEL, messages: msgs, clientId, botId, conversationId });
      return res.completion.choices[0]?.message?.content ?? parts.find(Boolean) ?? "";
    },

    async scoreQuality(content, prompt) {
      const evalPrompt = `You are an AI quality evaluator. Score how well the RESPONSE answers the PROMPT, paying special attention to whether it preserves nuance and surfaces genuine disagreements rather than glossing over them.

PROMPT: ${prompt.slice(0, 500)}

RESPONSE: ${content.slice(0, 2000)}

Return JSON only: {"completeness":<0..1>,"accuracy":<0..1>,"nuance":<0..1>}`;
      try {
        const res = await callWithFallback({
          model: EFFICIENT_MODEL,
          messages: [
            { role: "system", content: "You are a strict JSON-only response quality evaluator. Output only valid JSON." },
            { role: "user", content: evalPrompt },
          ],
          maxCompletionTokens: 150,
          clientId,
          botId,
          conversationId,
          preferredTier: ModelTier.EFFICIENT,
        });
        const raw = res.completion.choices[0]?.message?.content ?? "{}";
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]) as Record<string, unknown>; } catch { parsed = {}; } }
        }
        const completeness = clamp01(Number(parsed.completeness ?? 0.7));
        const accuracy = clamp01(Number(parsed.accuracy ?? 0.7));
        const nuance = clamp01(Number(parsed.nuance ?? 0.7));
        return (completeness + accuracy + nuance) / 3;
      } catch {
        return 0.7;
      }
    },
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

// ── Clustering ───────────────────────────────────────────────────────────────

/**
 * Greedy similarity clustering: repeatedly seed a cluster with the first
 * unclustered perspective and pull in its nearest neighbours (lowest pairwise
 * divergence) up to `clusterSize`. Deterministic and dependency-free.
 */
export function clusterPerspectives(
  perspectives: string[],
  indices: number[],
  clusterSize: number,
): number[][] {
  const remaining = [...indices];
  const clusters: number[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const cluster = [seed];

    const neighbours = remaining
      .map((idx) => ({ idx, d: computePairwiseDivergence(perspectives[seed], perspectives[idx]) }))
      .sort((a, b) => a.d - b.d);

    for (const { idx } of neighbours) {
      if (cluster.length >= clusterSize) break;
      cluster.push(idx);
    }

    for (const idx of cluster) {
      if (idx === seed) continue;
      const pos = remaining.indexOf(idx);
      if (pos >= 0) remaining.splice(pos, 1);
    }

    clusters.push(cluster);
  }

  return clusters;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Aggregate many agent perspectives into one answer with a fidelity guardrail.
 *
 * 1. Disagreement detection & lossless escalation: perspectives are clustered;
 *    each cluster's internal divergence is measured. Low-divergence clusters are
 *    summarized (lossy, saves context); clusters whose divergence exceeds the
 *    per-category threshold are EXPANDED losslessly so genuine conflicts survive
 *    into the final synthesis.
 * 2. Fidelity scoring + safe fallback: on a sampled basis, the hierarchical
 *    result is scored against a flat-synthesis baseline using the evaluator
 *    gate; if it retains less than `fidelityFloor` of baseline quality the run
 *    falls back to flat synthesis and is flagged for review.
 *
 * Below `minAgentsForClustering` perspectives the function stays flat (no
 * collapse, no information loss).
 */
export async function aggregateWithFidelityGuardrail(input: AggregateInput): Promise<AggregateResult> {
  const config = getAggregationConfig(input.taskCategory, input.configOverrides);
  const deps: AggregatorDeps = { ...makeDefaultDeps(input), ...(input.deps ?? {}) };
  const random = deps.random ?? input.deps?.random ?? Math.random;
  const onProgress = input.onProgress;

  const perspectives = input.perspectives.map((p) => p ?? "").filter((p) => p.trim().length > 0);
  const trace = emptyAggregationTrace(perspectives.length);
  trace.taskCategory = input.taskCategory;
  trace.fidelityFloor = config.fidelityFloor;
  trace.divergenceThreshold = config.divergenceEscalationThreshold;

  if (perspectives.length === 0) {
    return { content: "", trace };
  }

  const overall = computeDivergence(perspectives);
  trace.meanDivergence = round3(overall.meanDivergence);
  trace.maxDivergence = round3(overall.maxDivergence);

  // ── Flat path: too few perspectives to cluster → no collapse, no loss ───────
  if (perspectives.length < config.minAgentsForClustering) {
    const content = await deps.synthesize(perspectives, input.userContent);
    trace.strategy = "flat";
    trace.aggregationUsed = false;
    trace.treeDepth = 1;
    trace.notes.push(`Flat synthesis: ${perspectives.length} perspective(s) below clustering threshold (${config.minAgentsForClustering}).`);
    return { content, trace };
  }

  // ── Hierarchical path ───────────────────────────────────────────────────────
  trace.strategy = "hierarchical";
  trace.aggregationUsed = true;
  trace.treeDepth = 2;

  const indices = perspectives.map((_, i) => i);
  const clusters = clusterPerspectives(perspectives, indices, config.clusterSize);
  trace.clusterCount = clusters.length;

  const branchParts: string[] = [];
  const clusterTraces: AggregationClusterTrace[] = [];

  for (let c = 0; c < clusters.length; c++) {
    const members = clusters[c];
    const memberTexts = members.map((i) => perspectives[i]);
    const div = computeDivergence(memberTexts);
    const escalate = members.length > 1 && div.meanDivergence > config.divergenceEscalationThreshold;

    const clusterTrace: AggregationClusterTrace = {
      clusterId: c,
      memberIndices: members,
      size: members.length,
      divergence: round3(div.meanDivergence),
      escalated: escalate,
    };
    clusterTraces.push(clusterTrace);

    if (escalate) {
      // Lossless escalation: keep every member output intact so the genuine
      // disagreement survives into the final synthesis.
      branchParts.push(
        memberTexts.map((t, i) => `[Conflicting view ${i + 1} of cluster ${c + 1}]\n${t}`).join("\n\n"),
      );
      onProgress?.({
        type: "aggregation_escalation",
        content: `GalaxyMind — cluster ${c + 1} disagreement ${(div.meanDivergence * 100).toFixed(0)}% > ${(config.divergenceEscalationThreshold * 100).toFixed(0)}% threshold; expanding branch losslessly.`,
        clusterId: c,
        divergence: div.meanDivergence,
      });
    } else if (members.length === 1) {
      branchParts.push(memberTexts[0]);
    } else {
      branchParts.push(await deps.summarize(memberTexts, input.userContent));
    }
  }

  trace.clusters = clusterTraces;
  trace.escalatedClusterCount = clusterTraces.filter((c) => c.escalated).length;
  trace.notes.push(`Hierarchical: ${clusters.length} cluster(s), ${trace.escalatedClusterCount} expanded for disagreement.`);

  let hierarchicalContent = await deps.synthesize(branchParts, input.userContent);

  // ── Fidelity scoring + safe fallback (sampled) ──────────────────────────────
  const shouldScore = config.fidelitySampleRate >= 1 || random() < config.fidelitySampleRate;
  if (shouldScore) {
    trace.fidelityScored = true;
    const baselineContent = await deps.synthesize(perspectives, input.userContent);
    const [hierScore, baseScore] = await Promise.all([
      deps.scoreQuality(hierarchicalContent, input.userContent),
      deps.scoreQuality(baselineContent, input.userContent),
    ]);
    trace.fidelityScore = round3(hierScore);
    trace.baselineScore = round3(baseScore);
    trace.fidelityRatio = baseScore > 0 ? round3(hierScore / baseScore) : 1;

    const retained = baseScore > 0 ? hierScore / baseScore : 1;
    if (retained < config.fidelityFloor) {
      // Hierarchical aggregation degraded the answer — ship the flat baseline.
      hierarchicalContent = baselineContent;
      trace.fellBackToFlat = true;
      trace.flaggedForReview = true;
      trace.notes.push(
        `Fidelity ${(retained * 100).toFixed(0)}% of baseline < floor ${(config.fidelityFloor * 100).toFixed(0)}% — fell back to flat synthesis.`,
      );
      onProgress?.({
        type: "aggregation_fallback",
        content: `GalaxyMind — aggregation retained only ${(retained * 100).toFixed(0)}% of baseline quality; falling back to flat synthesis.`,
        fidelityScore: hierScore,
        baselineScore: baseScore,
      });
    } else {
      trace.notes.push(`Fidelity ${(retained * 100).toFixed(0)}% of baseline ≥ floor ${(config.fidelityFloor * 100).toFixed(0)}% — aggregation accepted.`);
    }
  }

  return { content: hierarchicalContent, trace };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
