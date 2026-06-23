import { db, alignmentSignalsTable } from "@workspace/db";
import { eq, gte, isNull, and } from "drizzle-orm";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastAlignmentRun = 0;

const SINGLE_STAKEHOLDER_CLUSTER_MIN = 10;
const MULTI_STAKEHOLDER_CLUSTER_MIN = 5;

/**
 * Stakeholder-tier weights — owner signals carry 3× the weight of downstream signals,
 * reflecting the accountability hierarchy: owners set policy, clients provide feedback,
 * downstream systems are indirect indicators.
 */
const STAKEHOLDER_TIER_WEIGHT: Record<string, number> = {
  owner: 3,
  client: 2,
  downstream: 1,
};

function getWeight(stakeholder: string | null): number {
  return STAKEHOLDER_TIER_WEIGHT[stakeholder ?? ""] ?? 1;
}

/**
 * Extracts a soft rule from a set of alignment signals using stakeholder-tier weighting.
 * Rule confidence is weighted by stakeholder importance so owner approval patterns
 * dominate over single client anecdotes.
 */
function extractSoftRule(signals: typeof alignmentSignalsTable.$inferSelect[]): {
  rule: string;
  confidence: number;
} {
  // Tier-weighted frequency per category
  const categoryWeight: Record<string, number> = {};
  let totalWeight = 0;

  for (const s of signals) {
    const key = s.patternCategory ?? "uncategorized";
    const w = getWeight(s.sourceStakeholder);
    categoryWeight[key] = (categoryWeight[key] ?? 0) + w;
    totalWeight += w;
  }

  const topCategory = Object.entries(categoryWeight).sort((a, b) => b[1] - a[1])[0];

  const stakeholders = [...new Set(signals.map((s) => s.sourceStakeholder))];
  const stakeholderLabel = stakeholders.length > 1 ? "multiple stakeholders" : stakeholders[0];
  const pattern = topCategory ? `"${topCategory[0]}"` : "communication style";

  const rule = `When handling ${pattern} requests from ${stakeholderLabel}, prefer the adjusted approach observed in ${signals.length} aligned decisions.`;

  // Confidence is proportional to tier-weighted signal strength, not raw count alone.
  // A single high-tier (owner) cluster is more reliable than many low-tier signals.
  const weightedDensity = totalWeight / Math.max(signals.length, 1);
  const confidence = Math.min(0.95, 0.4 + (weightedDensity * signals.length) / 100);

  return { rule, confidence };
}

export async function runAlignmentPatternExtraction() {
  const now = Date.now();
  if (now - lastAlignmentRun < ONE_WEEK_MS) return;
  lastAlignmentRun = now;

  console.log("[alignment] Running weekly alignment pattern extraction...");

  const since = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const unprocessed = await db
    .select()
    .from(alignmentSignalsTable)
    .where(
      and(
        gte(alignmentSignalsTable.createdAt, since),
        isNull(alignmentSignalsTable.extractedSoftRule),
      ),
    )
    .limit(500);

  const byCategory: Record<string, typeof alignmentSignalsTable.$inferSelect[]> = {};
  for (const signal of unprocessed) {
    const key = signal.patternCategory ?? "uncategorized";
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(signal);
  }

  let rulesExtracted = 0;

  for (const [category, signals] of Object.entries(byCategory)) {
    const stakeholders = [...new Set(signals.map((s) => s.sourceStakeholder))];
    const isMultiStakeholder = stakeholders.length > 1;
    const threshold = isMultiStakeholder
      ? MULTI_STAKEHOLDER_CLUSTER_MIN
      : SINGLE_STAKEHOLDER_CLUSTER_MIN;

    // Apply tier-weighted threshold: a cluster dominated by high-tier (owner) signals
    // clears the threshold with fewer raw signals.
    const weightedCount = signals.reduce((acc, s) => acc + getWeight(s.sourceStakeholder), 0);
    const effectiveCount = Math.round(weightedCount / 1.5); // normalize to raw-count equivalent

    if (effectiveCount < threshold) {
      console.log(
        `[alignment] Category "${category}": ${signals.length} signals (weighted=${effectiveCount}, need ${threshold}), skipping`,
      );
      continue;
    }

    const { rule, confidence } = extractSoftRule(signals);
    const clusterId = `${category}_${Date.now()}`;

    for (const signal of signals) {
      try {
        await db
          .update(alignmentSignalsTable)
          .set({
            extractedSoftRule: rule,
            softRuleConfidence: confidence,
            softRuleStatus: "proposed",
            clusterId,
          })
          .where(eq(alignmentSignalsTable.id, signal.id));
      } catch (err) {
        console.error(`[alignment] Error updating signal ${signal.id}:`, err);
      }
    }

    rulesExtracted++;
    console.log(
      `[alignment] Extracted rule for cluster "${category}" (${signals.length} signals, weighted=${effectiveCount}): "${rule.slice(0, 80)}..."`,
    );
  }

  console.log(`[alignment] Pattern extraction complete. Rules extracted: ${rulesExtracted}`);
}
