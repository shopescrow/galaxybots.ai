import {
  db,
  confidencePredictionsTable,
  calibrationCheckpointsTable,
  sessionOutcomesTable,
  botsTable,
} from "@workspace/db";
import { eq, gte, and, isNotNull, isNull } from "drizzle-orm";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastCalibrationRun = 0;

function computeECE(bins: Array<{ predicted: number; actual: number; count: number }>): number {
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total === 0) return 0;
  return bins.reduce((s, b) => s + (b.count / total) * Math.abs(b.predicted - b.actual), 0);
}

function plattScaleFactor(predictions: number[], outcomes: number[]): number {
  if (predictions.length < 5) return 1.0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < predictions.length; i++) {
    const p = Math.max(0.01, Math.min(0.99, predictions[i]));
    const logOdds = Math.log(p / (1 - p));
    num += logOdds * outcomes[i];
    den += logOdds * logOdds;
  }
  if (den === 0) return 1.0;
  const slope = num / den;
  return Math.max(0.1, Math.min(5.0, 1 / slope));
}

export async function runCalibrationPipeline() {
  const now = Date.now();
  if (now - lastCalibrationRun < ONE_WEEK_MS) return;
  lastCalibrationRun = now;

  console.log("[calibration] Running weekly calibration pipeline...");

  const bots = await db.select({ id: botsTable.id }).from(botsTable);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - ONE_WEEK_MS);

  for (const bot of bots) {
    try {
      // Fetch all raw (pre-scaling) confidence predictions for this bot in the period.
      // We do NOT filter by outcome field — instead we join to session_outcomes below
      // to derive the actual label from whether the session had a failure_category.
      const predictions = await db
        .select({
          id: confidencePredictionsTable.id,
          sessionId: confidencePredictionsTable.sessionId,
          conversationId: confidencePredictionsTable.conversationId,
          predictedConfidence: confidencePredictionsTable.predictedConfidence,
          outcome: confidencePredictionsTable.outcome,
        })
        .from(confidencePredictionsTable)
        .where(
          and(
            eq(confidencePredictionsTable.botId, bot.id),
            isNotNull(confidencePredictionsTable.predictedConfidence),
            gte(confidencePredictionsTable.createdAt, periodStart),
          ),
        )
        .limit(2000);

      if (predictions.length < 5) {
        console.log(`[calibration] Bot ${bot.id}: insufficient predictions (${predictions.length}), skipping`);
        continue;
      }

      // Gather all unique sessionIds from predictions to do a single bulk lookup
      const sessionIds = [...new Set(
        predictions.map((p) => p.sessionId).filter((id): id is number => id !== null),
      )];

      // Bulk fetch session outcomes for those sessions — derive actual label:
      // failureCategory IS NULL → success (1), IS NOT NULL → failure (0)
      const outcomeLookup = new Map<number, number>();
      if (sessionIds.length > 0) {
        // Drizzle doesn't have a native inArray that cleanly handles large arrays in all cases;
        // use direct select with session_id filter via SQL
        const outcomes = await db
          .select({
            sessionId: sessionOutcomesTable.sessionId,
            failureCategory: sessionOutcomesTable.failureCategory,
            terminationReason: sessionOutcomesTable.terminationReason,
          })
          .from(sessionOutcomesTable)
          .where(gte(sessionOutcomesTable.createdAt, periodStart));

        for (const o of outcomes) {
          // success if no failure category AND not a budget/error termination
          const failed =
            o.failureCategory !== null ||
            ["time_budget", "cost_budget", "token_budget", "llm_error", "circuit_open"].includes(
              o.terminationReason ?? "",
            );
          outcomeLookup.set(o.sessionId, failed ? 0 : 1);
        }
      }

      const NUM_BINS = 10;
      const bins: Array<{ predicted: number; actual: number; count: number }> = Array.from(
        { length: NUM_BINS },
        (_, i) => ({ predicted: (i + 0.5) / NUM_BINS, actual: 0, count: 0 }),
      );
      const binActualSum = new Array(NUM_BINS).fill(0);

      const rawPredictions: number[] = [];
      const rawOutcomes: number[] = [];

      for (const p of predictions) {
        const conf = parseFloat(String(p.predictedConfidence));
        if (isNaN(conf)) continue;

        // Derive actual outcome: 1. use explicit outcome field if set; 2. look up via session join
        let actualSuccess: number;
        if (p.outcome === "success") {
          actualSuccess = 1;
        } else if (p.outcome === "failure") {
          actualSuccess = 0;
        } else if (p.sessionId !== null && outcomeLookup.has(p.sessionId)) {
          actualSuccess = outcomeLookup.get(p.sessionId)!;
        } else {
          // No session outcome yet (session still in progress); skip this prediction
          continue;
        }

        rawPredictions.push(conf);
        rawOutcomes.push(actualSuccess);

        const binIdx = Math.min(Math.floor(conf * NUM_BINS), NUM_BINS - 1);
        bins[binIdx].count++;
        binActualSum[binIdx] += actualSuccess;
      }

      if (rawPredictions.length < 5) {
        console.log(`[calibration] Bot ${bot.id}: only ${rawPredictions.length} matched predictions with outcomes, skipping`);
        continue;
      }

      for (let i = 0; i < NUM_BINS; i++) {
        if (bins[i].count > 0) {
          bins[i].actual = binActualSum[i] / bins[i].count;
        }
      }

      const activeBins = bins.filter((b) => b.count > 0);
      const calibrationError = computeECE(activeBins);
      const temperatureScaleFactor = plattScaleFactor(rawPredictions, rawOutcomes);
      const predictedAvg = rawPredictions.reduce((s, v) => s + v, 0) / rawPredictions.length;
      const actualAvg = rawOutcomes.reduce((s, v) => s + v, 0) / rawOutcomes.length;

      await db.insert(calibrationCheckpointsTable).values({
        botId: bot.id,
        periodEnd,
        predictedAvg,
        actualAvg,
        calibrationError,
        temperatureScaleFactor,
        sampleSize: rawPredictions.length,
        reliabilityCurve: activeBins,
      });

      console.log(
        `[calibration] Bot ${bot.id}: ECE=${calibrationError.toFixed(3)}, temp_scale=${temperatureScaleFactor.toFixed(3)}, n=${rawPredictions.length} (${predictions.length} raw predictions, ${sessionIds.length} sessions)`,
      );
    } catch (err) {
      console.error(`[calibration] Error for bot ${bot.id}:`, err);
    }
  }

  console.log("[calibration] Weekly calibration pipeline complete.");
}
