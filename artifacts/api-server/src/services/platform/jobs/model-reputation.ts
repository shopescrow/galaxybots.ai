import {
  db,
  modelSelectionTelemetryTable,
  modelReputationTable,
} from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { writeAuditEntry } from "../../audit/audit-ledger";
import { getModelOptimizerSettings } from "../../ai-safety/model-router";
import { runGoldenEval, seedGoldenPromptsIfEmpty } from "../../ai-safety/golden-eval";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

let lastReputationRun = 0;
let lastGoldenEvalRun = 0;

/**
 * Tenant-contribution weight cap.
 *
 * After computing per-tenant weights, no single tenant's NORMALIZED weight may
 * exceed this fraction. We use an iterative clipping projection: excess weight
 * is clipped from over-cap tenants and redistributed proportionally to
 * under-cap tenants until convergence (at most n iterations). This guarantees
 * the post-normalization constraint is actually enforced.
 *
 * Example: counts [90, 5, 5] → raw weights [0.9, 0.05, 0.05].
 *   Iter 1: clip 0.9 → 0.5; excess = 0.4; 2 under-cap each get +0.2.
 *   Result: [0.5, 0.25, 0.25] — heavy tenant is bounded at exactly 50%.
 */
const MAX_TENANT_FRACTION = 0.5;

/**
 * Project weights onto the simplex with a per-element max constraint.
 * Returns weights summing to 1 where no element exceeds maxFraction.
 *
 * For n tenants, the effective cap is max(maxFraction, 1/n) to ensure
 * the constraint is satisfiable (sum must equal 1).
 */
function winsorizedWeights(sampleCounts: number[], maxFraction: number): number[] {
  const n = sampleCounts.length;
  if (n === 0) return [];
  if (n === 1) return [1.0];

  // Ensure constraint is satisfiable: cap >= 1/n
  const effectiveCap = Math.max(maxFraction, 1 / n);

  const total = sampleCounts.reduce((s, c) => s + c, 0);
  if (total === 0) return sampleCounts.map(() => 1 / n);

  let weights = sampleCounts.map((c) => c / total);

  // Iterative clipping: at most n+1 iterations (guaranteed termination because
  // each iteration moves at least one weight to its cap and keeps it there).
  for (let iter = 0; iter <= n; iter++) {
    let excess = 0;
    let underCapCount = 0;
    const clipped = weights.map((w) => {
      if (w > effectiveCap) {
        excess += w - effectiveCap;
        return effectiveCap;
      }
      return w;
    });

    if (excess < 1e-12) {
      weights = clipped;
      break;
    }

    // Count tenants below cap that can absorb the redistributed excess.
    for (const w of clipped) {
      if (w < effectiveCap) underCapCount++;
    }

    if (underCapCount === 0) {
      // All at cap — distribute equally (should not happen when effectiveCap >= 1/n).
      weights = clipped;
      break;
    }

    weights = clipped.map((w) => (w < effectiveCap ? w + excess / underCapCount : w));
  }

  // Final re-normalize to absorb floating-point drift.
  const sum = weights.reduce((s, w) => s + w, 0);
  return sum > 0 ? weights.map((w) => w / sum) : weights.map(() => 1 / n);
}

/**
 * Periodic model-reputation re-evaluation (task #231 step 6, task #259).
 *
 * Recomputes the per-(category, model, difficulty) reputation summary from
 * live, reward-resolved telemetry with two new properties vs the original:
 *
 * 1. **Per-tenant skew protection** — each tenant's contribution to the global
 *    aggregate is capped at MAX_TENANT_FRACTION (50%) of total samples in each
 *    segment. Heavy tenants can't dominate global priors; the skewFlag is
 *    raised on rows where the cap was applied.
 *
 * 2. **Judge-quality tracking** — the independent judge quality score
 *    (judgeQualityScore) is averaged separately from the self-reported quality
 *    and stored in avgJudgeQuality so owners can distinguish the two.
 *
 * Shadow promotion behavior is unchanged from the original implementation.
 */
