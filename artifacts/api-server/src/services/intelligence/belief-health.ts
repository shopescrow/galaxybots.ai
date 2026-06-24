import { db, botBeliefsTable, clientBotsTable, botsTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, inArray, sql } from "drizzle-orm";

export interface BotDomainHealth {
  botId: number;
  botName: string;
  domain: string;
  avgConfidence: number;
  beliefCount: number;
  contradictionCount: number;
  trustScore: number;
  status: "green" | "amber" | "red";
}

export interface BeliefHealthSummary {
  botId: number;
  botName: string;
  domains: BotDomainHealth[];
  leastReliableDomain: string | null;
  overallTrustScore: number;
  contradictionRate7d: number;
}

export interface BeliefHealthResponse {
  bots: BeliefHealthSummary[];
  computedAt: string;
}

export async function getBeliefHealth(clientId: number): Promise<BeliefHealthResponse> {
  const clientBotRows = await db
    .select({ botId: clientBotsTable.botId })
    .from(clientBotsTable)
    .where(and(eq(clientBotsTable.clientId, clientId), eq(clientBotsTable.status, "active")));

  const botIds = clientBotRows.map((r) => r.botId);
  if (botIds.length === 0) {
    return { bots: [], computedAt: new Date().toISOString() };
  }

  const botNameRows = await db
    .select({ id: botsTable.id, name: botsTable.name })
    .from(botsTable)
    .where(inArray(botsTable.id, botIds));

  const botNames = new Map<number, string>(botNameRows.map((r) => [r.id, r.name]));

  const allBeliefs = await db
    .select({
      id: botBeliefsTable.id,
      botId: botBeliefsTable.botId,
      confidence: botBeliefsTable.confidence,
      category: botBeliefsTable.category,
      contradictedById: botBeliefsTable.contradictedById,
      createdAt: botBeliefsTable.createdAt,
    })
    .from(botBeliefsTable)
    .where(
      and(
        inArray(botBeliefsTable.botId, botIds),
        eq(botBeliefsTable.clientId, clientId),
        isNull(botBeliefsTable.archivedAt),
      ),
    );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const summaries: BeliefHealthSummary[] = [];

  for (const botId of botIds) {
    const botName = botNames.get(botId) ?? `bot-${botId}`;
    const botBeliefs = allBeliefs.filter((b) => b.botId === botId);

    if (botBeliefs.length === 0) {
      summaries.push({
        botId,
        botName,
        domains: [],
        leastReliableDomain: null,
        overallTrustScore: 0.5,
        contradictionRate7d: 0,
      });
      continue;
    }

    const domainMap = new Map<string, typeof botBeliefs>();
    for (const belief of botBeliefs) {
      const cat = belief.category;
      const arr = domainMap.get(cat) ?? [];
      arr.push(belief);
      domainMap.set(cat, arr);
    }

    const domains: BotDomainHealth[] = [];
    for (const [domain, beliefs] of domainMap.entries()) {
      const contradictionCount = beliefs.filter((b) => b.contradictedById !== null).length;
      const nonContradicted = beliefs.filter((b) => b.contradictedById === null);
      const avgConfidence =
        nonContradicted.length > 0
          ? nonContradicted.reduce((s, b) => s + b.confidence, 0) / nonContradicted.length
          : 0;
      const trustScore =
        contradictionCount > 0
          ? Math.max(0, avgConfidence - contradictionCount / beliefs.length * 0.3)
          : avgConfidence;

      let status: "green" | "amber" | "red";
      if (contradictionCount > 0) {
        status = "red";
      } else if (avgConfidence < 0.5) {
        status = "amber";
      } else {
        status = "green";
      }

      domains.push({
        botId,
        botName,
        domain,
        avgConfidence,
        beliefCount: beliefs.length,
        contradictionCount,
        trustScore,
        status,
      });
    }

    domains.sort((a, b) => a.trustScore - b.trustScore);
    const leastReliableDomain = domains[0]?.domain ?? null;

    const recent = botBeliefs.filter(
      (b) => new Date(b.createdAt).getTime() > sevenDaysAgo.getTime(),
    );
    const recentContradictions = recent.filter((b) => b.contradictedById !== null).length;
    const contradictionRate7d =
      recent.length > 0 ? recentContradictions / recent.length : 0;

    const overallTrustScore =
      domains.length > 0
        ? domains.reduce((s, d) => s + d.trustScore, 0) / domains.length
        : 0.5;

    summaries.push({
      botId,
      botName,
      domains,
      leastReliableDomain,
      overallTrustScore,
      contradictionRate7d,
    });
  }

  return { bots: summaries, computedAt: new Date().toISOString() };
}
