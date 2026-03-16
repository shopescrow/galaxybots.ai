import { db, llmUsageLogTable } from "@workspace/db";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4-turbo": { input: 10 / 1_000_000, output: 30 / 1_000_000 },
  "gpt-3.5-turbo": { input: 0.5 / 1_000_000, output: 1.5 / 1_000_000 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[model] ?? MODEL_COSTS["gpt-4o-mini"]!;
  return Math.round((promptTokens * costs.input + completionTokens * costs.output) * 1_000_000) / 1_000_000;
}

export async function logLlmUsage(params: {
  clientId?: number | null;
  botId?: number | null;
  sessionId?: number | null;
  conversationId?: number | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}): Promise<void> {
  const cost = estimateCost(params.model, params.promptTokens, params.completionTokens);

  try {
    await db.insert(llmUsageLogTable).values({
      clientId: params.clientId ?? null,
      botId: params.botId ?? null,
      sessionId: params.sessionId ?? null,
      conversationId: params.conversationId ?? null,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      estimatedCostUsd: String(cost),
      latencyMs: params.latencyMs,
    });
  } catch (err) {
    console.error("Failed to log LLM usage:", err);
  }
}
