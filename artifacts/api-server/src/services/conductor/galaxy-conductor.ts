import { db, conductorStrategiesTable } from "@workspace/db";
import { eq, and, avg, sql, lt } from "drizzle-orm";
import type { CommunicationStrategy, ConductorMeta } from "@workspace/db";
import { callWithFallback, ModelTier } from "../../services/ai-safety/model-fallback.js";
import type { StrategyTelemetry } from "./strategies/index.js";
import { getStrategyProfitPriors, fleetSizeBucket } from "../analytics/scaling-telemetry.js";

// Self-tuning reward blend: the conductor optimizes for quality AND profitability.
// Quality dominates so cost-cutting never wins by degrading output, but margin
// breaks ties and steers away from configurations that lose money at scale.
const QUALITY_REWARD_WEIGHT = 0.7;
const MARGIN_REWARD_WEIGHT = 0.3;

export function deriveModelTier(model: string): string {
  if (!model) return ModelTier.EFFICIENT;
  if (model.startsWith("llama") || model.startsWith("mistral") || model === "ollama") return ModelTier.LOCAL;
  if (model.startsWith("gpt-5-mini") || model.includes("haiku")) return ModelTier.EFFICIENT;
  return ModelTier.FRONTIER;
}

export const CONDUCTOR_TASK_CATEGORIES = [
  "research",
  "analysis",
  "execution",
  "review",
  "legal",
  "financial",
  "incident_response",
  "creative",
  "technical",
] as const;

export type ConductorTaskCategory = (typeof CONDUCTOR_TASK_CATEGORIES)[number];

const UCB1_EXPLORATION_CONSTANT = 0.3;
const MIN_SAMPLES_FOR_UCB1_DECISION = 5;

const STRATEGY_DESCRIPTIONS: Record<CommunicationStrategy, string> = {
  parallel_synthesis:
    "All agents run simultaneously at different temperatures; outputs are merged into one definitive response. Best for: broad analysis, creative tasks, when diverse perspectives improve quality.",
  sequential_debate:
    "Agent A responds, Agent B critiques and refines, Agent C critiques further. Each pass improves the output. Best for: controversial topics, high-stakes decisions, when accuracy matters most.",
  hierarchical_delegation:
    "Lead agent decomposes the task into subtasks and assigns them to specialists; lead then integrates all outputs. Best for: complex multi-part tasks, execution work, technical problems with clear sub-problems.",
  round_robin_review:
    "Agents take turns building on each other's output, each adding expertise. Best for: iterative refinement, creative work, tasks where incremental improvement compounds.",
};

export interface StrategySelection {
  strategy: CommunicationStrategy;
  rationale: string;
  taskCategory: ConductorTaskCategory;
}

export interface PriorScore {
  strategy: CommunicationStrategy;
  avgScore: number;
  runCount: number;
  ucb1Score?: number;
}

function computeUcb1(avgScore: number, runCount: number, totalTrials: number): number {
  const explorationBonus = UCB1_EXPLORATION_CONSTANT * Math.sqrt(Math.log(totalTrials + 1) / (runCount + 1));
  return avgScore + explorationBonus;
}

const ALL_STRATEGIES: CommunicationStrategy[] = [
  "parallel_synthesis",
  "sequential_debate",
  "hierarchical_delegation",
  "round_robin_review",
];

export async function getCategoryPriors(
  taskCategory: string,
  modelVersion?: string,
  modelTier?: string,
  until?: Date,
): Promise<PriorScore[]> {
  try {
    const filterClauses = [
      eq(conductorStrategiesTable.taskCategory, taskCategory),
      sql`${conductorStrategiesTable.qualityScore} IS NOT NULL`,
    ];
    if (modelVersion) {
      filterClauses.push(eq(conductorStrategiesTable.modelVersion, modelVersion));
    }
    if (modelTier) {
      filterClauses.push(eq(conductorStrategiesTable.modelTier, modelTier));
    }
    if (until) {
      filterClauses.push(lt(conductorStrategiesTable.createdAt, until));
    }

    const rows = await db
      .select({
        strategy: conductorStrategiesTable.strategyChosen,
        avgScore: avg(conductorStrategiesTable.qualityScore),
        runCount: sql<number>`count(*)`,
      })
      .from(conductorStrategiesTable)
      .where(and(...filterClauses))
      .groupBy(conductorStrategiesTable.strategyChosen);

    const totalTrials = rows.reduce((s, r) => s + Number(r.runCount), 0);

    const result: PriorScore[] = rows.map((r) => ({
      strategy: r.strategy as CommunicationStrategy,
      avgScore: Number(r.avgScore ?? 0),
      runCount: Number(r.runCount),
      ucb1Score: computeUcb1(Number(r.avgScore ?? 0), Number(r.runCount), totalTrials),
    }));

    // Ensure every strategy is represented, even unseen ones.
    // Unseen strategies receive an optimistic neutral prior (avgScore=0.5, runCount=0)
    // which yields a high exploration bonus via the UCB1 formula, guaranteeing they
    // are periodically selected and never permanently excluded.
    const seenStrategies = new Set(result.map((r) => r.strategy));
    for (const strategy of ALL_STRATEGIES) {
      if (!seenStrategies.has(strategy)) {
        result.push({
          strategy,
          avgScore: 0.5,
          runCount: 0,
          ucb1Score: computeUcb1(0.5, 0, totalTrials),
        });
      }
    }

    return result;
  } catch {
    // Return all strategies with optimistic priors on error.
    return ALL_STRATEGIES.map((strategy) => ({
      strategy,
      avgScore: 0.5,
      runCount: 0,
      ucb1Score: computeUcb1(0.5, 0, 1),
    }));
  }
}

