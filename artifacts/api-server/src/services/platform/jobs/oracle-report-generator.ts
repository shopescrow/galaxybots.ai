/**
 * Oracle Report Generator — weekly job.
 *
 * Dedicated background bot with read-only access to all analytics tables.
 * Produces a structured Platform Intelligence Report:
 *   - Systemic patterns, failure modes, improvement opportunities
 *   - Experiment outcomes, alignment effectiveness, consequence model accuracy
 *   - Composite platform intelligence score
 *
 * Delivered via platform notification and stored in oracle_reports.
 */

import nodemailer from "nodemailer";
import {
  db,
  oracleReportsTable,
  experimentsTable,
  sessionOutcomesTable,
  botVariantAssignmentsTable,
  roleGapSignalsTable,
  platformAnomaliesTable,
  alignmentSignalsTable,
  calibrationCheckpointsTable,
  promptVersionsTable,
  notificationsTable,
  usersTable,
  consequenceRiskScoresTable,
} from "@workspace/db";
import { eq, and, gte, sql, desc, avg } from "drizzle-orm";
import { callWithFallback } from "../../ai-safety/model-fallback.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
let lastOracleRun = 0;

async function computeDimensionScores() {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [loopStats] = await db
    .select({ avgIterations: sql<number>`AVG(${sessionOutcomesTable.loopIterations})` })
    .from(sessionOutcomesTable)
    .where(gte(sessionOutcomesTable.createdAt, since30d));

  const avgLoopIterations = loopStats?.avgIterations ?? 5;
  const maxReasonableIterations = 10;
  const reasoningDepth = Math.min(
    1,
    Math.max(0, 1 - (avgLoopIterations - 1) / (maxReasonableIterations - 1)),
  );

  const [beliefStats] = await db
    .select({ avgConfidence: sql<number>`AVG(${calibrationCheckpointsTable.predictedAvg})` })
    .from(calibrationCheckpointsTable)
    .where(gte(calibrationCheckpointsTable.createdAt, since30d));

  const memoryCoherence = Math.min(1, Math.max(0, beliefStats?.avgConfidence ?? 0.5));

  // goal_autonomy: % of bot_assignments initiated autonomously (generated_by != 'human')
  let goalAutonomy = 0.5;
  try {
    const gaRows = await db.execute<{ autonomous: string; total: string }>(
      sql`SELECT
        COUNT(*) FILTER (WHERE generated_by IS DISTINCT FROM 'human') AS autonomous,
        COUNT(*) AS total
      FROM bot_assignments
      WHERE created_at >= ${since30d}`,
    );
    const gaRow = gaRows.rows?.[0] ?? gaRows[0];
    const autonomous = Number(gaRow?.autonomous ?? 0);
    const total = Number(gaRow?.total ?? 0);
    if (total > 0) goalAutonomy = Math.min(1, autonomous / total);
  } catch {
    goalAutonomy = 0.5;
  }

  const [promptStats] = await db
    .select({
      avgDelta: sql<number>`AVG(${promptVersionsTable.outcomeScoreAfter} - ${promptVersionsTable.outcomeScoreBefore})`,
    })
    .from(promptVersionsTable)
    .where(
      and(
        gte(promptVersionsTable.createdAt, since30d),
        eq(promptVersionsTable.status, "active"),
      ),
    );

  const rawDelta = promptStats?.avgDelta ?? 0;
  const selfImprovementRate = Math.min(1, Math.max(0, 0.5 + rawDelta * 5));

  const [totalSigRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(alignmentSignalsTable)
    .where(gte(alignmentSignalsTable.createdAt, since30d));

  const [appliedSigRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(alignmentSignalsTable)
    .where(
      and(
        gte(alignmentSignalsTable.createdAt, since30d),
        eq(alignmentSignalsTable.softRuleStatus, "applied"),
      ),
    );

  const totalSig = totalSigRow?.count ?? 0;
  const appliedSig = appliedSigRow?.count ?? 0;
  const alignmentFidelity = totalSig > 0 ? Math.min(1, appliedSig / totalSig) : 0.5;

  const scores = [reasoningDepth, memoryCoherence, goalAutonomy, selfImprovementRate, alignmentFidelity];
  const geometricMean = Math.pow(
    scores.reduce((a, b) => a * Math.max(0.001, b), 1),
    1 / scores.length,
  );

  return {
    dimensionScores: {
      reasoningDepth: parseFloat(reasoningDepth.toFixed(3)),
      memoryCoherence: parseFloat(memoryCoherence.toFixed(3)),
      goalAutonomy: parseFloat(goalAutonomy.toFixed(3)),
      selfImprovementRate: parseFloat(selfImprovementRate.toFixed(3)),
      alignmentFidelity: parseFloat(alignmentFidelity.toFixed(3)),
    },
    intelligenceScore: parseFloat((geometricMean * 100).toFixed(1)),
  };
}

export async function runOracleReportGenerator() {
  const now = Date.now();
  if (now - lastOracleRun < SEVEN_DAYS_MS) return;
  lastOracleRun = now;

  console.log("[oracle] Running weekly Oracle report generation...");

  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    const { dimensionScores, intelligenceScore } = await computeDimensionScores();

    const completedExperiments = await db
      .select({
        id: experimentsTable.id,
        result: experimentsTable.result,
        winner: experimentsTable.winner,
        hypothesis: experimentsTable.hypothesis,
      })
      .from(experimentsTable)
      .where(
        and(eq(experimentsTable.status, "completed"), gte(experimentsTable.endedAt, since)),
      )
      .limit(10);

    const championDeclarations = await db
      .select()
      .from(botVariantAssignmentsTable)
      .where(eq(botVariantAssignmentsTable.status, "champion_declared"))
      .orderBy(desc(botVariantAssignmentsTable.championDeclaredAt))
      .limit(5);

    const pendingGaps = await db
      .select()
      .from(roleGapSignalsTable)
      .where(eq(roleGapSignalsTable.status, "pending"))
      .orderBy(desc(roleGapSignalsTable.evidenceSessions))
      .limit(5);

    const quarantinedAnomalies = await db
      .select()
      .from(platformAnomaliesTable)
      .where(eq(platformAnomaliesTable.quarantineStatus, "quarantined"))
      .orderBy(desc(platformAnomaliesTable.createdAt))
      .limit(10);

    const [recentSessionStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        failed: sql<number>`COUNT(*) FILTER (WHERE ${sessionOutcomesTable.failureCategory} IS NOT NULL)`,
      })
      .from(sessionOutcomesTable)
      .where(gte(sessionOutcomesTable.createdAt, since));

    const sessionTotal = recentSessionStats?.total ?? 0;
    const sessionFailed = recentSessionStats?.failed ?? 0;
    const successRate = sessionTotal > 0 ? (sessionTotal - sessionFailed) / sessionTotal : 1;

    const [totalSigRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alignmentSignalsTable)
      .where(gte(alignmentSignalsTable.createdAt, since30d));

    const [appliedSigRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alignmentSignalsTable)
      .where(
        and(
          gte(alignmentSignalsTable.createdAt, since30d),
          eq(alignmentSignalsTable.softRuleStatus, "applied"),
        ),
      );

    const totalSig = totalSigRow?.count ?? 0;
    const appliedSig = appliedSigRow?.count ?? 0;
    const alignmentRuleEffectiveness = totalSig > 0 ? appliedSig / totalSig : 0;

    const findings = [];

    if (successRate < 0.7 && sessionTotal > 10) {
      findings.push({
        category: "performance",
        title: "Below-Target Session Success Rate",
        description: `Session success rate is ${(successRate * 100).toFixed(1)}% across ${sessionTotal} sessions this week. Target is ≥ 70%.`,
        severity: "warning" as const,
        evidence: `${sessionTotal} sessions, ${sessionFailed} failures`,
      });
    }

    if (quarantinedAnomalies.length > 0) {
      findings.push({
        category: "anomaly",
        title: `${quarantinedAnomalies.length} Platform Anomalies Quarantined`,
        description: `Suspicious causal patterns have been quarantined and excluded from per-client prior injection. Human review required.`,
        severity: "critical" as const,
        evidence: quarantinedAnomalies.map((a) => a.description).join("; "),
      });
    }

    if (pendingGaps.length > 0) {
      findings.push({
        category: "gap",
        title: `${pendingGaps.length} Role Gaps Identified`,
        description: `Novel role proposals are awaiting owner review. Top gap: "${pendingGaps[0]?.gapDescription ?? "unknown"}" with ${pendingGaps[0]?.evidenceSessions ?? 0} sessions.`,
        severity: "info" as const,
      });
    }

    if (championDeclarations.length > 0) {
      findings.push({
        category: "specialization",
        title: `${championDeclarations.length} Bot Champions Declared`,
        description: `Bot role variants completed their competition. Champions: ${championDeclarations.map((c) => `${c.botRole} (variant ${c.championVariant})`).join(", ")}.`,
        severity: "info" as const,
      });
    }

    const recommendations = [];

    if (pendingGaps.length > 0 && pendingGaps[0]) {
      recommendations.push({
        id: `gap-${pendingGaps[0].id}`,
        title: `Review role proposal: "${pendingGaps[0].proposedRoleName ?? "Unnamed"}"`,
        description: `${pendingGaps[0].evidenceSessions} sessions with ${(pendingGaps[0].avgSuccessRate * 100).toFixed(0)}% success rate need specialized coverage.`,
        priority: "high" as const,
        estimatedImpact: "Potential 20–40% improvement in unmet-need session success rates",
        actionType: "review_role_proposal",
      });
    }

    if (alignmentRuleEffectiveness < 0.5 && totalSig > 5) {
      recommendations.push({
        id: "alignment-low",
        title: "Review alignment rule application",
        description: `Only ${(alignmentRuleEffectiveness * 100).toFixed(0)}% of alignment signals resulted in applied soft rules. Consider reviewing the extraction pipeline.`,
        priority: "medium" as const,
        estimatedImpact: "Improved multi-stakeholder satisfaction",
        actionType: "review_alignment_pipeline",
      });
    }

    // ── Consequence model accuracy ─────────────────────────────────────────────
    // Average confidence score from risk entries with ≥ 5 evidence records.
    // This reflects how certain the model is in its predictions (a calibration proxy).
    let consequenceModelAccuracy: number | null = null;
    try {
      const [cmRow] = await db
        .select({
          avgConf: avg(consequenceRiskScoresTable.confidenceScore),
          entries: sql<number>`COUNT(*)`,
        })
        .from(consequenceRiskScoresTable)
        .where(sql`${consequenceRiskScoresTable.evidenceCount} >= 5`);

      const entries = Number(cmRow?.entries ?? 0);
      if (entries > 0 && cmRow?.avgConf != null) {
        consequenceModelAccuracy = parseFloat(Number(cmRow.avgConf).toFixed(3));
      }
    } catch {
      consequenceModelAccuracy = null;
    }

    // ── Oracle LLM reasoning pass ───────────────────────────────────────────────
    // Ask the AI to act as the Oracle meta-reasoning layer and synthesize additional
    // platform-level findings and recommendations from the structured weekly data.
    // Fails gracefully — SQL-derived findings are always persisted regardless.
    const structuredSummaryForOracle = {
      weeklySessionTotal: sessionTotal,
      weeklySessionFailed: sessionFailed,
      weeklySuccessRate: successRate,
      alignmentRuleEffectiveness,
      consequenceModelAccuracy,
      intelligenceScore,
      dimensionScores,
      quarantinedAnomaliesCount: quarantinedAnomalies.length,
      pendingRoleGapsCount: pendingGaps.length,
      completedExperimentsCount: completedExperiments.length,
      championDeclaredCount: championDeclarations.length,
      existingFindings: findings.map((f) => f.title),
    };

    try {
      const oracleResponse = await callWithFallback({
        // Oracle meta-reasoning uses the highest-capability model available via the
        // platform proxy. GLM 5.2 Ultra is not available in the proxy's fallback chains;
        // gpt-4o is used as the equivalent critical-reasoning model.
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are the Oracle, a meta-reasoning AI that analyzes a multi-agent platform's weekly performance data and produces structured platform intelligence findings. Be concise and data-driven.",
          },
          {
            role: "user",
            content: `Weekly platform intelligence data:\n${JSON.stringify(structuredSummaryForOracle, null, 2)}\n\nBased on this data, identify 0-3 additional platform-level findings or recommendations NOT already covered by the existing findings. Focus on cross-cutting patterns, systemic risks, or improvement opportunities. Return a JSON object: {"findings": [...], "recommendations": [...]} where each finding has {category, title, description, severity: "info"|"warning"|"critical"} and each recommendation has {id, title, description, priority: "low"|"medium"|"high", estimatedImpact, actionType}.`,
          },
        ],
        maxCompletionTokens: 800,
      });

      const rawText = oracleResponse.content ?? "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          findings?: Array<{ category: string; title: string; description: string; severity: "info" | "warning" | "critical" }>;
          recommendations?: Array<{ id: string; title: string; description: string; priority: "low" | "medium" | "high"; estimatedImpact: string; actionType: string }>;
        };
        if (Array.isArray(parsed.findings)) findings.push(...parsed.findings);
        if (Array.isArray(parsed.recommendations)) recommendations.push(...parsed.recommendations);
      }
    } catch (oracleErr) {
      console.warn("[oracle] LLM reasoning pass failed (non-fatal):", oracleErr);
    }

    const reportJson = {
      findings,
      recommendations,
      anomalies: quarantinedAnomalies.map((a) => ({
        patternId: a.patternId,
        description: a.description,
        clientsAffected: a.clientsAffected,
        quarantineStatus: a.quarantineStatus,
      })),
      topPerformingBotConfigs: championDeclarations.map((c) => ({
        botRole: c.botRole,
        variant: c.championVariant ?? "A",
        outcomeScore: c.meanOutcomeA ?? 0,
      })),
      underperformingRoles: pendingGaps.map((g) => ({
        botRole: g.proposedRoleName ?? g.clusterId ?? "unknown",
        avgSuccessRate: g.avgSuccessRate,
        sessionCount: g.evidenceSessions,
      })),
      experimentOutcomes: completedExperiments.map((e) => ({
        experimentId: e.id,
        result: e.result ?? "inconclusive",
        winner: e.winner,
      })),
      alignmentRuleEffectiveness,
      consequenceModelAccuracy,
    };

    const reportHtml = generateReportHtml({
      intelligenceScore,
      dimensionScores,
      reportJson,
      reportDate: new Date(),
    });

    const [oracleReport] = await db
      .insert(oracleReportsTable)
      .values({
        reportDate: new Date(),
        reportJson,
        reportHtml,
        intelligenceScore,
        dimensionScores,
        modelVersion: "1.0",
      })
      .returning({ id: oracleReportsTable.id });

    const owners = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "owner"))
      .limit(10);

    for (const owner of owners) {
      try {
        await db.insert(notificationsTable).values({
          userId: owner.id,
          category: "system",
          severity: "info",
          title: "Weekly Platform Intelligence Report",
          body: `Oracle Score: ${intelligenceScore.toFixed(1)}/100 — ${findings.length} finding(s), ${recommendations.length} recommendation(s). View in Platform Intelligence.`,
          link: "/platform-intelligence",
          metadata: { oracleReportId: oracleReport?.id, intelligenceScore },
        });
      } catch {
        // Skip notification errors
      }
    }

    if (oracleReport) {
      await db
        .update(oracleReportsTable)
        .set({ deliveredPlatform: new Date() })
        .where(eq(oracleReportsTable.id, oracleReport.id));
    }

    // ── Email delivery ──────────────────────────────────────────────────────
    // Send the HTML report to all owner email addresses if SMTP is configured.
    // Fails silently so a missing SMTP config never blocks report generation.
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (smtpHost && smtpUser && smtpPass && oracleReport) {
      try {
        const ownerEmails = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.role, "owner"))
          .limit(10);

        const recipients = ownerEmails.map((u) => u.email).filter(Boolean);

        if (recipients.length > 0) {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });

          await transporter.sendMail({
            from: smtpFrom,
            to: recipients.join(", "),
            subject: `GalaxyBots Platform Intelligence Report — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
            html: reportHtml,
          });

          await db
            .update(oracleReportsTable)
            .set({ deliveredEmail: new Date() })
            .where(eq(oracleReportsTable.id, oracleReport.id));

          console.log(`[oracle] Report emailed to ${recipients.length} owner(s).`);
        }
      } catch (emailErr) {
        console.warn("[oracle] Email delivery failed (non-fatal):", emailErr);
      }
    } else {
      console.log("[oracle] SMTP not configured — skipping email delivery.");
    }

    console.log(
      `[oracle] Report generated: score=${intelligenceScore.toFixed(1)}, findings=${findings.length}, recommendations=${recommendations.length}`,
    );
  } catch (err) {
    console.error("[oracle] Error generating report:", err);
  }
}

function generateReportHtml(opts: {
  intelligenceScore: number;
  dimensionScores: {
    reasoningDepth: number;
    memoryCoherence: number;
    goalAutonomy: number;
    selfImprovementRate: number;
    alignmentFidelity: number;
  };
  reportJson: {
    findings: Array<{ category: string; title: string; description: string; severity: string }>;
    recommendations: Array<{ title: string; description: string; priority: string }>;
    anomalies: Array<{ description: string; clientsAffected: number }>;
  };
  reportDate: Date;
}): string {
  const { intelligenceScore, dimensionScores, reportJson, reportDate } = opts;

  const findingsHtml = reportJson.findings
    .map(
      (f) =>
        `<div style="padding:8px;margin:4px 0;border-left:3px solid ${f.severity === "critical" ? "#ef4444" : f.severity === "warning" ? "#f59e0b" : "#3b82f6"}"><strong>${f.title}</strong><p style="margin:4px 0">${f.description}</p></div>`,
    )
    .join("");

  const recommendationsHtml = reportJson.recommendations
    .map(
      (r) =>
        `<div style="padding:8px;margin:4px 0;background:#f8fafc;border-radius:4px"><strong>${r.title}</strong><p style="margin:4px 0">${r.description}</p><span style="font-size:11px;color:#6b7280">Priority: ${r.priority}</span></div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><title>Platform Intelligence Report — ${reportDate.toDateString()}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:800px;margin:auto;padding:20px;color:#111827">
  <h1 style="color:#4f46e5">Platform Intelligence Report</h1>
  <p style="color:#6b7280"><em>${reportDate.toDateString()}</em></p>
  <div style="background:#4f46e5;color:white;padding:16px;border-radius:8px;margin:16px 0">
    <h2 style="margin:0">Intelligence Score: ${intelligenceScore.toFixed(1)} / 100</h2>
  </div>
  <table border="1" cellpadding="8" style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead><tr style="background:#f3f4f6"><th>Dimension</th><th>Score</th><th>Progress</th></tr></thead>
    <tbody>
      <tr><td>Reasoning Depth</td><td>${(dimensionScores.reasoningDepth * 100).toFixed(0)}%</td><td><progress value="${dimensionScores.reasoningDepth}" max="1" style="width:100%"></progress></td></tr>
      <tr><td>Memory Coherence</td><td>${(dimensionScores.memoryCoherence * 100).toFixed(0)}%</td><td><progress value="${dimensionScores.memoryCoherence}" max="1" style="width:100%"></progress></td></tr>
      <tr><td>Goal Autonomy</td><td>${(dimensionScores.goalAutonomy * 100).toFixed(0)}%</td><td><progress value="${dimensionScores.goalAutonomy}" max="1" style="width:100%"></progress></td></tr>
      <tr><td>Self-Improvement Rate</td><td>${(dimensionScores.selfImprovementRate * 100).toFixed(0)}%</td><td><progress value="${dimensionScores.selfImprovementRate}" max="1" style="width:100%"></progress></td></tr>
      <tr><td>Alignment Fidelity</td><td>${(dimensionScores.alignmentFidelity * 100).toFixed(0)}%</td><td><progress value="${dimensionScores.alignmentFidelity}" max="1" style="width:100%"></progress></td></tr>
    </tbody>
  </table>
  <h2>Findings (${reportJson.findings.length})</h2>
  ${findingsHtml || "<p>No findings this week.</p>"}
  <h2>Recommendations (${reportJson.recommendations.length})</h2>
  ${recommendationsHtml || "<p>No recommendations this week.</p>"}
  <h2>Anomalies (${reportJson.anomalies.length})</h2>
  ${reportJson.anomalies.length > 0
    ? reportJson.anomalies.map((a) => `<p>&#9888; ${a.description} (${a.clientsAffected} clients affected)</p>`).join("")
    : "<p>No anomalies detected.</p>"}
</body>
</html>`;
}
