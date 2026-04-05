import {
  db,
  clientsTable,
  clientHealthScoresTable,
  clientHealthEventsTable,
  clientHealthNotesTable,
  taskSessionsTable,
  pipelineRunsTable,
  pipelinesTable,
  toolActivityLogTable,
  llmUsageLogTable,
  clientIntegrationsTable,
} from "@workspace/db";
import { eq, and, gte, sql, desc, count } from "drizzle-orm";

const SIGNAL_WEIGHTS: Record<string, number> = {
  task_session_started: 8,
  task_session_completed: 12,
  pipeline_triggered: 10,
  integration_connected: 15,
  login_recorded: 5,
  bot_interaction: 6,
  proposal_sent: 10,
  proposal_won: 15,
  roi_report_viewed: 8,
  tool_execution: 4,
};

const HEALTH_TAGS = {
  healthy: { min: 70, color: "green" },
  at_risk: { min: 40, color: "yellow" },
  critical: { min: 0, color: "red" },
} as const;

function getTag(score: number): "healthy" | "at_risk" | "critical" {
  if (score >= 70) return "healthy";
  if (score >= 40) return "at_risk";
  return "critical";
}

function getTrend(scores: { score: number; computedAt: Date }[]): "improving" | "declining" | "stable" {
  if (scores.length < 2) return "stable";
  const recent = scores.slice(0, Math.ceil(scores.length / 2));
  const older = scores.slice(Math.ceil(scores.length / 2));
  const recentAvg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
  const olderAvg = older.reduce((s, r) => s + r.score, 0) / older.length;
  const diff = recentAvg - olderAvg;
  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}

export async function recordHealthEvent(
  clientId: number,
  signal: string,
  value: number = 1,
  metadata: Record<string, unknown> = {},
) {
  await db.insert(clientHealthEventsTable).values({
    clientId,
    signal,
    value: String(value),
    metadata,
  });
}

