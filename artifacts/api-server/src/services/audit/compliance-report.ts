import { db, galaxyAuditLedgerTable, conductorStrategiesTable, llmUsageLogTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, avg, sum, lt, isNotNull } from "drizzle-orm";

export interface ConfidenceHistogramBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface StrategyDistributionEntry {
  strategy: string;
  count: number;
  percentage: number;
}

export interface SignificantDecision {
  id: string;
  sessionId: string | null;
  confidenceScore: number;
  strategy: string | null;
  createdAt: Date;
}

export interface BotRolePairing {
  botName: string;
  role: string;
  count: number;
}

export interface ComplianceReport {
  month: string;
  clientId: number | null;
  generatedAt: string;
  totalAiOrchestratedSessions: number;
  confidenceDistribution: ConfidenceHistogramBucket[];
  humanOverrideCount: number;
  humanOverrideRate: number;
  strategyDistribution: StrategyDistributionEntry[];
  totalLlmCostUsd: number;
  llmCostByModelTier: Array<{ tier: string; costUsd: number }>;
  significantDecisions: SignificantDecision[];
  topBotRolePairings: BotRolePairing[];
  euAiActArticle13Note: string;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10) - 1;
  const start = new Date(year, m, 1, 0, 0, 0, 0);
  const end = new Date(year, m + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export async function generateComplianceReport(
  month: string,
  clientId?: number | null,
): Promise<ComplianceReport> {
  const { start, end } = monthBounds(month);

  const clientFilter = clientId != null ? eq(galaxyAuditLedgerTable.clientId, clientId) : undefined;
  const timeFilter = and(
    gte(galaxyAuditLedgerTable.createdAt, start),
    lte(galaxyAuditLedgerTable.createdAt, end),
  );
  const baseWhere = clientFilter ? and(timeFilter, clientFilter) : timeFilter;

  // ── 1. Total AI-orchestrated sessions (distinct session IDs) — exact via SQL ──
  const [sessionCountRow] = await db
    .select({ cnt: sql<number>`COUNT(DISTINCT ${galaxyAuditLedgerTable.sessionId})` })
    .from(galaxyAuditLedgerTable)
    .where(and(baseWhere, isNotNull(galaxyAuditLedgerTable.sessionId)));
  const totalAiOrchestratedSessions = Number(sessionCountRow?.cnt ?? 0);

  // ── 2. Confidence distribution — bucketed via SQL CASE ───────────────────────
  const [confDistRow] = await db
    .select({
      low: sql<number>`COUNT(*) FILTER (WHERE (${galaxyAuditLedgerTable.payload}->>'score')::int BETWEEN 0 AND 29)`,
      med: sql<number>`COUNT(*) FILTER (WHERE (${galaxyAuditLedgerTable.payload}->>'score')::int BETWEEN 30 AND 59)`,
      high: sql<number>`COUNT(*) FILTER (WHERE (${galaxyAuditLedgerTable.payload}->>'score')::int BETWEEN 60 AND 79)`,
      vhigh: sql<number>`COUNT(*) FILTER (WHERE (${galaxyAuditLedgerTable.payload}->>'score')::int BETWEEN 80 AND 100)`,
    })
    .from(galaxyAuditLedgerTable)
    .where(and(baseWhere, eq(galaxyAuditLedgerTable.decisionType, "confidence_score")));

  const confTotal = Number(confDistRow?.low ?? 0) + Number(confDistRow?.med ?? 0) +
    Number(confDistRow?.high ?? 0) + Number(confDistRow?.vhigh ?? 0);

  const makeBucket = (range: string, cnt: number): ConfidenceHistogramBucket => ({
    range,
    count: Number(cnt),
    percentage: confTotal > 0 ? Math.round((Number(cnt) / confTotal) * 100) : 0,
  });

  const confidenceDistribution: ConfidenceHistogramBucket[] = [
    makeBucket("0-29", confDistRow?.low ?? 0),
    makeBucket("30-59", confDistRow?.med ?? 0),
    makeBucket("60-79", confDistRow?.high ?? 0),
    makeBucket("80-100", confDistRow?.vhigh ?? 0),
  ];

  // ── 3. Human override count — count actual human_approval_outcome events ────
  // We count entries where a human acted (approved OR rejected) rather than
  // entries where the gate merely fired.  This correctly reflects Article 13
  // human oversight interventions.
  const [humanOverrideRow] = await db
    .select({ cnt: count() })
    .from(galaxyAuditLedgerTable)
    .where(
      and(
        baseWhere,
        eq(galaxyAuditLedgerTable.decisionType, "human_approval_outcome"),
      ),
    );
  const humanOverrideCount = Number(humanOverrideRow?.cnt ?? 0);
  const humanOverrideRate = totalAiOrchestratedSessions > 0
    ? humanOverrideCount / totalAiOrchestratedSessions
    : 0;

  // ── 4. Strategy distribution — existing aggregate query, no limit ────────────
  const strategyClientFilter = clientId != null ? [eq(conductorStrategiesTable.clientId, clientId)] : [];
  const [strategyRows, llmRows, llmTierRows] = await Promise.all([
    db
      .select({
        strategy: conductorStrategiesTable.strategyChosen,
        cnt: count(),
      })
      .from(conductorStrategiesTable)
      .where(
        and(
          gte(conductorStrategiesTable.createdAt, start),
          lte(conductorStrategiesTable.createdAt, end),
          ...strategyClientFilter,
        ),
      )
      .groupBy(conductorStrategiesTable.strategyChosen),

    db
      .select({ total: sum(llmUsageLogTable.estimatedCostUsd) })
      .from(llmUsageLogTable)
      .where(
        and(
          gte(llmUsageLogTable.calledAt, start),
          lte(llmUsageLogTable.calledAt, end),
          ...(clientId != null ? [eq(llmUsageLogTable.clientId, clientId)] : []),
        ),
      ),

    db
      .select({
        tier: llmUsageLogTable.modelTier,
        costUsd: sum(llmUsageLogTable.estimatedCostUsd),
      })
      .from(llmUsageLogTable)
      .where(
        and(
          gte(llmUsageLogTable.calledAt, start),
          lte(llmUsageLogTable.calledAt, end),
          ...(clientId != null ? [eq(llmUsageLogTable.clientId, clientId)] : []),
        ),
      )
      .groupBy(llmUsageLogTable.modelTier),
  ]);

  const totalStrategy = strategyRows.reduce((s, r) => s + Number(r.cnt), 0);
  const strategyDistribution: StrategyDistributionEntry[] = strategyRows.map((r) => ({
    strategy: r.strategy,
    count: Number(r.cnt),
    percentage: totalStrategy > 0 ? Math.round((Number(r.cnt) / totalStrategy) * 100) : 0,
  }));

  const totalLlmCostUsd = Number(llmRows[0]?.total ?? 0);
  const llmCostByModelTier = llmTierRows.map((r) => ({
    tier: r.tier ?? "unknown",
    costUsd: Number(r.costUsd ?? 0),
  }));

  // ── 5. Significant decisions (confidence < 30) — paginated, no large row scan ─
  const significantDecisionRows = await db
    .select({
      id: galaxyAuditLedgerTable.id,
      sessionId: galaxyAuditLedgerTable.sessionId,
      payload: galaxyAuditLedgerTable.payload,
      createdAt: galaxyAuditLedgerTable.createdAt,
    })
    .from(galaxyAuditLedgerTable)
    .where(
      and(
        baseWhere,
        eq(galaxyAuditLedgerTable.decisionType, "confidence_score"),
        sql`(${galaxyAuditLedgerTable.payload}->>'score')::numeric < 30`,
      ),
    )
    .orderBy(galaxyAuditLedgerTable.createdAt)
    .limit(50);

  const significantDecisions: SignificantDecision[] = significantDecisionRows.map((e) => {
    const p = e.payload as { score?: number; strategy?: string };
    return {
      id: e.id,
      sessionId: e.sessionId,
      confidenceScore: p.score ?? 0,
      strategy: (p.strategy as string) ?? null,
      createdAt: e.createdAt,
    };
  });

  // ── 6. Top bot-role pairings — JSON aggregation via SQL ──────────────────────
  const pairingRows = await db
    .select({
      payload: galaxyAuditLedgerTable.payload,
    })
    .from(galaxyAuditLedgerTable)
    .where(and(baseWhere, eq(galaxyAuditLedgerTable.decisionType, "role_assignment")))
    .limit(2000);

  const pairingCounts = new Map<string, { botName: string; role: string; count: number }>();
  for (const entry of pairingRows) {
    const p = entry.payload as { roleAssignments?: Array<{ botName?: string; role?: string }> };
    if (!Array.isArray(p.roleAssignments)) continue;
    for (const ra of p.roleAssignments) {
      if (!ra.botName || !ra.role) continue;
      const key = `${ra.botName}::${ra.role}`;
      const existing = pairingCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        pairingCounts.set(key, { botName: ra.botName, role: ra.role, count: 1 });
      }
    }
  }
  const topBotRolePairings: BotRolePairing[] = [...pairingCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    month,
    clientId: clientId ?? null,
    generatedAt: new Date().toISOString(),
    totalAiOrchestratedSessions,
    confidenceDistribution,
    humanOverrideCount,
    humanOverrideRate: Math.round(humanOverrideRate * 10000) / 100,
    strategyDistribution,
    totalLlmCostUsd: Math.round(totalLlmCostUsd * 100) / 100,
    llmCostByModelTier,
    significantDecisions,
    topBotRolePairings,
    euAiActArticle13Note:
      "This report is generated in compliance with EU AI Act Article 13 (Transparency of High-Risk AI Systems). It covers AI-orchestrated decisions, confidence distributions, human oversight events, and cost efficiency for the specified period.",
  };
}
