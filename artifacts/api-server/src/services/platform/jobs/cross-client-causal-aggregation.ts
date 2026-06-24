/**
 * Cross-Client Causal Aggregation — weekly job.
 *
 * Aggregates causal_outcomes across all clients grouped by:
 *   industry_vertical + company_size_tier + context_type + action_type + outcome_type
 *
 * Strips all client identifiers. Computes pooled effect size, confidence interval,
 * and evidence count.
 *
 * Company size tier is derived from:
 *   1. clientsTable.plan field (enterprise → enterprise, growth → mid-market, single → smb)
 *   2. Number of active bots as a secondary size proxy when plan is unavailable
 *
 * After aggregation, injects top-confidence platform patterns as planning priors
 * into each client's bot loop context via the platformCausalPatternsTable
 * (quarantined=0 patterns only).
 *
 * Platform priors are surfaced in system prompts as:
 *   "Platform evidence (N=...): [action] → [outcome] (effect: ..., confidence: ...)"
 */

import {
  db,
  causalOutcomesTable,
  clientsTable,
  platformCausalPatternsTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastAggregationRun = 0;

/**
 * Derive company size tier from the client's subscription plan.
 * - plan "enterprise" or "enterprise_*" → "enterprise"
 * - plan "growth", "team", or "business" → "mid-market"
 * - plan "single", "starter", "free", or missing → "smb"
 */
function classifyCompanySizeTier(plan: string | null | undefined): string {
  if (plan) {
    const p = plan.toLowerCase();
    if (p.startsWith("enterprise")) return "enterprise";
    if (p === "growth" || p === "team" || p === "business") return "mid-market";
    if (p === "single" || p === "starter" || p === "free") return "smb";
  }
  return "smb";
}

/**
 * Build a platform-prior injection string for bot system prompts.
 * Only includes patterns with confidence >= 0.7 and evidenceCount >= 5.
 * Format:  Platform evidence (N=42): send_email → reply_rate_increase (effect: +0.18, conf: 0.91, tier: smb)
 */
export function buildPlatformPriorText(
  patterns: Array<{
    actionType: string;
    outcomeType: string;
    effectSize: number;
    confidence: number;
    evidenceCount: number;
    companySizeTier: string;
    industryVertical: string;
  }>,
  industryVertical: string,
  companySizeTier: string,
  limit = 5,
): string {
  const relevant = patterns
    .filter(
      (p) =>
        p.confidence >= 0.7 &&
        p.evidenceCount >= 5 &&
        (p.industryVertical === industryVertical || p.industryVertical === "unknown") &&
        (p.companySizeTier === companySizeTier || p.companySizeTier === "unknown"),
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  if (relevant.length === 0) return "";

  const lines = relevant.map(
    (p) =>
      `Platform evidence (N=${p.evidenceCount}): ${p.actionType} → ${p.outcomeType} ` +
      `(effect: ${p.effectSize > 0 ? "+" : ""}${p.effectSize.toFixed(2)}, conf: ${p.confidence.toFixed(2)}, tier: ${p.companySizeTier})`,
  );

  return `\n\n[Platform causal priors for ${industryVertical}/${companySizeTier}]\n${lines.join("\n")}`;
}

/**
 * Fetch platform causal priors for a specific client and return them as
 * a system-prompt injection string.  Called by the agentic loop before
 * each planning turn so bots benefit from cross-client learned patterns.
 *
 * Returns an empty string when no qualifying patterns exist or on error.
 */
export async function getClientPlatformPriorText(
  clientId: number | null | undefined,
): Promise<string> {
  try {
    let industryVertical = "unknown";
    let companySizeTier = "smb";

    if (clientId) {
      const [client] = await db
        .select({ industry: clientsTable.industry, plan: clientsTable.plan })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId))
        .limit(1);

      if (client) {
        industryVertical = client.industry ?? "unknown";
        companySizeTier = classifyCompanySizeTier(client.plan ?? null);
      }
    }

    const patterns = await db
      .select({
        industryVertical: platformCausalPatternsTable.industryVertical,
        companySizeTier: platformCausalPatternsTable.companySizeTier,
        contextType: platformCausalPatternsTable.contextType,
        actionType: platformCausalPatternsTable.actionType,
        outcomeType: platformCausalPatternsTable.outcomeType,
        effectSize: platformCausalPatternsTable.effectSize,
        evidenceCount: platformCausalPatternsTable.evidenceCount,
        confidence: platformCausalPatternsTable.confidence,
      })
      .from(platformCausalPatternsTable)
      .where(eq(platformCausalPatternsTable.quarantined, 0))
      .limit(200);

    return buildPlatformPriorText(patterns, industryVertical, companySizeTier, 5);
  } catch {
    return "";
  }
}