/**
 * Blend recorded profitability (per fleet-size bucket) into the quality priors.
 * The UCB1 reward becomes a weighted mix of conductor quality and normalized
 * margin, so the conductor self-tunes away from configurations that are
 * unprofitable at scale while keeping quality the dominant signal. Exploration
 * bonuses are preserved by recomputing UCB1 on the blended reward.
 */
export async function blendProfitIntoPriors(
  qualityPriors: PriorScore[],
  taskCategory: string,
  fleetSize: number,
): Promise<PriorScore[]> {
  try {
    const profit = await getStrategyProfitPriors(taskCategory, fleetSize);
    if (profit.length === 0) return qualityPriors;

    const marginByStrategy = new Map(profit.map((p) => [p.strategy, p.normalizedMargin]));
    const totalTrials = qualityPriors.reduce((s, p) => s + p.runCount, 0);

    return qualityPriors.map((p) => {
      // Strategies with no recorded margin get a neutral 0.5 so they are neither
      // penalized nor rewarded on profitability — only quality drives them.
      const normalizedMargin = marginByStrategy.get(p.strategy) ?? 0.5;
      const blendedReward =
        QUALITY_REWARD_WEIGHT * p.avgScore + MARGIN_REWARD_WEIGHT * normalizedMargin;
      return {
        ...p,
        avgScore: blendedReward,
        ucb1Score: computeUcb1(blendedReward, p.runCount, totalTrials),
      };
    });
  } catch {
    return qualityPriors;
  }
}

function inferTaskCategory(taskDescription: string): ConductorTaskCategory {
  const text = taskDescription.toLowerCase();
  if (text.includes("incident") || text.includes("alert") || text.includes("threat") || text.includes("breach")) return "incident_response";
  if (text.includes("legal") || text.includes("compliance") || text.includes("contract") || text.includes("gdpr")) return "legal";
  if (text.includes("financ") || text.includes("budget") || text.includes("revenue") || text.includes("cost")) return "financial";
  if (text.includes("research") || text.includes("gather") || text.includes("collect") || text.includes("find")) return "research";
  if (text.includes("analys") || text.includes("analyz") || text.includes("evaluate") || text.includes("assess")) return "analysis";
  if (text.includes("review") || text.includes("audit") || text.includes("check") || text.includes("verify")) return "review";
  if (text.includes("creat") || text.includes("write") || text.includes("draft") || text.includes("generat")) return "creative";
  if (text.includes("code") || text.includes("debug") || text.includes("implement") || text.includes("build")) return "technical";
  return "execution";
}