export async function recomputeModelReputations(): Promise<void> {
  // ── 1. Per-tenant aggregation for skew-aware weighting ────────────────────
  // We aggregate by (taskCategory, model, difficultyBucket, clientId) first,
  // then re-blend tenant averages with outlier clamping, rather than using a
  // single global AVG (which is dominated by tenants with high call volume).
  const perTenantRows = await db
    .select({
      taskCategory: modelSelectionTelemetryTable.taskCategory,
      model: modelSelectionTelemetryTable.model,
      difficultyBucket: modelSelectionTelemetryTable.difficultyBucket,
      clientId: modelSelectionTelemetryTable.clientId,
      avgReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
      avgQuality: sql<number>`avg(${modelSelectionTelemetryTable.qualityScore})`,
      avgJudgeQuality: sql<number>`avg(${modelSelectionTelemetryTable.judgeQualityScore})`,
      avgCost: sql<number>`avg(${modelSelectionTelemetryTable.costUsd})`,
      avgLatency: sql<number>`avg(${modelSelectionTelemetryTable.latencyMs})`,
      sampleCount: sql<number>`count(*)`,
    })
    .from(modelSelectionTelemetryTable)
    .where(
      and(
        eq(modelSelectionTelemetryTable.shadow, false),
        isNotNull(modelSelectionTelemetryTable.rewardScore),
      ),
    )
    .groupBy(
      modelSelectionTelemetryTable.taskCategory,
      modelSelectionTelemetryTable.model,
      modelSelectionTelemetryTable.difficultyBucket,
      modelSelectionTelemetryTable.clientId,
    );

  // Group per-tenant rows by (category, model, difficulty) segment key.
  type SegmentKey = string;
  type TenantEntry = {
    clientId: number | null;
    avgReward: number;
    avgQuality: number;
    avgJudgeQuality: number | null;
    avgCost: number;
    avgLatency: number;
    sampleCount: number;
  };
  const segments = new Map<SegmentKey, {
    taskCategory: string;
    model: string;
    difficultyBucket: string;
    tenants: TenantEntry[];
  }>();

  for (const r of perTenantRows) {
    const key: SegmentKey = `${r.taskCategory}||${r.model}||${r.difficultyBucket ?? "all"}`;
    if (!segments.has(key)) {
      segments.set(key, {
        taskCategory: r.taskCategory,
        model: r.model,
        difficultyBucket: r.difficultyBucket ?? "all",
        tenants: [],
      });
    }
    segments.get(key)!.tenants.push({
      clientId: r.clientId,
      avgReward: r.avgReward != null ? Number(r.avgReward) : 0,
      avgQuality: r.avgQuality != null ? Number(r.avgQuality) : 0,
      avgJudgeQuality: r.avgJudgeQuality != null ? Number(r.avgJudgeQuality) : null,
      avgCost: r.avgCost != null ? Number(r.avgCost) : 0,
      avgLatency: r.avgLatency != null ? Number(r.avgLatency) : 0,
      sampleCount: Number(r.sampleCount),
    });
  }

  // ── 2. Winsorized blend across tenants ────────────────────────────────────
  for (const [, seg] of segments) {
    const totalSamples = seg.tenants.reduce((s, t) => s + t.sampleCount, 0);
    if (totalSamples === 0) continue;

    // Compute the raw (pre-capping) max tenant fraction for the skewFlag.
    const maxTenantSamples = Math.max(...seg.tenants.map((t) => t.sampleCount));
    const maxTenantFraction = maxTenantSamples / totalSamples;
    const skewFlag = maxTenantFraction > MAX_TENANT_FRACTION;

    // Compute post-normalization weights with the iterative clipping algorithm.
    // This guarantees no tenant's effective weight exceeds MAX_TENANT_FRACTION
    // after normalization — unlike naive count-capping which doesn't enforce
    // the post-normalization bound.
    const sampleCounts = seg.tenants.map((t) => t.sampleCount);
    const weights = winsorizedWeights(sampleCounts, MAX_TENANT_FRACTION);

    let weightedReward = 0;
    let weightedQuality = 0;
    let weightedCost = 0;
    let weightedLatency = 0;
    let judgeQualitySum = 0;
    let judgeQualityWeight = 0;

    for (let i = 0; i < seg.tenants.length; i++) {
      const t = seg.tenants[i];
      const w = weights[i];
      weightedReward += w * t.avgReward;
      weightedQuality += w * t.avgQuality;
      weightedCost += w * t.avgCost;
      weightedLatency += w * t.avgLatency;
      if (t.avgJudgeQuality != null) {
        judgeQualitySum += w * t.avgJudgeQuality;
        judgeQualityWeight += w;
      }
    }

    const avgJudgeQuality = judgeQualityWeight > 0 ? judgeQualitySum / judgeQualityWeight : null;
    const tenantCount = seg.tenants.length;

    await db
      .insert(modelReputationTable)
      .values({
        taskCategory: seg.taskCategory,
        model: seg.model,
        difficultyBucket: seg.difficultyBucket,
        avgReward: weightedReward,
        avgQuality: weightedQuality,
        avgJudgeQuality,
        avgCostUsd: weightedCost,
        avgLatencyMs: weightedLatency,
        sampleCount: totalSamples,
        tenantCount,
        maxTenantFraction,
        skewFlag,
      })
      .onConflictDoUpdate({
        target: [
          modelReputationTable.taskCategory,
          modelReputationTable.model,
          modelReputationTable.difficultyBucket,
        ],
        set: {
          avgReward: weightedReward,
          avgQuality: weightedQuality,
          avgJudgeQuality,
          avgCostUsd: weightedCost,
          avgLatencyMs: weightedLatency,
          sampleCount: totalSamples,
          tenantCount,
          maxTenantFraction,
          skewFlag,
          updatedAt: new Date(),
        },
      });

    if (skewFlag) {
      console.warn(
        `[ModelReputation] skew flag: ${seg.model}/${seg.taskCategory}/${seg.difficultyBucket} — ` +
        `max tenant fraction ${(maxTenantFraction * 100).toFixed(1)}% of ${totalSamples} samples`,
      );
    }
  }

  // ── 3. Evaluate shadow candidates for promotion, per client ───────────────
  const shadowRows = await db
    .select({
      clientId: modelSelectionTelemetryTable.clientId,
      taskCategory: modelSelectionTelemetryTable.taskCategory,
      candidateModel: modelSelectionTelemetryTable.model,
      servedModel: modelSelectionTelemetryTable.chosenModel,
      avgCandidateReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
      samples: sql<number>`count(*)`,
    })
    .from(modelSelectionTelemetryTable)
    .where(
      and(
        eq(modelSelectionTelemetryTable.shadow, true),
        isNotNull(modelSelectionTelemetryTable.rewardScore),
      ),
    )
    .groupBy(
      modelSelectionTelemetryTable.clientId,
      modelSelectionTelemetryTable.taskCategory,
      modelSelectionTelemetryTable.model,
      modelSelectionTelemetryTable.chosenModel,
    );

  const MIN_SHADOW_SAMPLES = 5;
  const settingsCache = new Map<number, Awaited<ReturnType<typeof getModelOptimizerSettings>>>();

  for (const s of shadowRows) {
    if (s.clientId == null) continue;
    if (Number(s.samples) < MIN_SHADOW_SAMPLES) continue;
    if (!s.servedModel || s.servedModel === s.candidateModel) continue;

    let settings = settingsCache.get(s.clientId);
    if (!settings) {
      settings = await getModelOptimizerSettings(s.clientId);
      settingsCache.set(s.clientId, settings);
    }
    if (!settings.enabled) continue;

    const [served] = await db
      .select({
        avgReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
        samples: sql<number>`count(*)`,
      })
      .from(modelSelectionTelemetryTable)
      .where(
        and(
          eq(modelSelectionTelemetryTable.clientId, s.clientId),
          eq(modelSelectionTelemetryTable.taskCategory, s.taskCategory),
          eq(modelSelectionTelemetryTable.model, s.servedModel),
          eq(modelSelectionTelemetryTable.shadow, false),
          isNotNull(modelSelectionTelemetryTable.rewardScore),
        ),
      );

    const candidateReward = s.avgCandidateReward != null ? Number(s.avgCandidateReward) : 0;
    const servedReward = served?.avgReward != null ? Number(served.avgReward) : 0;
    const margin = candidateReward - servedReward;
    const clears = margin >= settings.shadowThreshold;
    if (!clears) continue;

    await db
      .update(modelReputationTable)
      .set({ promoted: true, updatedAt: new Date() })
      .where(
        and(
          eq(modelReputationTable.taskCategory, s.taskCategory),
          eq(modelReputationTable.model, s.candidateModel),
        ),
      );

    await writeAuditEntry({
      clientId: s.clientId,
      engine: "model_router",
      decisionType: "model_selection",
      payload: {
        action: "shadow_promotion",
        taskCategory: s.taskCategory,
        candidateModel: s.candidateModel,
        servedModel: s.servedModel,
        candidateReward,
        servedReward,
        margin,
        threshold: settings.shadowThreshold,
        samples: Number(s.samples),
      },
    }).catch(() => {});

    console.log(
      `[ModelReputation] shadow promotion: ${s.candidateModel} beat ${s.servedModel} by ${margin.toFixed(3)} in ${s.taskCategory} (client ${s.clientId})`,
    );
  }
}

/** Scheduler entry point — re-evaluates reputation at most once per day. */
export async function runModelReputationReeval(): Promise<void> {
  const now = Date.now();
  if (now - lastReputationRun < ONE_DAY_MS) return;
  lastReputationRun = now;
  try {
    await recomputeModelReputations();
  } catch (err) {
    console.error("[ModelReputation] re-evaluation failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Weekly golden-prompt regression eval — runs at most once per week.
 * Seeding is idempotent (no-ops when prompts already exist).
 */
export async function runScheduledGoldenEval(): Promise<void> {
  const now = Date.now();
  if (now - lastGoldenEvalRun < ONE_WEEK_MS) return;
  lastGoldenEvalRun = now;
  try {
    await seedGoldenPromptsIfEmpty();
    const result = await runGoldenEval("scheduler");
    console.log(
      `[ModelReputation] weekly golden eval done: ${result.promptsEvaluated} prompts, ` +
      `regressions: ${result.results.filter((r) => r.regressionFlag).map((r) => r.model).join(", ") || "none"}`,
    );
  } catch (err) {
    console.error("[ModelReputation] scheduled golden eval failed:", err instanceof Error ? err.message : err);
  }
}
