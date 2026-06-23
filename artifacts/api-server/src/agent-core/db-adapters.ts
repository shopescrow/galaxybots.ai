import { db, botLoopConfigTable, botFailureLogTable, confidencePredictionsTable, sessionOutcomesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type {
  ConfigProvider,
  AgentLoopConfig,
  FailureLogStore,
  FailureRecord,
  SessionStore,
} from "./ports/index.js";
import { DEFAULT_LOOP_CONFIG } from "./ports/index.js";

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