export async function selectStrategy(
  taskDescription: string,
  availableAgents: Array<{ name: string }>,
  taskCategoryOverride?: string,
  priorScoresOverride?: PriorScore[],
  modelVersion?: string,
  modelTier?: string,
  controlCapturedAt?: Date,
  attribution?: { clientId?: number; botId?: number; sessionId?: number; conversationId?: number },
  fleetSize?: number,
): Promise<StrategySelection> {
  const taskCategory = (taskCategoryOverride as ConductorTaskCategory | undefined) ?? inferTaskCategory(taskDescription);
  const qualityPriors = priorScoresOverride ?? await getCategoryPriors(taskCategory, modelVersion, modelTier, controlCapturedAt);

  const agentCount = availableAgents.length;
  const effectiveFleetSize = fleetSize ?? agentCount;

  // ── Self-tuning: blend profitability into the reward ────────────────────────
  // Fold recorded per-run margin (bucketed by fleet size) into each strategy's
  // reward so selection consumes cost/quality/fleet-size outcomes together,
  // instead of a static quality-only threshold. Quality dominates; margin steers.
  const priors = await blendProfitIntoPriors(qualityPriors, taskCategory, effectiveFleetSize);

  if (priors.length > 0) {
    // True UCB1 selection: softmax-sample over UCB1 scores across ALL strategies
    // (including unseen ones with high exploration bonus). Never deterministically
    // lock-in to the top arm — this prevents strategy monopolization and ensures
    // under-sampled strategies are periodically explored.
    const temperature = 0.5;
    const scores = priors.map((p) => p.ucb1Score ?? p.avgScore);
    const maxScore = Math.max(...scores);
    const expScores = scores.map((s) => Math.exp((s - maxScore) / temperature));
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probabilities = expScores.map((e) => e / sumExp);

    let rand = Math.random();
    let selectedPrior = priors[priors.length - 1];
    for (let i = 0; i < priors.length; i++) {
      rand -= probabilities[i];
      if (rand <= 0) {
        selectedPrior = priors[i];
        break;
      }
    }

    console.log(
      `[GalaxyConductor] UCB1 softmax selection: ${selectedPrior.strategy} ` +
      `(ucb1=${selectedPrior.ucb1Score?.toFixed(3)}, avg=${(selectedPrior.avgScore * 100).toFixed(1)}%, n=${selectedPrior.runCount}) ` +
      `from ${priors.length} strategies`,
    );
    return {
      strategy: selectedPrior.strategy,
      rationale: `UCB1 exploration policy selected ${selectedPrior.strategy} for ${taskCategory} task (ucb1Score=${selectedPrior.ucb1Score?.toFixed(3)}, n=${selectedPrior.runCount} runs)`,
      taskCategory,
    };
  }

  const priorSummary =
    priors.length === 0
      ? "No prior runs for this task category — no performance history available yet."
      : priors
          .sort((a, b) => (b.ucb1Score ?? b.avgScore) - (a.ucb1Score ?? a.avgScore))
          .map(
            (p) =>
              `- ${p.strategy}: avg score ${(p.avgScore * 100).toFixed(1)}% over ${p.runCount} run(s)` +
              (p.ucb1Score !== undefined ? ` [UCB1: ${p.ucb1Score.toFixed(3)}]` : ""),
          )
          .join("\n");

  const prompt = `You are GalaxyConductor — the orchestration brain of the GalaxyBots AI platform. Your job is to select the optimal communication strategy for a multi-agent task.

## Available Communication Strategies

${Object.entries(STRATEGY_DESCRIPTIONS).map(([name, desc]) => `### ${name}\n${desc}`).join("\n\n")}

## Current Task

Description: ${taskDescription.slice(0, 600)}
Available agents: ${agentCount} agent(s) — ${availableAgents.map((a) => a.name).join(", ")}
Task category: ${taskCategory}

## Historical Performance for "${taskCategory}" Tasks (sorted by UCB1 exploration score)

${priorSummary}

## Instructions

Select the single best strategy for this task given:
1. The task's nature and complexity
2. The number of available agents (${agentCount})
3. Historical performance data (if available — bias toward UCB1-sorted strategies, which balance performance and exploration)
4. For very short tasks or single-agent situations, prefer parallel_synthesis

Return a JSON object with exactly:
{
  "strategy": "<one of: parallel_synthesis | sequential_debate | hierarchical_delegation | round_robin_review>",
  "rationale": "<one sentence explaining why this strategy suits this specific task>"
}`;

  try {
    const result = await callWithFallback({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "You are GalaxyConductor. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      maxCompletionTokens: 200,
      preferredTier: ModelTier.LOCAL,
      clientId: attribution?.clientId,
      botId: attribution?.botId,
      sessionId: attribution?.sessionId,
      conversationId: attribution?.conversationId,
    });

    let raw = result.completion.choices[0]?.message?.content ?? "{}";

    raw = raw.trim();
    if (raw.startsWith("```json")) raw = raw.slice(7);
    if (raw.startsWith("```")) raw = raw.slice(3);
    if (raw.endsWith("```")) raw = raw.slice(0, -3);
    raw = raw.trim();

    const parsed = JSON.parse(raw) as { strategy?: string; rationale?: string };

    const validStrategies: CommunicationStrategy[] = [
      "parallel_synthesis",
      "sequential_debate",
      "hierarchical_delegation",
      "round_robin_review",
    ];

    const strategy = validStrategies.includes(parsed.strategy as CommunicationStrategy)
      ? (parsed.strategy as CommunicationStrategy)
      : "parallel_synthesis";

    const rationale = parsed.rationale ?? `${strategy} selected for ${taskCategory} task`;

    return { strategy, rationale, taskCategory };
  } catch {
    return {
      strategy: "parallel_synthesis",
      rationale: `Defaulting to parallel synthesis for ${taskCategory} task`,
      taskCategory,
    };
  }
}

