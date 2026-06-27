import {
  db,
  modelSelectionTelemetryTable,
  modelReputationTable,
} from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { writeAuditEntry } from "../../audit/audit-ledger";
import { getModelOptimizerSettings } from "../../ai-safety/model-router";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let lastReputationRun = 0;

/**
 * Periodic model-reputation re-evaluation (task #231 step 6).
 *
 * Recomputes the per-(category, model, difficulty) reputation summary from the
 * live, reward-resolved telemetry, then evaluates shadow candidates: when a
 * shadow candidate's average reward clears the served model's reward by the
 * owner's promotion threshold (with enough samples), it is flagged `promoted`
 * and an audit entry is written. Promotion is observability/sign-off only — it
 * never bypasses governance; live selection still flows through the bandit over
 * already-safe paths.
 */
export async function recomputeModelReputations(): Promise<void> {
  // ── 1. Recompute global reputation summary from non-shadow telemetry ──────
  const liveRows = await db
    .select({
      taskCategory: modelSelectionTelemetryTable.taskCategory,
      model: modelSelectionTelemetryTable.model,
      difficultyBucket: modelSelectionTelemetryTable.difficultyBucket,
      avgReward: sql<number>`avg(${modelSelectionTelemetryTable.rewardScore})`,
      avgQuality: sql<number>`avg(${modelSelectionTelemetryTable.qualityScore})`,
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
    );

  for (const r of liveRows) {
    const difficultyBucket = r.difficultyBucket ?? "all";
    await db
      .insert(modelReputationTable)
      .values({
        taskCategory: r.taskCategory,
        model: r.model,
        difficultyBucket,
        avgReward: r.avgReward != null ? Number(r.avgReward) : null,
        avgQuality: r.avgQuality != null ? Number(r.avgQuality) : null,
        avgCostUsd: r.avgCost != null ? Number(r.avgCost) : null,
        avgLatencyMs: r.avgLatency != null ? Number(r.avgLatency) : null,
        sampleCount: Number(r.sampleCount),
      })
      .onConflictDoUpdate({
        target: [
          modelReputationTable.taskCategory,
          modelReputationTable.model,
          modelReputationTable.difficultyBucket,
        ],
        set: {
          avgReward: r.avgReward != null ? Number(r.avgReward) : null,
          avgQuality: r.avgQuality != null ? Number(r.avgQuality) : null,
          avgCostUsd: r.avgCost != null ? Number(r.avgCost) : null,
          avgLatencyMs: r.avgLatency != null ? Number(r.avgLatency) : null,
          sampleCount: Number(r.sampleCount),
          updatedAt: new Date(),
        },
      });
  }

  // ── 2. Evaluate shadow candidates for promotion, per client ──────────────
  // Each client's owner sets their own promotion threshold, so promotion is
  // evaluated within each client's shadow telemetry then recorded globally.
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

    // Served model's live reward for the same category (non-shadow).
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

    // Flag the candidate's reputation row as promoted (sign-off surface).
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

/** Scheduler entry point — runs at most once per day. */
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
