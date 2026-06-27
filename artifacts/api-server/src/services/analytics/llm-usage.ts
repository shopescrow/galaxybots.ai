import { db, llmUsageLogTable, modelCostsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { ModelTier } from "../ai-safety/model-fallback.js";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "gpt-5.4": { input: 5 / 1_000_000, output: 15 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-5-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4-turbo": { input: 10 / 1_000_000, output: 30 / 1_000_000 },
  "gpt-3.5-turbo": { input: 0.5 / 1_000_000, output: 1.5 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  // GLM 5.2 variants (Zhipu BigModel). Frontier variants priced at GLM-5.2 list
  // rates; flash is the cheap efficient-tier variant. Owners can override these
  // via the admin model-costs endpoint.
  "glm-5.2": { input: 0.95 / 1_000_000, output: 3.0 / 1_000_000 },
  "glm-5.2-flash": { input: 0.2 / 1_000_000, output: 0.6 / 1_000_000 },
  "glm-5.2-plus": { input: 0.95 / 1_000_000, output: 3.0 / 1_000_000 },
  "glm-5.2-long": { input: 0.95 / 1_000_000, output: 3.0 / 1_000_000 },
  "glm-5.2-ultra": { input: 0.95 / 1_000_000, output: 3.0 / 1_000_000 },
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
  return MODEL_COSTS[model] ?? MODEL_COSTS["gpt-5-mini"]!;
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
  modelTier?: ModelTier | null;
}): Promise<void> {
  await ensureCostCacheLoaded();
  const cost = params.model === "ollama" || params.modelTier === "local"
    ? 0
    : estimateCost(params.model, params.promptTokens, params.completionTokens);

  try {
    await db.insert(llmUsageLogTable).values({
      clientId: params.clientId ?? null,
      botId: params.botId ?? null,
      sessionId: params.sessionId ?? null,
      conversationId: params.conversationId ?? null,
      model: params.model,
      modelTier: params.modelTier ?? null,
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

export async function getLlmUsageByTier(clientId?: number): Promise<{
  tiers: Array<{ tier: string; callCount: number; totalCostUsd: number; totalTokens: number }>;
  coordinatorCallCount: number;
  projectedMonthlySavingsUsd: number;
}> {
  try {
    const tierRows = await db
      .select({
        tier: llmUsageLogTable.modelTier,
        callCount: sql<number>`count(*)`,
        totalCostUsd: sql<number>`sum(${llmUsageLogTable.estimatedCostUsd}::numeric)`,
        totalTokens: sql<number>`sum(${llmUsageLogTable.promptTokens} + ${llmUsageLogTable.completionTokens})`,
      })
      .from(llmUsageLogTable)
      .where(clientId != null ? eq(llmUsageLogTable.clientId, clientId) : sql`1=1`)
      .groupBy(llmUsageLogTable.modelTier);

    const tiers = tierRows.map((r) => ({
      tier: r.tier ?? "frontier",
      callCount: Number(r.callCount),
      totalCostUsd: Number(r.totalCostUsd ?? 0),
      totalTokens: Number(r.totalTokens ?? 0),
    }));

    const localTier = tiers.find((t) => t.tier === "local");
    const coordinatorCallCount = localTier?.callCount ?? 0;

    const frontierTier = tiers.find((t) => t.tier === "frontier") ?? { totalCostUsd: 0, callCount: 0 };
    const avgFrontierCostPerCall = frontierTier.callCount > 0
      ? frontierTier.totalCostUsd / frontierTier.callCount
      : 0.002;

    const projectedMonthlySavingsUsd = coordinatorCallCount * avgFrontierCostPerCall;

    return { tiers, coordinatorCallCount, projectedMonthlySavingsUsd };
  } catch {
    return { tiers: [], coordinatorCallCount: 0, projectedMonthlySavingsUsd: 0 };
  }
}
