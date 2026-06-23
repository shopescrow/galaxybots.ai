import { db, botLoopConfigTable, botFailureLogTable, confidencePredictionsTable, sessionOutcomesTable, calibrationCheckpointsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type {
  ConfigProvider,
  AgentLoopConfig,
  FailureLogStore,
  FailureRecord,
  SessionStore,
} from "./ports/index.js";
import { DEFAULT_LOOP_CONFIG } from "./ports/index.js";

// In-memory cache of temperature scale factors per bot (refreshed hourly).
// Temperature scaling is applied at USE time (decisions/display), NOT at storage time,
// so that calibration can always read immutable raw model-output confidence values.
const tempScaleCache = new Map<number, { factor: number; expiresAt: number }>();
const TEMP_SCALE_CACHE_TTL_MS = 60 * 60 * 1000;

export async function getTemperatureScaleFactor(botId: number): Promise<number> {
  const now = Date.now();
  const cached = tempScaleCache.get(botId);
  if (cached && cached.expiresAt > now) return cached.factor;

  try {
    const [checkpoint] = await db
      .select({ temperatureScaleFactor: calibrationCheckpointsTable.temperatureScaleFactor })
      .from(calibrationCheckpointsTable)
      .where(eq(calibrationCheckpointsTable.botId, botId))
      .orderBy(desc(calibrationCheckpointsTable.periodEnd))
      .limit(1);

    const factor = checkpoint?.temperatureScaleFactor ?? 1.0;
    tempScaleCache.set(botId, { factor, expiresAt: now + TEMP_SCALE_CACHE_TTL_MS });
    return factor;
  } catch {
    return 1.0;
  }
}

/**
 * Applies Platt temperature scaling via log-odds rescaling.
 * Called at decision/display time — NOT at storage time — so that calibration
 * always reads immutable raw model-output confidence values from the DB.
 */
export function applyTemperatureScaling(rawConfidence: number, scaleFactor: number): number {
  if (scaleFactor === 1.0) return rawConfidence;
  const clipped = Math.max(0.001, Math.min(0.999, rawConfidence));
  const logOdds = Math.log(clipped / (1 - clipped));
  const scaledLogOdds = logOdds / scaleFactor;
  const scaled = 1 / (1 + Math.exp(-scaledLogOdds));
  return Math.max(0, Math.min(1, scaled));
}

export class DbConfigProvider implements ConfigProvider {
  async getLoopConfig(botId: number, clientId?: number): Promise<AgentLoopConfig> {
    try {
      const conditions = clientId
        ? and(eq(botLoopConfigTable.botId, botId), eq(botLoopConfigTable.clientId, clientId))
        : eq(botLoopConfigTable.botId, botId);

      const [row] = await db.select().from(botLoopConfigTable).where(conditions).limit(1);

      if (!row) return DEFAULT_LOOP_CONFIG;

      return {
        maxIterations: row.maxIterations,
        timeBudgetMs: row.timeBudgetMs,
        costBudgetCents: row.costBudgetCents,
        qualityThreshold: parseFloat(String(row.qualityThreshold)),
        enableSelfEvaluation: row.enableSelfEvaluation,
        enableBrowserAgent: row.enableBrowserAgent,
        model: row.model,
        fallbackModel: row.fallbackModel ?? undefined,
        networkAllowList: row.networkAllowList ?? [],
      };
    } catch {
      return DEFAULT_LOOP_CONFIG;
    }
  }
}

export class DbFailureLogStore implements FailureLogStore {
  async logFailure(record: FailureRecord): Promise<void> {
    try {
      await db.insert(botFailureLogTable).values({
        botId: record.botId ?? null,
        clientId: record.clientId ?? null,
        sessionId: record.sessionId ?? null,
        conversationId: record.conversationId ?? null,
        failureCategory: record.failureCategory,
        failureDetail: record.failureDetail,
        userInput: record.userInput ?? null,
        lastThought: record.lastThought ?? null,
        iterationsCompleted: record.iterationsCompleted,
        costCents: record.costCents,
        durationMs: record.durationMs,
        toolsAttempted: record.toolsAttempted,
        traceSnapshot: record.traceSnapshot ?? {},
      });
    } catch (err) {
      console.error("[DbFailureLogStore] Failed to log failure record:", err);
    }
  }
}

export class DbSessionStore implements SessionStore {
  async getSession(sessionId: number): Promise<{ id: number; objective: string; status: string } | null> {
    return null;
  }

  async updateSessionOutcome(sessionId: number, data: {
    loopIterations?: number;
    costCents?: number;
    terminationReason?: string;
    failureCategory?: string;
    loopTrace?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db
        .update(sessionOutcomesTable)
        .set({
          loopIterations: data.loopIterations,
          costCents: data.costCents,
          terminationReason: data.terminationReason,
          failureCategory: data.failureCategory,
          loopTrace: data.loopTrace,
        })
        .where(eq(sessionOutcomesTable.sessionId, sessionId));
    } catch (err) {
      console.error("[DbSessionStore] Failed to update session outcome:", err);
    }
  }
}

/**
 * Records a raw (pre-scaling) confidence prediction from the model evaluation step.
 * Stores the IMMUTABLE model-output confidence so the calibration pipeline can compare
 * it against actual session outcomes and derive the temperature scale factor.
 *
 * Temperature scaling is applied at USE time (call applyTemperatureScaling()),
 * never at storage time — preserving calibration integrity.
 */
export async function logConfidencePrediction(opts: {
  sessionId?: number;
  conversationId?: number;
  botId?: number;
  clientId?: number;
  iteration: number;
  predictedConfidence: number;
  completenessScore?: number;
  accuracyScore?: number;
  relevanceScore?: number;
  terminationReason?: string;
  outcome?: string;
}): Promise<void> {
  try {
    // Store RAW (unscaled) confidence — calibration needs immutable model-output values.
    // Downstream consumers that need calibrated predictions should call
    // applyTemperatureScaling(value, await getTemperatureScaleFactor(botId)).
    await db.insert(confidencePredictionsTable).values({
      sessionId: opts.sessionId ?? null,
      conversationId: opts.conversationId ?? null,
      botId: opts.botId ?? null,
      clientId: opts.clientId ?? null,
      iteration: opts.iteration,
      predictedConfidence: String(opts.predictedConfidence),
      completenessScore: opts.completenessScore !== undefined ? String(opts.completenessScore) : null,
      accuracyScore: opts.accuracyScore !== undefined ? String(opts.accuracyScore) : null,
      relevanceScore: opts.relevanceScore !== undefined ? String(opts.relevanceScore) : null,
      terminationReason: opts.terminationReason ?? null,
      outcome: opts.outcome ?? null,
    });
  } catch (err) {
    console.error("[logConfidencePrediction] Failed:", err);
  }
}
