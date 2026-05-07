import { db, llmUsageLogTable, modelCostsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 5 / 1_000_000, output: 15 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4-turbo": { input: 10 / 1_000_000, output: 30 / 1_000_000 },
  "gpt-3.5-turbo": { input: 0.5 / 1_000_000, output: 1.5 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

let cachedDbCosts: Record<string, { input: number; output: number }> | null = null;
let cacheRefreshedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function refreshCostCache(): Promise<void> {
  try {
    const rows = await db.select().from(modelCostsTable);
    const map: Record<string, { input: number; output: number }> = {};
    for (const row of rows) {
      map[row.model] = {
        input: parseFloat(row.inputCostPerToken),
        output: parseFloat(row.outputCostPerToken),
      };
    }
    cachedDbCosts = map;
    cacheRefreshedAt = Date.now();
  } catch {
    if (!cachedDbCosts) {
      cachedDbCosts = {};
      cacheRefreshedAt = Date.now();
    }
  }
}

function getCosts(model: string): { input: number; output: number } {
  if (cachedDbCosts && cachedDbCosts[model]) {
    return cachedDbCosts[model];
  }
  return MODEL_COSTS[model] ?? MODEL_COSTS["gpt-4o-mini"]!;
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = getCosts(model);
  return Math.round((promptTokens * costs.input + completionTokens * costs.output) * 1_000_000) / 1_000_000;
}

export async function ensureCostCacheLoaded(): Promise<void> {
  if (!cachedDbCosts || Date.now() - cacheRefreshedAt > CACHE_TTL_MS) {
    await refreshCostCache();
  }
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
  await ensureCostCacheLoaded();
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

export async function upsertModelCost(model: string, inputCostPerToken: number, outputCostPerToken: number, contextWindow = 128000): Promise<void> {
  const existing = await db.select().from(modelCostsTable).where(eq(modelCostsTable.model, model));
  if (existing.length > 0) {
    await db.update(modelCostsTable).set({
      inputCostPerToken: String(inputCostPerToken),
      outputCostPerToken: String(outputCostPerToken),
      contextWindow: String(contextWindow),
      updatedAt: new Date(),
    }).where(eq(modelCostsTable.model, model));
  } else {
    await db.insert(modelCostsTable).values({
      model,
      inputCostPerToken: String(inputCostPerToken),
      outputCostPerToken: String(outputCostPerToken),
      contextWindow: String(contextWindow),
    });
  }
  await refreshCostCache();
}

export async function getAllModelCosts(): Promise<Array<{ model: string; inputCostPerToken: string; outputCostPerToken: string; contextWindow: string }>> {
  const dbRows = await db.select().from(modelCostsTable);
  if (dbRows.length > 0) return dbRows;
  return Object.entries(MODEL_COSTS).map(([model, costs]) => ({
    model,
    inputCostPerToken: String(costs.input),
    outputCostPerToken: String(costs.output),
    contextWindow: "128000",
  }));
}
