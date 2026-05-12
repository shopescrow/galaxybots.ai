import { db, llmUsageLogTable, mcpToolCallsTable, guardianIncidentsTable, guardianPostmortemsTable } from "@workspace/db";
import { gt, sql, and, eq, isNull, lt } from "drizzle-orm";

async function ingestGuardianThreat(
  domain: string,
  title: string,
  description: string,
  severity: number,
  affectedComponent: string,
  sourcePayload: Record<string, unknown>,
): Promise<void> {
  const { classifyThreat, computeErrorFingerprint } = await import("../../guardian/threat-classifier");
  const { severity: classified, blastRadius } = classifyThreat(domain, title, description, severity);
  const errorFingerprint = computeErrorFingerprint(domain, title, affectedComponent);

  const existing = await db
    .select({ id: guardianIncidentsTable.id })
    .from(guardianIncidentsTable)
    .where(
      and(
        eq(guardianIncidentsTable.errorFingerprint, errorFingerprint),
        eq(guardianIncidentsTable.status, "open"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(guardianIncidentsTable).values({
    domain,
    title,
    description,
    severity: classified,
    blastRadius,
    status: "open",
    affectedComponent,
    errorFingerprint,
    sourcePayload,
  });
}

async function checkCostCap(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ totalCost: sql<number>`coalesce(sum(estimated_cost_usd::numeric), 0)` })
    .from(llmUsageLogTable)
    .where(gt(llmUsageLogTable.calledAt, oneHourAgo));

  const totalCost = Number(row?.totalCost ?? 0);
  if (totalCost < 5) return;

  await ingestGuardianThreat(
    "ai_safety",
    "LLM Cost Cap Breached — Hourly Spend Exceeded $5",
    `Guardian detected $${totalCost.toFixed(2)} in LLM spend over the past hour, breaching the $5 cost cap threshold. ` +
      `Immediate review of model usage, token consumption rates, and circuit breaker configuration is required.`,
    totalCost >= 20 ? 85 : totalCost >= 10 ? 70 : 55,
    "llm_cost_monitor",
    { totalCostUsd: totalCost, windowHours: 1, threshold: 5 },
  );
}

async function checkSlowMcpRequests(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({
      slowCount: sql<number>`count(*) filter (where latency_ms > 5000)`,
      avgLatency: sql<number>`coalesce(avg(latency_ms), 0)`,
      totalCalls: sql<number>`count(*)`,
    })
    .from(mcpToolCallsTable)
    .where(gt(mcpToolCallsTable.calledAt, oneHourAgo));

  const slowCount = Number(row?.slowCount ?? 0);
  const avgLatency = Number(row?.avgLatency ?? 0);
  const totalCalls = Number(row?.totalCalls ?? 0);

  if (slowCount < 3 || totalCalls === 0) return;

  const slowPct = Math.round((slowCount / totalCalls) * 100);
  if (slowPct < 20) return;

  await ingestGuardianThreat(
    "performance",
    `Slow MCP Request Pattern — ${slowPct}% of Calls Exceeding 5s`,
    `Guardian detected ${slowCount} MCP tool calls exceeding 5 seconds latency in the past hour ` +
      `(${slowPct}% of ${totalCalls} total calls, avg latency ${Math.round(avgLatency)}ms). ` +
      `Possible causes: partner API degradation, network congestion, or missing cache headers.`,
    slowPct >= 50 ? 75 : 55,
    "mcp_latency_monitor",
    { slowCount, totalCalls, slowPct, avgLatencyMs: Math.round(avgLatency) },
  );
}

async function checkCircuitBreaker(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await db
    .select({
      domain: guardianIncidentsTable.domain,
      count: sql<number>`count(*)`,
    })
    .from(guardianIncidentsTable)
    .where(and(gt(guardianIncidentsTable.createdAt, oneHourAgo), eq(guardianIncidentsTable.status, "open")))
    .groupBy(guardianIncidentsTable.domain);

  for (const row of rows) {
    const count = Number(row.count);
    if (count < 5) continue;

    await ingestGuardianThreat(
      "ai_safety",
      `Circuit Breaker Threshold — ${count} Open Incidents in Domain "${row.domain}"`,
      `Guardian detected ${count} unresolved incidents in the "${row.domain}" domain within the past hour. ` +
        `This volume indicates a cascading failure pattern. Circuit breaker protocol recommends pausing automated ` +
        `processing for this domain and routing to manual review until the failure source is isolated.`,
      count >= 10 ? 90 : count >= 7 ? 75 : 60,
      `circuit_breaker:${row.domain}`,
      { domain: row.domain, openIncidentCount: count, windowHours: 1 },
    );
  }
}

async function checkSlaOutput(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const [state] = await db
    .select({ lastCycleAt: sql<Date | null>`max(updated_at)` })
    .from(guardianIncidentsTable)
    .where(eq(guardianIncidentsTable.status, "resolved"));

  if (!state?.lastCycleAt) return;

  const lastResolved = new Date(state.lastCycleAt);
  if (lastResolved > twoHoursAgo) return;

  const [pending] = await db
    .select({ count: sql<number>`count(*)` })
    .from(guardianIncidentsTable)
    .where(and(eq(guardianIncidentsTable.status, "open"), lt(guardianIncidentsTable.createdAt, twoHoursAgo)));

  const openOldCount = Number(pending?.count ?? 0);
  if (openOldCount === 0) return;

  await ingestGuardianThreat(
    "compliance",
    `Guardian SLA Output Breach — ${openOldCount} Incidents Unresolved for 2+ Hours`,
    `Guardian Queen has ${openOldCount} incidents that have been open for more than 2 hours without resolution. ` +
      `The swarm loop may be stalled, paused, or overwhelmed. SLA target is resolution within 60 minutes for ` +
      `high-severity incidents. Recommend checking queen mode, worker bee availability, and OpenAI API health.`,
    openOldCount >= 5 ? 80 : 60,
    "guardian_sla_output",
    { openOldCount, stallThresholdHours: 2 },
  );
}

async function checkAuditGap(): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const rows = await db
    .select({ id: guardianIncidentsTable.id, severity: guardianIncidentsTable.severity, domain: guardianIncidentsTable.domain })
    .from(guardianIncidentsTable)
    .where(
      and(
        eq(guardianIncidentsTable.status, "resolved"),
        gt(guardianIncidentsTable.severity, 69),
        lt(guardianIncidentsTable.resolvedAt!, twoHoursAgo),
      ),
    )
    .limit(20);

  if (rows.length === 0) return;

  const incidentIds = rows.map((r) => r.id);

  const postmortemCoverage = await db
    .select({ incidentId: guardianPostmortemsTable.incidentId })
    .from(guardianPostmortemsTable)
    .where(sql`incident_id = ANY(${incidentIds})`);

  const coveredIds = new Set(postmortemCoverage.map((p) => p.incidentId));
  const gaps = rows.filter((r) => !coveredIds.has(r.id));

  if (gaps.length === 0) return;

  await ingestGuardianThreat(
    "compliance",
    `Audit Gap Detected — ${gaps.length} High-Severity Incidents Missing Post-Mortem`,
    `Guardian found ${gaps.length} resolved high-severity incidents (severity ≥ 70) that are missing required ` +
      `post-mortem documentation. Incident IDs: ${gaps.map((g) => `#${g.id}`).join(", ")}. ` +
      `Post-mortems are required for all incidents with severity ≥ 70 within 2 hours of resolution ` +
      `to maintain audit compliance.`,
    gaps.length >= 5 ? 75 : 60,
    "audit_gap_monitor",
    { gapCount: gaps.length, incidentIds: gaps.map((g) => g.id) },
  );
}

export async function runGuardianInternalWatchers(): Promise<void> {
  try {
    await Promise.allSettled([
      checkCostCap(),
      checkSlowMcpRequests(),
      checkCircuitBreaker(),
      checkSlaOutput(),
      checkAuditGap(),
    ]);
  } catch (err) {
    console.error("[GuardianInternalWatchers] Error:", err);
  }
}
