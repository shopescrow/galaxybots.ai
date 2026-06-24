/**
 * Collective Anomaly Detection — weekly job.
 *
 * Monitors platform_causal_patterns for implausible coordinated effects:
 * - Flags patterns where effect_size > 3 SD from historical mean for that type
 * - Flags patterns where client_count spiked unusually (>3x recent mean)
 * - Quarantines flagged patterns to platform_anomalies
 * - Excludes quarantined patterns from per-client prior injection
 */

import {
  db,
  platformCausalPatternsTable,
  platformAnomaliesTable,
} from "@workspace/db";
import { eq, and, ne, sql } from "drizzle-orm";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastAnomalyDetectionRun = 0;

const STDDEV_THRESHOLD = 3.0;
const CLIENT_COUNT_SPIKE_MULTIPLIER = 3.0;

function computeStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1)
      : 0;
  return { mean, stdDev: Math.sqrt(variance) };
}

export async function runCollectiveAnomalyDetection() {
  const now = Date.now();
  if (now - lastAnomalyDetectionRun < SEVEN_DAYS_MS) return;
  lastAnomalyDetectionRun = now;

  console.log("[anomaly-detection] Running weekly collective anomaly detection...");

  try {
    const allPatterns = await db
      .select()
      .from(platformCausalPatternsTable)
      .limit(5000);

    if (allPatterns.length < 5) {
      console.log("[anomaly-detection] Insufficient patterns for anomaly detection.");
      return;
    }

    const patternsByActionType = new Map<string, typeof allPatterns>();

    for (const pattern of allPatterns) {
      const key = pattern.actionType;
      if (!patternsByActionType.has(key)) patternsByActionType.set(key, []);
      patternsByActionType.get(key)!.push(pattern);
    }

    let anomaliesDetected = 0;

    for (const [actionType, patterns] of patternsByActionType.entries()) {
      const effectSizes = patterns.map((p) => p.effectSize ?? 0);
      const clientCounts = patterns.map((p) => p.clientCount ?? 0);

      const { mean: effectMean, stdDev: effectStdDev } = computeStdDev(effectSizes);
      const { mean: clientMean, stdDev: clientStdDev } = computeStdDev(clientCounts);

      for (const pattern of patterns) {
        if (pattern.quarantined === 1) continue;

        const effectDeviations =
          effectStdDev > 0
            ? Math.abs((pattern.effectSize ?? 0) - effectMean) / effectStdDev
            : 0;

        const clientSpike =
          clientMean > 0 ? (pattern.clientCount ?? 0) / clientMean : 0;

        const isEffectAnomaly = effectDeviations > STDDEV_THRESHOLD && effectStdDev > 0.01;
        const isClientSpike =
          clientSpike > CLIENT_COUNT_SPIKE_MULTIPLIER && clientMean > 2;

        if (!isEffectAnomaly && !isClientSpike) continue;

        const anomalyType = isEffectAnomaly
          ? "implausible_effect_size"
          : "coordinated_client_spike";

        const description = isEffectAnomaly
          ? `Pattern "${actionType}" effect_size=${pattern.effectSize?.toFixed(3)} is ${effectDeviations.toFixed(1)} SD from mean (${effectMean.toFixed(3)}). Possible manipulation or data quality failure.`
          : `Pattern "${actionType}" client_count=${pattern.clientCount} is ${clientSpike.toFixed(1)}x the recent mean (${clientMean.toFixed(1)}). Possible coordinated data quality failure.`;

        const existing = await db
          .select({ id: platformAnomaliesTable.id })
          .from(platformAnomaliesTable)
          .where(
            and(
              eq(platformAnomaliesTable.patternId, pattern.id),
              eq(platformAnomaliesTable.anomalyType, anomalyType),
              eq(platformAnomaliesTable.quarantineStatus, "quarantined"),
            ),
          )
          .limit(1);

        if (existing.length > 0) continue;

        await db.insert(platformAnomaliesTable).values({
          patternId: pattern.id,
          anomalyType,
          description,
          clientsAffected: pattern.clientCount ?? 0,
          detectedEffectSize: pattern.effectSize,
          expectedEffectSize: effectMean,
          deviationStdDevs: isEffectAnomaly ? effectDeviations : clientSpike,
          quarantineStatus: "quarantined",
        });

        await db
          .update(platformCausalPatternsTable)
          .set({ quarantined: 1 })
          .where(eq(platformCausalPatternsTable.id, pattern.id));

        anomaliesDetected++;

        console.log(
          `[anomaly-detection] Quarantined pattern ${pattern.id} (${actionType}): ${anomalyType}`,
        );
      }
    }

    console.log(
      `[anomaly-detection] Scan complete. ${anomaliesDetected} new anomalies detected and quarantined.`,
    );
  } catch (err) {
    console.error("[anomaly-detection] Error during anomaly detection:", err);
  }
}