export async function computeHealthScore(clientId: number): Promise<{
  score: number;
  tag: string;
  trend: string;
  topSignals: { signal: string; count: number; weight: number }[];
  recommendedAction: string;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const events = await db
    .select({
      signal: clientHealthEventsTable.signal,
      eventCount: sql<number>`COALESCE(SUM(value::numeric), COUNT(*))::int`,
    })
    .from(clientHealthEventsTable)
    .where(
      and(
        eq(clientHealthEventsTable.clientId, clientId),
        gte(clientHealthEventsTable.recordedAt, thirtyDaysAgo),
      ),
    )
    .groupBy(clientHealthEventsTable.signal);

  const taskSessions = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(taskSessionsTable)
    .where(
      and(
        eq(taskSessionsTable.clientId, clientId),
        gte(taskSessionsTable.createdAt, thirtyDaysAgo),
      ),
    );

  const pipelineRuns = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pipelineRunsTable)
    .innerJoin(pipelinesTable, eq(pipelineRunsTable.pipelineId, pipelinesTable.id))
    .where(
      and(
        eq(pipelinesTable.clientId, clientId),
        gte(pipelineRunsTable.createdAt, thirtyDaysAgo),
      ),
    );

  const toolCalls = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(toolActivityLogTable)
    .where(
      and(
        eq(toolActivityLogTable.clientId, clientId),
        gte(toolActivityLogTable.createdAt, thirtyDaysAgo),
      ),
    );

  const llmCalls = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(llmUsageLogTable)
    .where(
      and(
        eq(llmUsageLogTable.clientId, clientId),
        gte(llmUsageLogTable.calledAt, thirtyDaysAgo),
      ),
    );

  let integrationCount = 0;
  try {
    const integrations = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(clientIntegrationsTable)
      .where(eq(clientIntegrationsTable.clientId, clientId));
    integrationCount = integrations[0]?.count || 0;
  } catch {
    integrationCount = 0;
  }

  const signalCounts: Record<string, number> = {};
  for (const e of events) {
    signalCounts[e.signal] = e.eventCount;
  }

  signalCounts["task_session_started"] = (signalCounts["task_session_started"] || 0) + (taskSessions[0]?.count || 0);
  signalCounts["pipeline_triggered"] = (signalCounts["pipeline_triggered"] || 0) + (pipelineRuns[0]?.count || 0);
  signalCounts["tool_execution"] = (signalCounts["tool_execution"] || 0) + (toolCalls[0]?.count || 0);
  signalCounts["bot_interaction"] = (signalCounts["bot_interaction"] || 0) + (llmCalls[0]?.count || 0);
  signalCounts["integration_connected"] = (signalCounts["integration_connected"] || 0) + integrationCount;

  let rawScore = 0;
  const maxPossible = Object.values(SIGNAL_WEIGHTS).reduce((s, w) => s + w * 5, 0);

  const topSignals: { signal: string; count: number; weight: number }[] = [];

  for (const [signal, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    const count = signalCounts[signal] || 0;
    const normalizedCount = Math.min(count, 10);
    const contribution = (normalizedCount / 10) * weight * 5;
    rawScore += contribution;
    if (count > 0) {
      topSignals.push({ signal, count, weight: Math.round(contribution) });
    }
  }

  topSignals.sort((a, b) => b.weight - a.weight);

  const score = Math.min(100, Math.round((rawScore / maxPossible) * 100));

  const historicalScores = await db
    .select({
      score: clientHealthScoresTable.score,
      computedAt: clientHealthScoresTable.computedAt,
    })
    .from(clientHealthScoresTable)
    .where(
      and(
        eq(clientHealthScoresTable.clientId, clientId),
        gte(clientHealthScoresTable.computedAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(clientHealthScoresTable.computedAt))
    .limit(30);

  const scoresWithCurrent = [{ score, computedAt: new Date() }, ...historicalScores];
  const trend = getTrend(scoresWithCurrent);
  const tag = getTag(score);

  let recommendedAction = "";
  if (tag === "critical") {
    if (!signalCounts["task_session_started"]) {
      recommendedAction = "Schedule an onboarding session — this client has no recent task sessions.";
    } else if (!signalCounts["pipeline_triggered"]) {
      recommendedAction = "Set up automated pipelines to increase this client's engagement.";
    } else {
      recommendedAction = "Immediate outreach required — engagement across all metrics is critically low.";
    }
  } else if (tag === "at_risk") {
    if (trend === "declining") {
      recommendedAction = "Engagement is declining — schedule a check-in call and review their bot utilization.";
    } else {
      recommendedAction = "Monitor closely — consider proposing new use cases to boost engagement.";
    }
  } else {
    if (trend === "declining") {
      recommendedAction = "Score is healthy but trending down — proactively share new feature opportunities.";
    } else {
      recommendedAction = "Client is healthy and engaged. Consider upselling to a higher tier.";
    }
  }

  const noteOverride = await db
    .select()
    .from(clientHealthNotesTable)
    .where(eq(clientHealthNotesTable.clientId, clientId))
    .orderBy(desc(clientHealthNotesTable.createdAt))
    .limit(1);

  const effectiveTag = noteOverride[0]?.tagOverride || tag;

  const [saved] = await db
    .insert(clientHealthScoresTable)
    .values({
      clientId,
      score,
      trend,
      tag: effectiveTag,
      topSignals: topSignals.slice(0, 5),
      recommendedAction,
    })
    .returning();

  return {
    score,
    tag: effectiveTag,
    trend,
    topSignals: topSignals.slice(0, 5),
    recommendedAction,
  };
}

export async function computeAllHealthScores() {
  const clients = await db.select({ id: clientsTable.id }).from(clientsTable);

  const previousScores = await db.execute(sql`
    SELECT DISTINCT ON (client_id)
      client_id AS "clientId",
      tag
    FROM client_health_scores
    ORDER BY client_id, computed_at DESC
  `);
  const previousTagMap = new Map<number, string>();
  for (const row of previousScores.rows as Array<{ clientId: number; tag: string }>) {
    previousTagMap.set(row.clientId, row.tag);
  }

  const results: { clientId: number; score: number; tag: string; previousTag: string | null; transition: string | null }[] = [];
  for (const client of clients) {
    try {
      const result = await computeHealthScore(client.id);
      const previousTag = previousTagMap.get(client.id) || null;
      let transition: string | null = null;
      if (previousTag && previousTag !== result.tag) {
        transition = `${previousTag} → ${result.tag}`;
      }
      results.push({ clientId: client.id, score: result.score, tag: result.tag, previousTag, transition });
    } catch (err) {
      console.error(`[health] Failed to compute score for client ${client.id}:`, err);
    }
  }
  return results;
}

export async function getClientHealthSummary(clientId: number) {
  const [latestScore] = await db
    .select()
    .from(clientHealthScoresTable)
    .where(eq(clientHealthScoresTable.clientId, clientId))
    .orderBy(desc(clientHealthScoresTable.computedAt))
    .limit(1);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const history = await db
    .select({
      score: clientHealthScoresTable.score,
      tag: clientHealthScoresTable.tag,
      computedAt: clientHealthScoresTable.computedAt,
    })
    .from(clientHealthScoresTable)
    .where(
      and(
        eq(clientHealthScoresTable.clientId, clientId),
        gte(clientHealthScoresTable.computedAt, ninetyDaysAgo),
      ),
    )
    .orderBy(clientHealthScoresTable.computedAt);

  const notes = await db
    .select()
    .from(clientHealthNotesTable)
    .where(eq(clientHealthNotesTable.clientId, clientId))
    .orderBy(desc(clientHealthNotesTable.createdAt))
    .limit(10);

  return {
    current: latestScore
      ? {
          score: latestScore.score,
          tag: latestScore.tag,
          trend: latestScore.trend,
          topSignals: latestScore.topSignals,
          recommendedAction: latestScore.recommendedAction,
          computedAt: latestScore.computedAt,
        }
      : null,
    history,
    notes,
  };
}

interface LatestScoreRow {
  clientId: number;
  score: number;
  trend: string;
  tag: string;
  topSignals: unknown;
  recommendedAction: string;
  computedAt: Date;
}

export async function getAllClientHealthScores() {
  const clients = await db.select().from(clientsTable);

  const latestScores = await db.execute(sql`
    SELECT DISTINCT ON (client_id)
      client_id AS "clientId",
      score,
      trend,
      tag,
      top_signals AS "topSignals",
      recommended_action AS "recommendedAction",
      computed_at AS "computedAt"
    FROM client_health_scores
    ORDER BY client_id, computed_at DESC
  `);

  const scoresMap = new Map<number, LatestScoreRow>();
  for (const row of latestScores.rows as LatestScoreRow[]) {
    scoresMap.set(row.clientId, row);
  }

  return clients.map((client) => {
    const healthData = scoresMap.get(client.id);
    return {
      clientId: client.id,
      companyName: client.companyName,
      status: client.status,
      plan: client.plan,
      score: healthData?.score ?? null,
      tag: healthData?.tag ?? "unknown",
      trend: healthData?.trend ?? "stable",
      recommendedAction: healthData?.recommendedAction ?? null,
      computedAt: healthData?.computedAt ?? null,
    };
  });
}

export async function getHealthAnalytics() {
  const allScores = await getAllClientHealthScores();

  const distribution = { healthy: 0, at_risk: 0, critical: 0, unknown: 0 };
  let totalScore = 0;
  let scored = 0;

  for (const c of allScores) {
    if (c.tag === "healthy") distribution.healthy++;
    else if (c.tag === "at_risk") distribution.at_risk++;
    else if (c.tag === "critical") distribution.critical++;
    else distribution.unknown++;
    if (c.score !== null) {
      totalScore += c.score;
      scored++;
    }
  }

  const avgScore = scored > 0 ? Math.round(totalScore / scored) : 0;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const trendData = await db
    .select({
      date: sql<string>`DATE(computed_at)`,
      avgScore: sql<number>`ROUND(AVG(score))::int`,
      healthyCount: sql<number>`COUNT(*) FILTER (WHERE tag = 'healthy')::int`,
      atRiskCount: sql<number>`COUNT(*) FILTER (WHERE tag = 'at_risk')::int`,
      criticalCount: sql<number>`COUNT(*) FILTER (WHERE tag = 'critical')::int`,
    })
    .from(clientHealthScoresTable)
    .where(gte(clientHealthScoresTable.computedAt, ninetyDaysAgo))
    .groupBy(sql`DATE(computed_at)`)
    .orderBy(sql`DATE(computed_at)`);

  const activityCorrelation = await db.execute(sql`
    SELECT
      s.tag,
      ROUND(AVG(s.score))::int AS "avgScore",
      COALESCE(ROUND(AVG(ts.session_count))::int, 0) AS "avgSessions",
      COALESCE(ROUND(AVG(pr.pipeline_count))::int, 0) AS "avgPipelines",
      COALESCE(ROUND(AVG(ev.event_count))::int, 0) AS "avgEvents"
    FROM (
      SELECT DISTINCT ON (client_id) client_id, score, tag
      FROM client_health_scores ORDER BY client_id, computed_at DESC
    ) s
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS session_count
      FROM task_sessions WHERE client_id = s.client_id AND created_at >= ${thirtyDaysAgo}
    ) ts ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS pipeline_count
      FROM pipeline_runs pr2 JOIN pipelines p ON pr2.pipeline_id = p.id
      WHERE p.client_id = s.client_id AND pr2.created_at >= ${thirtyDaysAgo}
    ) pr ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS event_count
      FROM client_health_events WHERE client_id = s.client_id AND recorded_at >= ${thirtyDaysAgo}
    ) ev ON true
    GROUP BY s.tag
    ORDER BY "avgScore" DESC
  `);

  return {
    distribution,
    averageScore: avgScore,
    totalClients: allScores.length,
    trendOverTime: trendData,
    activityCorrelation: activityCorrelation.rows as Array<{
      tag: string;
      avgScore: number;
      avgSessions: number;
      avgPipelines: number;
      avgEvents: number;
    }>,
    clients: allScores,
  };
}

export async function generateWeeklyPulse() {
  const allScores = await getAllClientHealthScores();
  const sorted = [...allScores].sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  const critical = sorted.filter((c) => c.tag === "critical");
  const atRisk = sorted.filter((c) => c.tag === "at_risk");
  const healthy = sorted.filter((c) => c.tag === "healthy");

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: allScores.length,
      healthy: healthy.length,
      atRisk: atRisk.length,
      critical: critical.length,
    },
    critical: critical.map((c) => ({
      companyName: c.companyName,
      score: c.score,
      recommendedAction: c.recommendedAction,
    })),
    atRisk: atRisk.map((c) => ({
      companyName: c.companyName,
      score: c.score,
      recommendedAction: c.recommendedAction,
    })),
    healthy: healthy.map((c) => ({
      companyName: c.companyName,
      score: c.score,
    })),
  };
}