export async function recordStrategyRun(
  selection: StrategySelection,
  agentsUsed: string[],
  durationMs: number,
  costUsd?: number,
  sessionId?: string,
  contextType = "conversation",
  clientId?: number,
  modelVersion?: string,
  modelTier?: string,
  abVariant?: "control" | "treatment",
): Promise<number> {
  try {
    const [row] = await db
      .insert(conductorStrategiesTable)
      .values({
        taskCategory: selection.taskCategory,
        strategyChosen: selection.strategy,
        rationale: selection.rationale,
        agentsUsed,
        durationMs,
        costUsd: costUsd ?? null,
        sessionId: sessionId ?? null,
        contextType,
        ...(clientId != null ? { clientId } : {}),
        modelVersion: modelVersion ?? null,
        modelTier: modelTier ?? null,
        abVariant: abVariant ?? null,
        sampleCount: 0,
      })
      .returning({ id: conductorStrategiesTable.id });
    return row.id;
  } catch {
    return -1;
  }
}

/**
 * Persist adaptive-aggregation and semantic-cache telemetry onto a strategy run
 * row (task #216). Best-effort: a missing row id or absent telemetry columns
 * (e.g. before the migration applies) degrade silently and never break the run.
 */
export async function recordRunTelemetry(
  strategyId: number,
  telemetry?: StrategyTelemetry,
): Promise<void> {
  if (strategyId < 0 || !telemetry) return;
  try {
    await db
      .update(conductorStrategiesTable)
      .set({
        aggregationMode: telemetry.aggregationMode ?? null,
        cacheHit: telemetry.cacheHit ?? null,
        cacheHitRate: telemetry.cacheHitRate ?? null,
        cacheSimilarity: telemetry.cacheSimilarity ?? null,
        cacheSavingsUsd: telemetry.cacheSavingsUsd ?? null,
        adaptiveSavingsUsd: telemetry.adaptiveSavingsUsd ?? null,
        adaptiveSavingsMs: telemetry.adaptiveSavingsMs ?? null,
      })
      .where(eq(conductorStrategiesTable.id, strategyId));
  } catch (err) {
    console.warn("[GalaxyConductor] recordRunTelemetry failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

export async function recordStrategyOutcome(
  strategyId: number,
  qualityScore: number,
  bayesianUpdate = true,
): Promise<void> {
  if (strategyId < 0) return;
  try {
    const [existing] = await db
      .select({ sampleCount: conductorStrategiesTable.sampleCount, qualityScore: conductorStrategiesTable.qualityScore })
      .from(conductorStrategiesTable)
      .where(eq(conductorStrategiesTable.id, strategyId));

    const currentSampleCount = existing?.sampleCount ?? 0;
    const newSampleCount = currentSampleCount + 1;

    // Bayesian moving-average update: blend the running score toward the new observation.
    // Learning rate shrinks as evidence accumulates: lr = 0.1 / sqrt(n+1).
    const bayesianLR = 0.1 / Math.sqrt(newSampleCount);
    const currentScore = existing?.qualityScore != null ? Number(existing.qualityScore) : qualityScore;
    const blendedScore = bayesianUpdate
      ? Math.min(1, Math.max(0, currentScore * (1 - bayesianLR) + qualityScore * bayesianLR))
      : Math.min(1, Math.max(0, qualityScore));

    await db
      .update(conductorStrategiesTable)
      .set({
        qualityScore: blendedScore,
        sampleCount: newSampleCount,
      })
      .where(eq(conductorStrategiesTable.id, strategyId));

    if (bayesianUpdate) {
      console.log(
        `[GalaxyConductor] Strategy outcome: id=${strategyId} rawScore=${qualityScore.toFixed(3)} blendedScore=${blendedScore.toFixed(3)} n=${newSampleCount} bayesianLR=${bayesianLR.toFixed(4)}`,
      );
    }
  } catch (err) {
    console.error("[GalaxyConductor] recordStrategyOutcome failed:", err);
  }
}

export async function setStrategyConfoundScores(
  strategyId: number,
  taskDifficultyScore: number,
  promptQualityScore: number,
): Promise<void> {
  if (strategyId < 0) return;
  try {
    await db
      .update(conductorStrategiesTable)
      .set({
        taskDifficultyScore: Math.min(1, Math.max(0, taskDifficultyScore)),
        promptQualityScore: Math.min(1, Math.max(0, promptQualityScore)),
      })
      .where(eq(conductorStrategiesTable.id, strategyId));
  } catch (err) {
    console.error("[GalaxyConductor] setStrategyConfoundScores failed:", err);
  }
}

export function buildConductorMeta(
  strategyId: number,
  selection: StrategySelection,
): ConductorMeta {
  return {
    strategyId,
    strategy: selection.strategy,
    rationale: selection.rationale,
    taskCategory: selection.taskCategory,
  };
}
