import {
  db,
  modelSelectionTelemetryTable,
  modelReputationTable,
  botModelPoliciesTable,
  coordinatorClientSettingsTable,
} from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { ModelTier } from "./model-fallback";
import { estimateCost } from "../analytics/llm-usage";
import { checkCostCapAlerts } from "../analytics/cost-caps";
import { writeAuditEntry } from "../audit/audit-ledger";
import { JUDGE_MODEL } from "./reward-judge";

/**
 * Model-selection bandit (task #231).
 *
 * Reuses the exact mechanics of the GalaxyConductor's strategy bandit — UCB1
 * exploration, softmax sampling, Bayesian moving-average reward update, and an
 * optimistic prior for unseen arms — but points them at MODEL choice (GLM vs
 * GPT vs Claude per task type) instead of collaboration-strategy choice.
 *
 * HARD SAFETY BOUNDARY: this module only ever *proposes* a model. Whatever it
 * returns is fed to `callWithFallback`, which is the single safe execution path
 * (circuit breakers, fallback chains, usage logging, governance downstream). It
 * cannot bypass outbound governance, the approval queue, inbound sanitization,
 * or cost caps. With the optimizer DISABLED (the default), `selectModelForTask`
 * returns the caller's fallback model/tier unchanged, so behavior is identical
 * to pre-existing static fallback routing.
 */

// ── Bandit constants (mirrors galaxy-conductor.ts) ──────────────────────────
const UCB1_EXPLORATION_CONSTANT = 0.3;
const SOFTMAX_TEMPERATURE = 0.5;
const OPTIMISTIC_PRIOR_REWARD = 0.5;

// ── Reward-blend normalization anchors ──────────────────────────────────────
// Cost/latency are normalized against these soft ceilings before blending, so a
// run that costs ~$0.05 or takes ~30s scores near 0 on the efficiency axis.
const REWARD_COST_CEILING_USD = 0.05;
const REWARD_LATENCY_CEILING_MS = 30_000;
const DEFAULT_QUALITY_WEIGHT = 0.7;

// ── Candidate model pools per tier (all have safe fallback chains) ──────────
// These are the models the optimizer may choose among. Every one is the head of
// a FALLBACK_CHAINS entry in model-fallback.ts, so selecting it never creates a
// new/unsafe path — it just reorders which safe chain leads.
export const FRONTIER_CANDIDATE_MODELS = ["gpt-5.4", "glm-5.2-ultra", "gpt-4o", "claude-sonnet-4-6"];
export const EFFICIENT_CANDIDATE_MODELS = ["gpt-5-mini", "glm-5.2-flash"];
/** Cheapest model used as a cost-relief valve when a client nears its cap. */
export const COST_RELIEF_MODEL = "glm-5.2-flash";

// ── Judge-independence invariant (enforced at module load) ───────────────────
// The reward judge must score candidate models from the outside — if it were
// itself a candidate, it could inflate its own scores. This assertion fails
// hard at startup so any accidental addition of the judge to a candidate pool
// is caught immediately rather than silently degrading reward integrity.
const ALL_CANDIDATE_MODELS = [...FRONTIER_CANDIDATE_MODELS, ...EFFICIENT_CANDIDATE_MODELS];
if (ALL_CANDIDATE_MODELS.includes(JUDGE_MODEL)) {
  throw new Error(
    `[model-router] Integrity violation: JUDGE_MODEL "${JUDGE_MODEL}" is in the ` +
    `candidate model pool. The judge must be independent of all candidates. ` +
    `Remove "${JUDGE_MODEL}" from FRONTIER_CANDIDATE_MODELS or ` +
    `EFFICIENT_CANDIDATE_MODELS, or update JUDGE_MODEL in reward-judge.ts.`,
  );
}

// ── Owner-control setting keys (stored in coordinator_client_settings) ──────
export const MODEL_OPTIMIZER_SETTING_KEYS = {
  enabled: "model_optimizer_enabled",
  qualityWeight: "model_optimizer_quality_weight",
  requireApproval: "model_optimizer_require_approval",
  shadowEnabled: "model_optimizer_shadow_enabled",
  shadowSampleRate: "model_optimizer_shadow_sample_rate",
  shadowThreshold: "model_optimizer_shadow_threshold",
} as const;