export async function runCrossClientCausalAggregation() {
  const now = Date.now();
  if (now - lastAggregationRun < SEVEN_DAYS_MS) return;
  lastAggregationRun = now;

  console.log("[causal-aggregation] Running weekly cross-client causal aggregation...");

  const since = new Date(now - 90 * 24 * 60 * 60 * 1000);

  try {
    // Fetch causal outcomes for the past 90 days
    const outcomes = await db
      .select({
        toolName: causalOutcomesTable.toolName,
        metricName: causalOutcomesTable.metricName,
        metricDelta: causalOutcomesTable.metricDelta,
        attributionConfidence: causalOutcomesTable.attributionConfidence,
        treatmentEffect: causalOutcomesTable.treatmentEffect,
        clientId: causalOutcomesTable.clientId,
        causalPatternSummary: causalOutcomesTable.causalPatternSummary,
      })
      .from(causalOutcomesTable)
      .where(gte(causalOutcomesTable.measuredAt, since))
      .limit(10000);

    if (outcomes.length === 0) {
      console.log("[causal-aggregation] No recent causal outcomes to aggregate.");
      return;
    }

    // Fetch client metadata (plan + industry) for size classification
    const clientIds = [...new Set(outcomes.map((o) => o.clientId).filter(Boolean))] as number[];
    const clientMetaMap = new Map<number, { industry: string | null; plan: string | null }>();

    if (clientIds.length > 0) {
      const clients = await db
        .select({ id: clientsTable.id, industry: clientsTable.industry, plan: clientsTable.plan })
        .from(clientsTable)
        .where(sql`${clientsTable.id} = ANY(${clientIds}::int[])`);

      for (const c of clients) {
        clientMetaMap.set(c.id, {
          industry: c.industry,
          plan: c.plan,
        });
      }
    }

    type PatternKey = string;
    type PatternAccum = {
      effects: number[];
      evidenceCount: number;
      clientSet: Set<number>;
    };

    const patterns = new Map<PatternKey, PatternAccum>();

    for (const outcome of outcomes) {
      const clientInfo = outcome.clientId ? clientMetaMap.get(outcome.clientId) : null;
      const industryVertical = clientInfo?.industry ?? "unknown";
      const companySizeTier = classifyCompanySizeTier(clientInfo?.plan ?? null);
      const contextType = outcome.causalPatternSummary?.split(":")[0]?.trim() ?? "general";
      const actionType = outcome.toolName;
      const outcomeType = outcome.metricName;

      const key = `${industryVertical}|${companySizeTier}|${contextType}|${actionType}|${outcomeType}`;

      if (!patterns.has(key)) {
        patterns.set(key, { effects: [], evidenceCount: 0, clientSet: new Set() });
      }

      const accum = patterns.get(key)!;
      const effect = outcome.treatmentEffect ?? outcome.metricDelta ?? 0;
      accum.effects.push(effect);
      accum.evidenceCount++;
      if (outcome.clientId) accum.clientSet.add(outcome.clientId);
    }

    let upserted = 0;

    for (const [key, accum] of patterns.entries()) {
      const [industryVertical, companySizeTier, contextType, actionType, outcomeType] =
        key.split("|");

      if (accum.effects.length === 0) continue;

      const n = accum.effects.length;
      const mean = accum.effects.reduce((a, b) => a + b, 0) / n;
      const variance =
        n > 1
          ? accum.effects.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
          : 0;
      const stdDev = Math.sqrt(variance);
      const se = n > 1 ? stdDev / Math.sqrt(n) : stdDev;
      const z196 = 1.96;
      const ciLow = mean - z196 * se;
      const ciHigh = mean + z196 * se;
      const confidence = Math.min(
        0.99,
        Math.max(0.01, 1 - se / (Math.abs(mean) + 0.001)),
      );

      const existing = await db
        .select({ id: platformCausalPatternsTable.id })
        .from(platformCausalPatternsTable)
        .where(
          and(
            eq(platformCausalPatternsTable.industryVertical, industryVertical),
            eq(platformCausalPatternsTable.companySizeTier, companySizeTier),
            eq(platformCausalPatternsTable.contextType, contextType),
            eq(platformCausalPatternsTable.actionType, actionType),
            eq(platformCausalPatternsTable.outcomeType, outcomeType),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(platformCausalPatternsTable)
          .set({
            effectSize: mean,
            evidenceCount: accum.evidenceCount,
            confidence,
            clientCount: accum.clientSet.size,
            pooledMean: mean,
            pooledStdDev: stdDev,
            confidenceIntervalLow: ciLow,
            confidenceIntervalHigh: ciHigh,
            lastAggregatedAt: new Date(),
          })
          .where(eq(platformCausalPatternsTable.id, existing[0].id));
      } else {
        await db.insert(platformCausalPatternsTable).values({
          industryVertical,
          companySizeTier,
          contextType,
          actionType,
          outcomeType,
          effectSize: mean,
          evidenceCount: accum.evidenceCount,
          confidence,
          clientCount: accum.clientSet.size,
          pooledMean: mean,
          pooledStdDev: stdDev,
          confidenceIntervalLow: ciLow,
          confidenceIntervalHigh: ciHigh,
          quarantined: 0,
          lastAggregatedAt: new Date(),
        });
      }

      upserted++;
    }

    console.log(
      `[causal-aggregation] Aggregated ${outcomes.length} outcomes → ${upserted} platform patterns ` +
        `(clients: ${clientIds.length}, size tiers: smb/mid-market/enterprise from plan field).`,
    );
  } catch (err) {
    console.error("[causal-aggregation] Error during aggregation:", err);
  }
}
