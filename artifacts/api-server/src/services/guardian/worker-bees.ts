import { openai } from "@workspace/integrations-openai-ai-server";
import { db, mcpToolCallsTable, aeoScoresTable } from "@workspace/db";
import { gt, sql, desc } from "drizzle-orm";
import type { BeeType, ThreatBrief, BeeFinding } from "./bee-types";
import { callPmGetRecommendations, callPmGetScore } from "../partner/piratemonster-client";

const BEE_PROMPTS: Record<BeeType, string> = {
  debug: `You are the Debug Bee — an expert in stack trace analysis, codebase root-cause identification, and fix proposals.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Be concise and actionable. Focus on the exact code path, error type, and defensive fix.`,

  security: `You are the Security Bee — an expert in threat actor pattern analysis, attack vector identification, and mitigation.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Identify the attack vector, blast radius, and concrete mitigation steps (rate limits, WAF rules, token rotation, etc).`,

  ai_safety: `You are the AI Safety Bee — an expert in LLM cost trajectories, loop/stall analysis, and circuit breaker recommendations.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Evaluate token burn rates, model fallback chains, loop detection gaps, and context window abuse patterns.`,

  client_health: `You are the Client Health Bee — an expert in at-risk client triage, declining trend root cause, and proactive intervention.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Identify the specific client trajectory, SLA breach risk, and the earliest intervention that would reverse the decline.`,

  performance: `You are the Performance Bee — an expert in slow request diagnosis, pipeline failure analysis, and query/middleware optimisation.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Pinpoint the slow path, bottleneck query, or blocking middleware, and propose a concrete fix with expected latency improvement.`,

  data_integrity: `You are the Data Integrity Bee — an expert in orphan detection, schema drift analysis, and consistency repair.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Identify the corrupted or orphaned records, the drift vector, and the safest repair migration or cleanup procedure.`,

  compliance: `You are the Compliance Bee — an expert in audit gap mapping, GDPR risk scoring, KiloPro certification mapping, and remediation checklists.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Map the compliance gap to the relevant framework (SOC 2 / GDPR / HIPAA), score the risk, and produce a prioritised remediation checklist.`,

  dependency: `You are the Dependency Bee — an expert in npm audit parsing, CVE severity mapping, and upgrade path recommendation.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Map the CVE to the affected package, assess exploitability in our stack, and provide the exact upgrade command and any breaking-change warnings.`,

  prediction: `You are the Prediction Bee — an expert in cross-incident pattern recognition and failure forecasting.
Analyse the threat brief and return a JSON object with: finding (string), rootCause (string), proposedFix (string), confidenceScore (0–1).
Identify the historical pattern this incident matches, estimate the probability of escalation, and forecast the likely failure window (24–72h).`,
};

async function fetchPmEnrichmentContext(beeType: BeeType): Promise<string> {
  if (beeType !== "prediction" && beeType !== "compliance") return "";

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [mcpStats, recentAeoScores] = await Promise.all([
      db
        .select({
          toolName: mcpToolCallsTable.toolName,
          callCount: sql<number>`count(*)`,
          avgLatencyMs: sql<number>`round(avg(latency_ms))`,
          errorCount: sql<number>`count(*) filter (where response_status != 'success')`,
        })
        .from(mcpToolCallsTable)
        .where(gt(mcpToolCallsTable.calledAt, oneDayAgo))
        .groupBy(mcpToolCallsTable.toolName)
        .orderBy(desc(sql`count(*)`))
        .limit(10),

      db
        .select({
          avgScore: sql<number>`round(avg(overall_score))`,
          minScore: sql<number>`min(overall_score)`,
          maxScore: sql<number>`max(overall_score)`,
          scanCount: sql<number>`count(*)`,
        })
        .from(aeoScoresTable)
        .where(gt(aeoScoresTable.scannedAt, sevenDaysAgo)),
    ]);

    const mcpLines = mcpStats.length === 0
      ? "  No MCP tool calls in the past 24h."
      : mcpStats.map(
          (m) =>
            `  - pm_${m.toolName}: ${m.callCount} calls, avg ${m.avgLatencyMs}ms, ${m.errorCount} errors`,
        ).join("\n");

    const aeo = recentAeoScores[0];
    const aeoLine =
      aeo && Number(aeo.scanCount) > 0
        ? `AEO score trend (last 7 days, ${aeo.scanCount} scans): avg=${aeo.avgScore} min=${aeo.minScore} max=${aeo.maxScore}`
        : "No AEO score data available for the past 7 days.";

    const [pmRecs, pmScore] = await Promise.all([
      callPmGetRecommendations("https://galaxybots.ai"),
      callPmGetScore("https://galaxybots.ai"),
    ]);

    const pmRecsLine = pmRecs && pmRecs.length > 0
      ? `pm_get_recommendations result: ${pmRecs.slice(0, 5).join(" | ")}`
      : "pm_get_recommendations: no data (credentials not configured or unavailable)";

    const pmScoreLine = pmScore !== null
      ? `pm_get_score result: ${pmScore}/100`
      : "pm_get_score: no data (credentials not configured or unavailable)";

    return `\n\nPirateMonster MCP Enrichment Context:\nMCP Tool Usage (last 24h):\n${mcpLines}\n${aeoLine}\n${pmRecsLine}\n${pmScoreLine}`;
  } catch {
    return "";
  }
}

export async function dispatchBee(beeType: BeeType, brief: ThreatBrief): Promise<BeeFinding> {
  const systemPrompt = BEE_PROMPTS[beeType];
  const mcpContext = brief.mcpContext ?? (await fetchPmEnrichmentContext(beeType));
  const userContent = `Threat Brief:
Domain: ${brief.domain}
Title: ${brief.title}
Description: ${brief.description}
Severity: ${brief.severity}/100
Affected Component: ${brief.affectedComponent ?? "unknown"}
Source Payload: ${JSON.stringify(brief.sourcePayload ?? {}).slice(0, 2000)}${mcpContext}

Return ONLY a valid JSON object with keys: finding, rootCause, proposedFix, confidenceScore`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<BeeFinding>;
    return {
      beeType,
      finding: parsed.finding ?? "No finding produced",
      rootCause: parsed.rootCause ?? "Unknown",
      proposedFix: parsed.proposedFix ?? "No fix proposed",
      confidenceScore: Math.min(1, Math.max(0, parsed.confidenceScore ?? 0.5)),
    };
  } catch (err) {
    console.error(`[Bee:${beeType}] dispatch failed:`, err);
    return {
      beeType,
      finding: `Bee dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      rootCause: "Bee invocation error",
      proposedFix: "Retry bee dispatch or investigate manually",
      confidenceScore: 0,
    };
  }
}

export async function dispatchSwarm(beeTypes: BeeType[], brief: ThreatBrief): Promise<BeeFinding[]> {
  const results = await Promise.allSettled(beeTypes.map((b) => dispatchBee(b, brief)));
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          beeType: beeTypes[i],
          finding: `Bee failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
          rootCause: "Swarm dispatch failure",
          proposedFix: "Retry or escalate manually",
          confidenceScore: 0,
        }
  );
}
