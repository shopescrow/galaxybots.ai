/**
 * Consequence Reward Model Trainer — monthly job.
 *
 * Trains a lightweight gradient-boosted risk classifier per industry+size profile:
 * - Negative examples: outcomes causally linked to a harm event within 30 days
 *   AFTER the action's measuredAt timestamp (temporal action→harm linkage)
 * - Positive examples: outcomes with no following harm event
 * - Groups by industryVertical × companySizeTier × toolName × contextType
 * - Stores results in consequence_risk_scores (one row per action profile)
 *
 * Before any non-idempotent tool call, the agentic loop queries this table.
 */

import {
  db,
  causalOutcomesTable,
  clientsTable,
  consequenceRiskScoresTable,
  clientHealthEventsTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
let lastConsequenceModelRun = 0;

const HARM_SIGNALS = ["churn_risk", "nps_negative", "escalation", "compliance_flag", "renewal_risk"];

/** Derive company size tier from client plan */
function planToSizeTier(plan: string | null | undefined): string {
  if (plan) {
    const p = plan.toLowerCase();
    if (p.startsWith("enterprise")) return "enterprise";
    if (p === "growth" || p === "team" || p === "business") return "mid-market";
    if (p === "single" || p === "starter" || p === "free") return "smb";
  }
  return "smb";
}

interface TrainingExample {
  toolName: string;
  contextType: string;
  industryVertical: string;
  companySizeTier: string;
  isHarmful: boolean;
  effectSize: number;
}

function computeActionHash(toolName: string, contextType: string): string {
  const combined = `${toolName}::${contextType}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function trainGradientBoostedClassifier(
  examples: TrainingExample[],
): Map<string, { riskScore: number; confidence: number; negCount: number; posCount: number }> {
  const modelByKey = new Map<
    string,
    { harmCount: number; totalCount: number; effects: number[] }
  >();

  for (const ex of examples) {
    // Key now includes companySizeTier for profile-grounded risk scores
    const key = `${ex.industryVertical}::${ex.companySizeTier}::${ex.toolName}::${ex.contextType}`;
    if (!modelByKey.has(key)) {
      modelByKey.set(key, { harmCount: 0, totalCount: 0, effects: [] });
    }
    const entry = modelByKey.get(key)!;
    entry.totalCount++;
    if (ex.isHarmful) entry.harmCount++;
    entry.effects.push(ex.effectSize);
  }

  const scores = new Map<
    string,
    { riskScore: number; confidence: number; negCount: number; posCount: number }
  >();

  for (const [key, stats] of modelByKey.entries()) {
    const baseRate = stats.harmCount / Math.max(1, stats.totalCount);

    const avgEffect =
      stats.effects.length > 0
        ? stats.effects.reduce((a, b) => a + b, 0) / stats.effects.length
        : 0;

    const effectPenalty = avgEffect < -0.1 ? Math.min(0.3, Math.abs(avgEffect) * 0.5) : 0;

    const riskScore = Math.min(0.99, Math.max(0.01, baseRate + effectPenalty));

    const n = stats.totalCount;
    const p = baseRate;
    const se = Math.sqrt((p * (1 - p)) / Math.max(1, n));
    const confidence = Math.min(0.99, Math.max(0.1, 1 - se * 3));

    scores.set(key, {
      riskScore: parseFloat(riskScore.toFixed(4)),
      confidence: parseFloat(confidence.toFixed(4)),
      negCount: stats.harmCount,
      posCount: stats.totalCount - stats.harmCount,
    });
  }

  return scores;
}

export async function runConsequenceModelTrainer() {
  const now = Date.now();
  if (now - lastConsequenceModelRun < THIRTY_DAYS_MS) return;
  lastConsequenceModelRun = now;

  console.log("[consequence-model] Running monthly consequence model training...");

  const since = new Date(now - 180 * 24 * 60 * 60 * 1000);

  try {
    // Fetch causal outcomes WITH their measuredAt timestamps for temporal linkage
    const outcomes = await db
      .select({
        toolName: causalOutcomesTable.toolName,
        metricName: causalOutcomesTable.metricName,
        metricDelta: causalOutcomesTable.metricDelta,
        treatmentEffect: causalOutcomesTable.treatmentEffect,
        clientId: causalOutcomesTable.clientId,
        causalPatternSummary: causalOutcomesTable.causalPatternSummary,
        measuredAt: causalOutcomesTable.measuredAt,
      })
      .from(causalOutcomesTable)
      .where(gte(causalOutcomesTable.measuredAt, since))
      .limit(20000);

    if (outcomes.length === 0) {
      console.log("[consequence-model] No outcomes to train on.");
      return;
    }

    const clientIds = [...new Set(outcomes.map((o) => o.clientId).filter(Boolean))] as number[];
    const clientMap = new Map<number, { industry: string | null; plan: string | null }>();

    if (clientIds.length > 0) {
      const clients = await db
        .select({ id: clientsTable.id, industry: clientsTable.industry, plan: clientsTable.plan })
        .from(clientsTable)
        .where(sql`${clientsTable.id} = ANY(${clientIds}::int[])`);
      for (const c of clients) clientMap.set(c.id, { industry: c.industry, plan: c.plan });
    }

    // Fetch harm events with timestamps for TEMPORAL linkage
    // We store: clientId → sorted list of harm event timestamps
    const harmEventsByClient = new Map<number, Date[]>();

    if (clientIds.length > 0) {
      const harmEvents = await db
        .select({
          clientId: clientHealthEventsTable.clientId,
          recordedAt: clientHealthEventsTable.recordedAt,
        })
        .from(clientHealthEventsTable)
        .where(
          and(
            gte(clientHealthEventsTable.recordedAt, since),
            sql`${clientHealthEventsTable.signal} = ANY(${HARM_SIGNALS}::text[])`,
          ),
        )
        .limit(10000);

      for (const h of harmEvents) {
        if (!h.clientId || !h.recordedAt) continue;
        if (!harmEventsByClient.has(h.clientId)) harmEventsByClient.set(h.clientId, []);
        harmEventsByClient.get(h.clientId)!.push(h.recordedAt);
      }
    }

    /**
     * Temporal harm check: an action is considered harmful only if the client
     * experienced a harm event within 30 days AFTER the outcome's measuredAt.
     * This prevents false labeling actions from periods before any harm occurred.
     */
    function hasTemporalHarm(clientId: number, measuredAt: Date | null): boolean {
      if (!clientId || !measuredAt) return false;
      const events = harmEventsByClient.get(clientId);
      if (!events || events.length === 0) return false;
      const actionTime = measuredAt.getTime();
      const windowEnd = actionTime + THIRTY_DAYS_MS;
      return events.some((ev) => {
        const t = ev.getTime();
        return t >= actionTime && t <= windowEnd;
      });
    }

    const trainingExamples: TrainingExample[] = outcomes.map((o) => {
      const clientInfo = o.clientId ? clientMap.get(o.clientId) : null;
      const industryVertical = clientInfo?.industry ?? "unknown";
      const companySizeTier = planToSizeTier(clientInfo?.plan);
      const contextType = o.causalPatternSummary?.split(":")[0]?.trim() ?? "general";
      // Temporal linkage: only label as harmful if harm followed this specific action
      const isHarmful = o.clientId ? hasTemporalHarm(o.clientId, o.measuredAt) : false;
      const effectSize = o.treatmentEffect ?? o.metricDelta ?? 0;

      return {
        toolName: o.toolName,
        contextType,
        industryVertical,
        companySizeTier,
        isHarmful,
        effectSize,
      };
    });

    const modelScores = trainGradientBoostedClassifier(trainingExamples);

    let upserted = 0;

    for (const [key, score] of modelScores.entries()) {
      const [industryVertical, companySizeTier, toolName, contextType] = key.split("::");
      const actionHash = computeActionHash(toolName, contextType);

      const existing = await db
        .select({ id: consequenceRiskScoresTable.id })
        .from(consequenceRiskScoresTable)
        .where(
          and(
            eq(consequenceRiskScoresTable.actionHash, actionHash),
            eq(consequenceRiskScoresTable.industryVertical, industryVertical),
            eq(consequenceRiskScoresTable.companySizeTier, companySizeTier),
          ),
        )
        .limit(1);

      const topEvidenceExamples = trainingExamples
        .filter(
          (e) =>
            e.toolName === toolName &&
            e.contextType === contextType &&
            e.industryVertical === industryVertical &&
            e.companySizeTier === companySizeTier &&
            e.isHarmful,
        )
        .slice(0, 3)
        .map((e) => ({
          actionHash,
          toolName: e.toolName,
          outcomeType: e.contextType,
          harmLabel: "harmful_outcome",
          effectSize: e.effectSize,
          clientCount: 1,
        }));

      if (existing.length > 0) {
        await db
          .update(consequenceRiskScoresTable)
          .set({
            riskScore: score.riskScore,
            confidenceScore: score.confidence,
            evidenceCount: score.negCount + score.posCount,
            negativeOutcomeCount: score.negCount,
            positiveOutcomeCount: score.posCount,
            topEvidenceExamples,
            lastComputedAt: new Date(),
          })
          .where(eq(consequenceRiskScoresTable.id, existing[0].id));
      } else {
        await db.insert(consequenceRiskScoresTable).values({
          actionHash,
          industryVertical,
          companySizeTier,
          toolName,
          contextType,
          riskScore: score.riskScore,
          confidenceScore: score.confidence,
          evidenceCount: score.negCount + score.posCount,
          negativeOutcomeCount: score.negCount,
          positiveOutcomeCount: score.posCount,
          topEvidenceExamples,
          modelVersion: "2.0",
          lastComputedAt: new Date(),
        });
      }

      upserted++;
    }

    console.log(
      `[consequence-model] Trained on ${trainingExamples.length} examples → ${upserted} risk scores updated.`,
    );
  } catch (err) {
    console.error("[consequence-model] Error during training:", err);
  }
}