export interface ModelOptimizerSettings {
  enabled: boolean;
  qualityWeight: number;
  requireApproval: boolean;
  shadowEnabled: boolean;
  shadowSampleRate: number;
  shadowThreshold: number;
}

const DEFAULT_SETTINGS: ModelOptimizerSettings = {
  enabled: false,
  qualityWeight: DEFAULT_QUALITY_WEIGHT,
  requireApproval: false,
  shadowEnabled: false,
  shadowSampleRate: 0.1,
  shadowThreshold: 0.05,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Read all optimizer settings for a client. When clientId is missing or no rows
 * exist, returns DEFAULT_SETTINGS (optimizer OFF) so behavior matches the
 * pre-existing static fallback routing exactly.
 */
export async function getModelOptimizerSettings(clientId?: number | null): Promise<ModelOptimizerSettings> {
  if (clientId == null) return { ...DEFAULT_SETTINGS };
  try {
    const rows = await db
      .select({ key: coordinatorClientSettingsTable.settingKey, value: coordinatorClientSettingsTable.settingValue })
      .from(coordinatorClientSettingsTable)
      .where(eq(coordinatorClientSettingsTable.clientId, clientId));
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const num = (key: string, fallback: number) => {
      const v = map.get(key);
      const n = v != null ? Number(v) : NaN;
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      enabled: map.get(MODEL_OPTIMIZER_SETTING_KEYS.enabled) === "true",
      qualityWeight: clamp01(num(MODEL_OPTIMIZER_SETTING_KEYS.qualityWeight, DEFAULT_QUALITY_WEIGHT)),
      requireApproval: map.get(MODEL_OPTIMIZER_SETTING_KEYS.requireApproval) === "true",
      shadowEnabled: map.get(MODEL_OPTIMIZER_SETTING_KEYS.shadowEnabled) === "true",
      shadowSampleRate: clamp01(num(MODEL_OPTIMIZER_SETTING_KEYS.shadowSampleRate, DEFAULT_SETTINGS.shadowSampleRate)),
      shadowThreshold: clamp01(num(MODEL_OPTIMIZER_SETTING_KEYS.shadowThreshold, DEFAULT_SETTINGS.shadowThreshold)),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persist a single optimizer setting (owner control writes). */
export async function setModelOptimizerSetting(clientId: number, key: string, value: string): Promise<void> {
  await db
    .insert(coordinatorClientSettingsTable)
    .values({ clientId, settingKey: key, settingValue: value })
    .onConflictDoUpdate({
      target: [coordinatorClientSettingsTable.clientId, coordinatorClientSettingsTable.settingKey],
      set: { settingValue: value, updatedAt: new Date() },
    });
}

// ── Difficulty bucketing ────────────────────────────────────────────────────
export type DifficultyBucket = "easy" | "medium" | "hard";

export function bucketDifficulty(score: number | null | undefined): DifficultyBucket {
  const s = score ?? 0.5;
  if (s < 0.34) return "easy";
  if (s > 0.66) return "hard";
  return "medium";
}

/**
 * Cheap a-priori difficulty estimate from input size. The authoritative
 * difficulty score is computed post-run in outcome-capture; at selection time we
 * only have the prompt, so we proxy difficulty from token volume. Bounded 0..1.
 */
export function estimateDifficultyFromInput(inputTokens: number): number {
  // ~0 at 0 tokens, ~0.5 at 1.5k tokens, saturating toward 1 past ~6k tokens.
  return clamp01(inputTokens / 6000);
}

// ── Reward blend ────────────────────────────────────────────────────────────
/**
 * Blend a single reward in [0,1] from quality + cost + latency. Cost and
 * latency form an "efficiency" axis (cheaper + faster = higher). The owner's
 * quality-vs-cost weight trades the two axes off. Anti-gaming: a failed run
 * passes quality≈0, so the bandit can never drift toward "cheap but broken".
 */
export function computeReward(params: {
  quality: number;
  costUsd: number;
  latencyMs: number;
  qualityWeight?: number;
}): number {
  const qw = clamp01(params.qualityWeight ?? DEFAULT_QUALITY_WEIGHT);
  const quality = clamp01(params.quality);
  const costScore = 1 - clamp01(params.costUsd / REWARD_COST_CEILING_USD);
  const latencyScore = 1 - clamp01(params.latencyMs / REWARD_LATENCY_CEILING_MS);
  const efficiency = 0.7 * costScore + 0.3 * latencyScore;
  return clamp01(qw * quality + (1 - qw) * efficiency);
}

// ── UCB1 (mirrors galaxy-conductor.ts computeUcb1) ──────────────────────────
function computeUcb1(avgReward: number, runCount: number, totalTrials: number): number {
  if (runCount === 0) return Number.POSITIVE_INFINITY;
  const exploitation = avgReward;
  const exploration = UCB1_EXPLORATION_CONSTANT * Math.sqrt(Math.log(Math.max(totalTrials, 1)) / runCount);
  return exploitation + exploration;
}

interface ModelPrior {
  model: string;
  avgReward: number;
  avgQuality: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  runCount: number;
  ucb1: number;
}

/**
 * Return Winsorized per-(category, model, difficulty) priors for live selection.
 *
 * Source of truth is the `model_reputation` table, which is recomputed
 * periodically by `recomputeModelReputations()` using the iterative
 * simplex-projection tenant-weighting algorithm. This guarantees that no
 * single tenant's heavy usage can dominate the shared routing prior — the
 * skew protection actually applies to the values the bandit uses, not just
 * to an observability report.
 *
 * Fall-through: if model_reputation has no row for a (category, model, bucket)
 * tuple (e.g. a brand-new model or a fresh deployment), the function falls back
 * to a raw-telemetry aggregate for that model only, so exploration still works
 * for unseen combinations without losing skew protection on seen ones.
 */
export async function getModelReputationPriors(
  taskCategory: string,
  candidateModels: string[],
  difficultyBucket?: DifficultyBucket,
): Promise<ModelPrior[]> {
  // ── 1. Primary path: Winsorized priors from model_reputation ────────────
  let reputationRows: Array<{
    model: string;
    avgReward: number | null;
    avgQuality: number | null;
    avgCostUsd: number | null;
    avgLatencyMs: number | null;
    sampleCount: number;
  }> = [];
  try {
    const repConditions = [
      eq(modelReputationTable.taskCategory, taskCategory),
    ];
    // Use the exact bucket when provided; otherwise accept the "all" rollup row.
    repConditions.push(
      difficultyBucket
        ? eq(modelReputationTable.difficultyBucket, difficultyBucket)
        : eq(modelReputationTable.difficultyBucket, "all"),
    );
    reputationRows = await db
      .select({
        model: modelReputationTable.model,
        avgReward: modelReputationTable.avgReward,
        avgQuality: modelReputationTable.avgQuality,
        avgCostUsd: modelReputationTable.avgCostUsd,
        avgLatencyMs: modelReputationTable.avgLatencyMs,
        sampleCount: modelReputationTable.sampleCount,
      })
      .from(modelReputationTable)
      .where(and(...repConditions));
  } catch (err) {
    console.warn("[ModelRouter] model_reputation query failed:", err instanceof Error ? err.message : err);
  }

  const byModelRep = new Map(reputationRows.map((r) => [r.model, r]));

  // ── 2. Fall-through: raw-telemetry average for models missing from reputation ──
  // Only query telemetry for models that have NO reputation row yet.
  const missingModels = candidateModels.filter((m) => !byModelRep.has(m));
  const rawByModel = new Map<string, { avgReward: number | null; avgQuality: number | null; avgCost: number | null; avgLatency: number | null; runCount: number }>();
  if (missingModels.length > 0) {
    try {
      // Drizzle's inArray works cleanly for this case.
      // We query telemetry for the specific task+bucket only, then filter by
      // missing model names in JS. Note: this raw path is ONLY used for models
      // that have no reputation row yet — existing models always use the
      // Winsorized reputation path above.
      const rawRows = await db
        .select({
          model: modelSelectionTelemetryTable.model,
          avgReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
          avgQuality: sql<number>`avg(${modelSelectionTelemetryTable.qualityScore})`,
          avgCost: sql<number>`avg(${modelSelectionTelemetryTable.costUsd})`,
          avgLatency: sql<number>`avg(${modelSelectionTelemetryTable.latencyMs})`,
          runCount: sql<number>`count(*)`,
        })
        .from(modelSelectionTelemetryTable)
        .where(and(
          eq(modelSelectionTelemetryTable.taskCategory, taskCategory),
          eq(modelSelectionTelemetryTable.shadow, false),
          isNotNull(modelSelectionTelemetryTable.rewardScore),
          ...(difficultyBucket ? [eq(modelSelectionTelemetryTable.difficultyBucket, difficultyBucket)] : []),
        ))
        .groupBy(modelSelectionTelemetryTable.model);

      for (const r of rawRows) {
        if (missingModels.includes(r.model)) {
          rawByModel.set(r.model, r);
        }
      }
    } catch (err) {
      console.warn("[ModelRouter] raw-telemetry fallback query failed:", err instanceof Error ? err.message : err);
    }
  }

  // ── 3. Assemble ModelPrior[] for the bandit ──────────────────────────────
  const totalTrials = reputationRows.reduce((s, r) => s + Number(r.sampleCount), 0)
    + [...rawByModel.values()].reduce((s, r) => s + Number(r.runCount), 0);

  return candidateModels.map((model) => {
    const rep = byModelRep.get(model);
    if (rep) {
      // Use the Winsorized, skew-protected reputation row.
      const runCount = Number(rep.sampleCount);
      const avgReward = rep.avgReward != null ? Number(rep.avgReward) : OPTIMISTIC_PRIOR_REWARD;
      return {
        model,
        avgReward,
        avgQuality: rep.avgQuality != null ? Number(rep.avgQuality) : OPTIMISTIC_PRIOR_REWARD,
        avgCostUsd: rep.avgCostUsd != null ? Number(rep.avgCostUsd) : 0,
        avgLatencyMs: rep.avgLatencyMs != null ? Number(rep.avgLatencyMs) : 0,
        runCount,
        ucb1: computeUcb1(avgReward, runCount, totalTrials),
      };
    }
    // Fall-through: new model not yet in reputation table.
    const raw = rawByModel.get(model);
    const runCount = raw ? Number(raw.runCount) : 0;
    const avgReward = raw && raw.avgReward != null ? Number(raw.avgReward) : OPTIMISTIC_PRIOR_REWARD;
    return {
      model,
      avgReward,
      avgQuality: raw && raw.avgQuality != null ? Number(raw.avgQuality) : OPTIMISTIC_PRIOR_REWARD,
      avgCostUsd: raw && raw.avgCost != null ? Number(raw.avgCost) : 0,
      avgLatencyMs: raw && raw.avgLatency != null ? Number(raw.avgLatency) : 0,
      runCount,
      ucb1: computeUcb1(avgReward, runCount, totalTrials),
    };
  });
}

// ── Softmax sampling (mirrors galaxy-conductor.ts) ──────────────────────────
function softmaxSample(priors: ModelPrior[], scoreOf: (p: ModelPrior) => number): ModelPrior {
  if (priors.length === 1) return priors[0];
  // Unseen arms (UCB1=∞) are explored first, deterministically.
  const unseen = priors.filter((p) => p.runCount === 0);
  if (unseen.length > 0) {
    return unseen[Math.floor(Math.random() * unseen.length)];
  }
  const scores = priors.map(scoreOf);
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / SOFTMAX_TEMPERATURE));
  const sum = exps.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < priors.length; i++) {
    r -= exps[i];
    if (r <= 0) return priors[i];
  }
  return priors[priors.length - 1];
}

// ── Per-bot allow/deny ──────────────────────────────────────────────────────
async function applyBotPolicy(botId: number | undefined, candidates: string[]): Promise<string[]> {
  if (botId == null) return candidates;
  try {
    const rows = await db
      .select({ model: botModelPoliciesTable.model, allowed: botModelPoliciesTable.allowed })
      .from(botModelPoliciesTable)
      .where(eq(botModelPoliciesTable.botId, botId));
    if (rows.length === 0) return candidates;
    const denied = new Set(rows.filter((r) => !r.allowed).map((r) => r.model));
    const allowList = rows.filter((r) => r.allowed).map((r) => r.model);
    let filtered = candidates.filter((m) => !denied.has(m));
    // If an explicit allow-list exists, restrict to it (intersection).
    if (allowList.length > 0) {
      const allowSet = new Set(allowList);
      filtered = filtered.filter((m) => allowSet.has(m));
    }
    return filtered;
  } catch {
    return candidates;
  }
}

// ── Tier-aware candidate resolution with difficulty routing ─────────────────
function candidatesForTier(tier: ModelTier): string[] {
  return tier === ModelTier.FRONTIER ? FRONTIER_CANDIDATE_MODELS : EFFICIENT_CANDIDATE_MODELS;
}

export interface ModelSelectionDecision {
  model: string;
  tier: ModelTier;
  mode: "fallback" | "optimizer" | "cost_relief" | "pending_approval";
  optimizerEnabled: boolean;
  difficultyBucket: DifficultyBucket;
  /** The static fallback model that would have served absent the optimizer. */
  fallbackModel: string;
  /** Recommended-but-withheld model when approval is required. */
  pendingModel?: string;
}

export interface SelectModelParams {
  taskCategory: string;
  clientId?: number;
  botId?: number;
  /** A-priori difficulty in [0,1] (from estimateDifficultyFromInput). */
  difficultyScore?: number;
  /** Static fallback model/tier that resolveAgentModel would return. */
  fallbackModel: string;
  fallbackTier: ModelTier;
  settings?: ModelOptimizerSettings;
}

/**
 * Choose the model for a task. When the optimizer is disabled (default) this
 * returns the caller's fallback model/tier verbatim — identical to pre-existing
 * static routing. When enabled it routes by difficulty, honors per-bot
 * allow/deny, applies a cost-relief valve near the budget cap, and (if approval
 * is required) withholds any deviation from the fallback.
 */
export async function selectModelForTask(params: SelectModelParams): Promise<ModelSelectionDecision> {
  const settings = params.settings ?? (await getModelOptimizerSettings(params.clientId));
  const difficultyBucket = bucketDifficulty(params.difficultyScore);

  const base: ModelSelectionDecision = {
    model: params.fallbackModel,
    tier: params.fallbackTier,
    mode: "fallback",
    optimizerEnabled: settings.enabled,
    difficultyBucket,
    fallbackModel: params.fallbackModel,
  };

  // Disabled or no client context → exact fallback parity.
  if (!settings.enabled || params.clientId == null) {
    return base;
  }

  try {
    // ── Difficulty-aware tier selection ──────────────────────────────────
    // Hard tasks escalate to FRONTIER; easy tasks de-escalate to EFFICIENT only
    // if the efficient tier has historically cleared the category quality bar.
    let tier = params.fallbackTier;
    if (difficultyBucket === "hard") {
      tier = ModelTier.FRONTIER;
    } else if (difficultyBucket === "easy" && params.fallbackTier === ModelTier.FRONTIER) {
      const efficientPriors = await getModelReputationPriors(params.taskCategory, candidatesForTier(ModelTier.EFFICIENT));
      const proven = efficientPriors.find((p) => p.runCount >= 3 && p.avgQuality >= 0.6);
      if (proven) tier = ModelTier.EFFICIENT;
    }

    // ── Cost-relief valve ────────────────────────────────────────────────
    // As the client nears/exceeds its budget cap, route to the cheapest model
    // (instead of pausing autonomy outright) — provided per-bot policy allows it.
    let alerts: { withinBudget: boolean; pctUsed: number } | null = null;
    try {
      const r = await checkCostCapAlerts(params.clientId);
      alerts = { withinBudget: r.withinBudget, pctUsed: r.pctUsed };
    } catch {
      alerts = null;
    }
    if (alerts && (!alerts.withinBudget || alerts.pctUsed >= 90)) {
      const reliefAllowed = await applyBotPolicy(params.botId, [COST_RELIEF_MODEL]);
      if (reliefAllowed.includes(COST_RELIEF_MODEL)) {
        const decision: ModelSelectionDecision = {
          ...base,
          model: COST_RELIEF_MODEL,
          tier: ModelTier.EFFICIENT,
          mode: "cost_relief",
        };
        return finalizeApproval(decision, settings);
      }
    }

    // ── Bandit selection among tier candidates ───────────────────────────
    const candidates = await applyBotPolicy(params.botId, candidatesForTier(tier));
    if (candidates.length === 0) {
      // Policy denied every candidate — fall back to the static model.
      return base;
    }
    const priors = await getModelReputationPriors(params.taskCategory, candidates, difficultyBucket);
    // Selection score blends quality and efficiency by the owner's weight, with
    // the UCB1 exploration bonus layered on (mirrors the conductor's pattern).
    const chosen = softmaxSample(priors, (p) => {
      const costScore = 1 - clamp01(p.avgCostUsd / REWARD_COST_CEILING_USD);
      const latencyScore = 1 - clamp01(p.avgLatencyMs / REWARD_LATENCY_CEILING_MS);
      const efficiency = 0.7 * costScore + 0.3 * latencyScore;
      const blended = settings.qualityWeight * p.avgQuality + (1 - settings.qualityWeight) * efficiency;
      const explorationBonus = p.ucb1 === Number.POSITIVE_INFINITY ? 0 : p.ucb1 - p.avgReward;
      return blended + explorationBonus;
    });

    const decision: ModelSelectionDecision = {
      ...base,
      model: chosen.model,
      tier,
      mode: "optimizer",
    };
    return finalizeApproval(decision, settings);
  } catch (err) {
    console.warn("[ModelRouter] selectModelForTask failed, using fallback:", err instanceof Error ? err.message : err);
    return base;
  }
}

/**
 * Approval gate: when the owner requires approval, any optimizer deviation from
 * the static fallback is WITHHELD from live serving (fallback serves) and the
 * recommendation is surfaced as pending. The owner stays sovereign.
 */
function finalizeApproval(decision: ModelSelectionDecision, settings: ModelOptimizerSettings): ModelSelectionDecision {
  if (!settings.requireApproval) return decision;
  if (decision.model === decision.fallbackModel) return decision;
  return {
    ...decision,
    model: decision.fallbackModel,
    mode: "pending_approval",
    pendingModel: decision.model,
  };
}

// ── Telemetry recording ─────────────────────────────────────────────────────
export interface RecordSelectionParams {
  clientId?: number;
  botId?: number;
  sessionId?: number;
  conductorStrategyId?: number;
  taskCategory: string;
  model: string;
  modelTier: ModelTier;
  difficultyBucket: DifficultyBucket;
  selectionMode: string;
  shadow?: boolean;
  chosenModel?: string;
}

/** Insert a telemetry row at selection time (reward filled later). Returns id. */
export async function recordModelSelection(params: RecordSelectionParams): Promise<number> {
  try {
    const [row] = await db
      .insert(modelSelectionTelemetryTable)
      .values({
        clientId: params.clientId ?? null,
        botId: params.botId ?? null,
        sessionId: params.sessionId != null ? String(params.sessionId) : null,
        conductorStrategyId: params.conductorStrategyId ?? null,
        taskCategory: params.taskCategory,
        model: params.model,
        modelTier: params.modelTier,
        difficultyBucket: params.difficultyBucket,
        selectionMode: params.selectionMode,
        shadow: params.shadow ?? false,
        chosenModel: params.chosenModel ?? null,
        sampleCount: 0,
      })
      .returning({ id: modelSelectionTelemetryTable.id });
    return row?.id ?? -1;
  } catch (err) {
    console.warn("[ModelRouter] recordModelSelection failed (non-fatal):", err instanceof Error ? err.message : err);
    return -1;
  }
}

/**
 * Resolve a telemetry row's reward once the session outcome is known. Blends
 * quality+cost+latency into the reward via the same formula as the bandit, and
 * applies the Bayesian moving-average update (lr = 0.1/sqrt(n+1)) exactly like
 * the conductor's recordStrategyOutcome.
 *
 * When `judgeQualityScore` is provided (from the independent judge), it is
 * blended with the self-reported quality score (60% judge / 40% self-report)
 * before computing the reward, making the signal manipulation-resistant.
 */
export async function recordModelOutcome(
  telemetryId: number,
  params: {
    quality: number;
    costUsd: number;
    latencyMs: number;
    taskDifficulty?: number;
    promptQuality?: number;
    qualityWeight?: number;
    judgeQualityScore?: number | null;
    judgeModel?: string | null;
  },
): Promise<void> {
  if (telemetryId < 0) return;
  try {
    const [existing] = await db
      .select({ sampleCount: modelSelectionTelemetryTable.sampleCount, rewardScore: modelSelectionTelemetryTable.rewardScore })
      .from(modelSelectionTelemetryTable)
      .where(eq(modelSelectionTelemetryTable.id, telemetryId));

    // Blend judge quality (independent) with self-reported quality.
    const effectiveQuality = params.judgeQualityScore != null
      ? clamp01(0.6 * params.judgeQualityScore + 0.4 * params.quality)
      : clamp01(params.quality);

    const reward = computeReward({
      quality: effectiveQuality,
      costUsd: params.costUsd,
      latencyMs: params.latencyMs,
      qualityWeight: params.qualityWeight,
    });

    const newSampleCount = (existing?.sampleCount ?? 0) + 1;
    const bayesianLR = 0.1 / Math.sqrt(newSampleCount);
    const current = existing?.rewardScore != null ? Number(existing.rewardScore) : reward;
    const blended = clamp01(current * (1 - bayesianLR) + reward * bayesianLR);

    await db
      .update(modelSelectionTelemetryTable)
      .set({
        qualityScore: clamp01(params.quality),
        judgeQualityScore: params.judgeQualityScore != null ? clamp01(params.judgeQualityScore) : undefined,
        judgeModel: params.judgeModel ?? undefined,
        costUsd: params.costUsd,
        latencyMs: Math.round(params.latencyMs),
        taskDifficultyScore: params.taskDifficulty != null ? clamp01(params.taskDifficulty) : undefined,
        promptQualityScore: params.promptQuality != null ? clamp01(params.promptQuality) : undefined,
        rewardScore: blended,
        sampleCount: newSampleCount,
      })
      .where(eq(modelSelectionTelemetryTable.id, telemetryId));
  } catch (err) {
    console.warn("[ModelRouter] recordModelOutcome failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/**
 * Resolve rewards for all telemetry rows attached to a session once its outcome
 * is captured. Distributes the session's actual LLM cost across the rows. This
 * is the per-session reward hook called from outcome-capture.
 *
 * The `judgeQualityScore` and `judgeModel` from the independent judge are
 * threaded through to each telemetry row so the reward is based on the blended
 * (manipulation-resistant) quality signal.
 */
export async function recordSessionModelOutcomes(params: {
  sessionId: number;
  quality: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  taskDifficulty?: number;
  promptQuality?: number;
  qualityWeight?: number;
  judgeQualityScore?: number | null;
  judgeModel?: string | null;
}): Promise<void> {
  try {
    const rows = await db
      .select({ id: modelSelectionTelemetryTable.id, rewardScore: modelSelectionTelemetryTable.rewardScore })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.sessionId, String(params.sessionId)),
          eq(modelSelectionTelemetryTable.shadow, false),
        ),
      );
    const unresolved = rows.filter((r) => r.rewardScore == null);
    if (unresolved.length === 0) return;
    const perRowCost = params.totalCostUsd / unresolved.length;
    for (const row of unresolved) {
      await recordModelOutcome(row.id, {
        quality: params.quality,
        costUsd: perRowCost,
        latencyMs: params.totalLatencyMs,
        taskDifficulty: params.taskDifficulty,
        promptQuality: params.promptQuality,
        qualityWeight: params.qualityWeight,
        judgeQualityScore: params.judgeQualityScore,
        judgeModel: params.judgeModel,
      });
    }
  } catch (err) {
    console.warn("[ModelRouter] recordSessionModelOutcomes failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/** Best-effort audit-ledger write for a model decision (observability). */
export async function auditModelDecision(decision: ModelSelectionDecision, ctx: { clientId?: number; sessionId?: number; botId?: number }): Promise<void> {
  // Only audit actual optimizer activity, not pure fallback no-ops.
  if (decision.mode === "fallback") return;
  await writeAuditEntry({
    clientId: ctx.clientId ?? null,
    sessionId: ctx.sessionId != null ? String(ctx.sessionId) : null,
    engine: "model_router",
    decisionType: "model_selection",
    payload: {
      botId: ctx.botId ?? null,
      mode: decision.mode,
      model: decision.model,
      tier: decision.tier,
      fallbackModel: decision.fallbackModel,
      pendingModel: decision.pendingModel ?? null,
      difficultyBucket: decision.difficultyBucket,
    },
  }).catch(() => {});
}

export { estimateCost };
