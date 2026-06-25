import { db, usageEventsTable, llmUsageLogTable, toolActivityLogTable, botsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";

export interface AttributionBucketByBot {
  botId: number | null;
  botName: string;
  credits: number;
  llmCalls: number;
  llmCostUsd: number;
}

export interface AttributionBucketByModel {
  model: string;
  modelTier: string;
  credits: number;
  events: number;
  llmCostUsd: number;
}

export interface AttributionBucketByTier {
  modelTier: string;
  credits: number;
  llmCalls: number;
  llmCostUsd: number;
}

export interface AttributionBucketByRoute {
  route: string;
  credits: number;
  events: number;
}

export interface AttributionBucketByDay {
  day: string;
  credits: number;
  events: number;
}

export interface ToolActivityBucket {
  toolName: string;
  botName: string | null;
  calls: number;
}

export interface UsageAttribution {
  periodStart: string;
  periodEnd: string;
  totals: {
    totalCredits: number;
    totalEvents: number;
    llmCalls: number;
    llmCostUsd: number;
    toolCalls: number;
  };
  byBot: AttributionBucketByBot[];
  byModel: AttributionBucketByModel[];
  byTier: AttributionBucketByTier[];
  byRoute: AttributionBucketByRoute[];
  byDay: AttributionBucketByDay[];
  toolActivity: ToolActivityBucket[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregates billable credit usage for a client in a date range and enriches it
 * with source attribution.
 *
 * The billable source-of-truth is `usage_events` (creditsDeducted). Rich
 * attribution (bot, model tier, USD cost) lives in `llm_usage_log`, which has no
 * direct foreign key to usage_events. We therefore distribute the billable
 * credits across bots/tiers proportionally to the llm_usage_log signal (USD
 * cost, falling back to call count) recorded in the same window, so every credit
 * traces back to where it most likely came from. By-model, by-route and by-day
 * come directly from usage_events.
 */
export async function aggregateUsageAttribution(
  clientId: number,
  periodStart: Date,
  periodEnd: Date,
): Promise<UsageAttribution> {
  const eventConds = [
    eq(usageEventsTable.clientId, clientId),
    gte(usageEventsTable.createdAt, periodStart),
    lte(usageEventsTable.createdAt, periodEnd),
  ];
  const llmConds = [
    eq(llmUsageLogTable.clientId, clientId),
    gte(llmUsageLogTable.calledAt, periodStart),
    lte(llmUsageLogTable.calledAt, periodEnd),
  ];
  const toolConds = [
    eq(toolActivityLogTable.clientId, clientId),
    gte(toolActivityLogTable.createdAt, periodStart),
    lte(toolActivityLogTable.createdAt, periodEnd),
  ];

  const [byModelRows, byRouteRows, byDayRows, totalsRow] = await Promise.all([
    db
      .select({
        model: usageEventsTable.model,
        credits: sql<number>`COALESCE(SUM(${usageEventsTable.creditsDeducted}), 0)`,
        events: sql<number>`COUNT(*)`,
      })
      .from(usageEventsTable)
      .where(and(...eventConds))
      .groupBy(usageEventsTable.model),
    db
      .select({
        route: sql<string>`COALESCE(${usageEventsTable.route}, 'unknown')`,
        credits: sql<number>`COALESCE(SUM(${usageEventsTable.creditsDeducted}), 0)`,
        events: sql<number>`COUNT(*)`,
      })
      .from(usageEventsTable)
      .where(and(...eventConds))
      .groupBy(sql`COALESCE(${usageEventsTable.route}, 'unknown')`),
    db
      .select({
        day: sql<string>`TO_CHAR(${usageEventsTable.createdAt}, 'YYYY-MM-DD')`,
        credits: sql<number>`COALESCE(SUM(${usageEventsTable.creditsDeducted}), 0)`,
        events: sql<number>`COUNT(*)`,
      })
      .from(usageEventsTable)
      .where(and(...eventConds))
      .groupBy(sql`TO_CHAR(${usageEventsTable.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${usageEventsTable.createdAt}, 'YYYY-MM-DD')`),
    db
      .select({
        credits: sql<number>`COALESCE(SUM(${usageEventsTable.creditsDeducted}), 0)`,
        events: sql<number>`COUNT(*)`,
      })
      .from(usageEventsTable)
      .where(and(...eventConds)),
  ]);

  const totalCredits = Number(totalsRow[0]?.credits ?? 0);
  const totalEvents = Number(totalsRow[0]?.events ?? 0);

  const [llmByBot, llmByTier, llmByModel, toolRows] = await Promise.all([
    db
      .select({
        botId: llmUsageLogTable.botId,
        llmCalls: sql<number>`COUNT(*)`,
        llmCostUsd: sql<number>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
      })
      .from(llmUsageLogTable)
      .where(and(...llmConds))
      .groupBy(llmUsageLogTable.botId),
    db
      .select({
        modelTier: sql<string>`COALESCE(${llmUsageLogTable.modelTier}, 'frontier')`,
        llmCalls: sql<number>`COUNT(*)`,
        llmCostUsd: sql<number>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
      })
      .from(llmUsageLogTable)
      .where(and(...llmConds))
      .groupBy(sql`COALESCE(${llmUsageLogTable.modelTier}, 'frontier')`),
    db
      .select({
        model: llmUsageLogTable.model,
        modelTier: sql<string>`COALESCE(${llmUsageLogTable.modelTier}, 'frontier')`,
        llmCalls: sql<number>`COUNT(*)`,
        llmCostUsd: sql<number>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
      })
      .from(llmUsageLogTable)
      .where(and(...llmConds))
      .groupBy(llmUsageLogTable.model, sql`COALESCE(${llmUsageLogTable.modelTier}, 'frontier')`),
    db
      .select({
        toolName: toolActivityLogTable.toolName,
        botName: toolActivityLogTable.botName,
        calls: sql<number>`COUNT(*)`,
      })
      .from(toolActivityLogTable)
      .where(and(...toolConds))
      .groupBy(toolActivityLogTable.toolName, toolActivityLogTable.botName)
      .orderBy(sql`COUNT(*) DESC`),
  ]);

  const llmCalls = llmByBot.reduce((s, r) => s + Number(r.llmCalls), 0);
  const llmCostUsd = round2(llmByBot.reduce((s, r) => s + Number(r.llmCostUsd), 0) * 100) / 100;
  const llmCostExact = llmByBot.reduce((s, r) => s + Number(r.llmCostUsd), 0);

  // Resolve bot names.
  const botIds = llmByBot.map((r) => r.botId).filter((id): id is number => id != null);
  const botNameMap = new Map<number, string>();
  if (botIds.length > 0) {
    const bots = await db
      .select({ id: botsTable.id, name: botsTable.name })
      .from(botsTable)
      .where(inArray(botsTable.id, botIds));
    for (const b of bots) botNameMap.set(b.id, b.name);
  }

  // Allocate the billable credits across bots proportionally to the llm signal.
  const allocWeights = llmByBot.map((r) => ({
    botId: r.botId,
    weight: llmCostExact > 0 ? Number(r.llmCostUsd) : Number(r.llmCalls),
    llmCalls: Number(r.llmCalls),
    llmCostUsd: round2(Number(r.llmCostUsd)),
  }));
  const totalWeight = allocWeights.reduce((s, r) => s + r.weight, 0);

  const byBot: AttributionBucketByBot[] = [];
  if (allocWeights.length > 0 && totalWeight > 0) {
    let allocated = 0;
    allocWeights.forEach((w, idx) => {
      const isLast = idx === allocWeights.length - 1;
      const credits = isLast
        ? totalCredits - allocated
        : Math.round((w.weight / totalWeight) * totalCredits);
      allocated += credits;
      byBot.push({
        botId: w.botId,
        botName: w.botId != null ? botNameMap.get(w.botId) ?? `Bot #${w.botId}` : "Platform / Unattributed",
        credits,
        llmCalls: w.llmCalls,
        llmCostUsd: w.llmCostUsd,
      });
    });
  } else if (totalCredits > 0) {
    byBot.push({
      botId: null,
      botName: "Platform / Unattributed",
      credits: totalCredits,
      llmCalls: 0,
      llmCostUsd: 0,
    });
  }
  byBot.sort((a, b) => b.credits - a.credits);

  // Tier allocation, proportional to llm tier signal.
  const tierWeights = llmByTier.map((r) => ({
    modelTier: r.modelTier,
    weight: llmCostExact > 0 ? Number(r.llmCostUsd) : Number(r.llmCalls),
    llmCalls: Number(r.llmCalls),
    llmCostUsd: round2(Number(r.llmCostUsd)),
  }));
  const tierTotalWeight = tierWeights.reduce((s, r) => s + r.weight, 0);
  const byTier: AttributionBucketByTier[] = [];
  if (tierWeights.length > 0 && tierTotalWeight > 0) {
    let allocated = 0;
    tierWeights.forEach((w, idx) => {
      const isLast = idx === tierWeights.length - 1;
      const credits = isLast
        ? totalCredits - allocated
        : Math.round((w.weight / tierTotalWeight) * totalCredits);
      allocated += credits;
      byTier.push({ modelTier: w.modelTier, credits, llmCalls: w.llmCalls, llmCostUsd: w.llmCostUsd });
    });
  } else if (totalCredits > 0) {
    byTier.push({ modelTier: "frontier", credits: totalCredits, llmCalls: 0, llmCostUsd: 0 });
  }
  byTier.sort((a, b) => b.credits - a.credits);

  // Map model -> tier and llm cost from llm_usage_log for by-model enrichment.
  const modelTierMap = new Map<string, { tier: string; cost: number }>();
  for (const r of llmByModel) {
    modelTierMap.set(r.model, { tier: r.modelTier, cost: round2(Number(r.llmCostUsd)) });
  }

  const byModel: AttributionBucketByModel[] = byModelRows
    .map((r) => ({
      model: r.model,
      modelTier: modelTierMap.get(r.model)?.tier ?? "frontier",
      credits: Number(r.credits),
      events: Number(r.events),
      llmCostUsd: modelTierMap.get(r.model)?.cost ?? 0,
    }))
    .sort((a, b) => b.credits - a.credits);

  const byRoute: AttributionBucketByRoute[] = byRouteRows
    .map((r) => ({ route: r.route, credits: Number(r.credits), events: Number(r.events) }))
    .sort((a, b) => b.credits - a.credits);

  const byDay: AttributionBucketByDay[] = byDayRows.map((r) => ({
    day: r.day,
    credits: Number(r.credits),
    events: Number(r.events),
  }));

  const toolActivity: ToolActivityBucket[] = toolRows.map((r) => ({
    toolName: r.toolName,
    botName: r.botName,
    calls: Number(r.calls),
  }));
  const toolCalls = toolActivity.reduce((s, r) => s + r.calls, 0);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totals: {
      totalCredits,
      totalEvents,
      llmCalls,
      llmCostUsd,
      toolCalls,
    },
    byBot,
    byModel,
    byTier,
    byRoute,
    byDay,
    toolActivity,
  };
}
