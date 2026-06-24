import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateComplianceReport } from "../../audit/compliance-report.js";
import { createNotification } from "../../admin/notifications.js";
import nodemailer from "nodemailer";

let lastRunMonth: string | null = null;

async function sendComplianceReportEmail(params: {
  clientId: number;
  companyName: string | null;
  month: string;
  sessions: number;
  humanOverrideRate: number;
  totalLlmCostUsd: number;
  topBotRolePairings: Array<{ botName: string; role: string; count: number }>;
}): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn(`[MonthlyComplianceReport] SMTP not configured — skipping email for client ${params.clientId}`);
    return;
  }

  const [client] = await db
    .select({ contactEmail: clientsTable.contactEmail })
    .from(clientsTable)
    .where(eq(clientsTable.id, params.clientId));

  const recipientEmail = client?.contactEmail;
  if (!recipientEmail) {
    console.warn(`[MonthlyComplianceReport] No contact email for client ${params.clientId} — skipping email`);
    return;
  }

  const topPairingLine = params.topBotRolePairings.length > 0
    ? `<li><strong>Top bot-role pairing:</strong> ${params.topBotRolePairings.map((p) => `${p.botName} as ${p.role} (${p.count} sessions)`).join(", ")}</li>`
    : "";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#1d4ed8;margin:0 0 8px">EU AI Act Compliance Report</h2>
  <p style="color:#64748b;margin:0 0 24px">${params.month} — ${params.companyName ?? "Your account"}</p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:24px">
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><strong>AI-orchestrated sessions</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right">${params.sessions}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><strong>Human override rate</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right">${params.humanOverrideRate}%</td></tr>
    <tr><td style="padding:8px 0"><strong>Total LLM cost</strong></td><td style="padding:8px 0;text-align:right">$${params.totalLlmCostUsd}</td></tr>
  </table>
  <ul style="margin:0 0 24px;padding-left:20px">
    ${topPairingLine}
  </ul>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b">This report is generated in compliance with EU AI Act Article 13 (Transparency of High-Risk AI Systems).</p>
  <p style="margin:0;font-size:13px;color:#64748b">Full report available via API: <code>GET /api/v1/audit/compliance-report?month=${params.month}</code></p>
</div>`;

  const text = [
    `EU AI Act Compliance Report — ${params.month}`,
    `Company: ${params.companyName ?? "Your account"}`,
    `AI-orchestrated sessions: ${params.sessions}`,
    `Human override rate: ${params.humanOverrideRate}%`,
    `Total LLM cost: $${params.totalLlmCostUsd}`,
    params.topBotRolePairings.map((p) => `Top pairing: ${p.botName} as ${p.role} (${p.count})`).join("\n"),
    `Full report: GET /api/v1/audit/compliance-report?month=${params.month}`,
  ].join("\n");

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: smtpFrom || smtpUser,
      to: recipientEmail,
      subject: `EU AI Act Compliance Report — ${params.month}`,
      html,
      text,
    });
    console.log(`[MonthlyComplianceReport] Email sent to ${recipientEmail} for client ${params.clientId}`);
  } catch (err) {
    console.error(`[MonthlyComplianceReport] SMTP delivery error for client ${params.clientId}:`, err);
  }
}

export async function runMonthlyComplianceReports(): Promise<void> {
  const now = new Date();
  const isFirstDayOfMonth = now.getDate() === 1;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

  if (!isFirstDayOfMonth) return;
  if (lastRunMonth === prevMonth) return;

  lastRunMonth = prevMonth;
  console.log(`[MonthlyComplianceReport] Generating ${prevMonth} reports for all clients`);

  try {
    const clients = await db.select({ id: clientsTable.id, companyName: clientsTable.companyName }).from(clientsTable).limit(500);

    for (const client of clients) {
      try {
        const report = await generateComplianceReport(prevMonth, client.id);
        console.log(
          `[MonthlyComplianceReport] Client ${client.id} (${client.companyName}): ` +
          `${report.totalAiOrchestratedSessions} sessions, ` +
          `${report.humanOverrideRate}% human override rate, ` +
          `$${report.totalLlmCostUsd} LLM cost`,
        );

        // In-app notification delivery
        const topPairing = report.topBotRolePairings[0];
        const pairingNote = topPairing
          ? ` Top bot-role pairing: ${topPairing.botName} as ${topPairing.role} (${topPairing.count} sessions).`
          : "";
        await createNotification({
          clientId: client.id,
          category: "system",
          severity: "info",
          title: `EU AI Act Compliance Report — ${prevMonth}`,
          body:
            `${report.totalAiOrchestratedSessions} AI-orchestrated sessions. ` +
            `Human override rate: ${report.humanOverrideRate}%. ` +
            `LLM cost: $${report.totalLlmCostUsd}.` +
            pairingNote +
            ` Full report: GET /api/v1/audit/compliance-report?month=${prevMonth}`,
          metadata: {
            month: prevMonth,
            totalSessions: report.totalAiOrchestratedSessions,
            humanOverrideRate: report.humanOverrideRate,
            totalLlmCostUsd: report.totalLlmCostUsd,
            topBotRolePairings: report.topBotRolePairings,
          },
        });

        // Email delivery (requires SMTP_HOST / SMTP_USER / SMTP_PASS env vars)
        await sendComplianceReportEmail({
          clientId: client.id,
          companyName: client.companyName,
          month: prevMonth,
          sessions: report.totalAiOrchestratedSessions,
          humanOverrideRate: report.humanOverrideRate,
          totalLlmCostUsd: report.totalLlmCostUsd,
          topBotRolePairings: report.topBotRolePairings,
        });
      } catch (err) {
        console.error(`[MonthlyComplianceReport] Failed for client ${client.id}:`, err);
      }
    }

    console.log(`[MonthlyComplianceReport] Done generating ${prevMonth} reports`);
  } catch (err) {
    console.error("[MonthlyComplianceReport] Failed to run monthly reports:", err);
  }
}
