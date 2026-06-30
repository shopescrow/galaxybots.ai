import {
  db,
  clientsTable,
  intelligenceBriefsTable,
  briefingSettingsTable,
  toolActivityLogTable,
  aeoScoresTable,
  pendingApprovalsTable,
  notificationsTable,
  bingolingoContentTable,
  bingolingoClientsTable,
  clientIntegrationsTable,
  competitorUrlsTable,
  prospectsTable,
} from "@workspace/db";
import { eq, and, desc, gte, isNull, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import { decryptCredential } from "../../utils/credential-encryption";
import nodemailer from "nodemailer";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function getClientCredential(clientId: number, service: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.clientId, clientId),
      eq(clientIntegrationsTable.service, service),
      eq(clientIntegrationsTable.status, "connected")
    ));
  if (!row) return null;
  return decryptCredential(row.credential);
}

async function resolveSlackChannel(token: string, channelNameOrId: string): Promise<string | null> {
  if (channelNameOrId.startsWith("C") && /^C[A-Z0-9]+$/.test(channelNameOrId)) {
    return channelNameOrId;
  }
  const cleanName = channelNameOrId.replace(/^#/, "");
  try {
    let cursor: string | undefined;
    do {
      const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json() as {
        ok: boolean;
        channels?: Array<{ id: string; name: string }>;
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) return null;
      const match = data.channels?.find((c) => c.name === cleanName);
      if (match) return match.id;
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    return null;
  }
  return null;
}

interface BriefContext {
  client: { id: number; companyName: string; contactEmail: string; industry?: string | null };
  botActivity: Array<{ toolName: string; botName: string | null; count: number }>;
  pendingApprovals: number;
  recentAeoScores: Array<{ overallScore: number; scannedAt: Date }>;
  recentContent: Array<{ title: string; status: string; createdAt: Date }>;
  unreadNotifications: number;
  competitors: Array<{ companyName: string; url: string }>;
  newProspects: number;
  qualifiedLeads: number;
  recentConversions: number;
}

async function gatherBriefContext(clientId: number, periodHours: number): Promise<BriefContext | null> {
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client) return null;

  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000);

  const [activityRows, approvalCount, recentScores, contentRows, unreadCount, competitorRows, prospectRows] = await Promise.all([
    db
      .select({
        toolName: toolActivityLogTable.toolName,
        botName: toolActivityLogTable.botName,
        count: toolActivityLogTable.id,
      })
      .from(toolActivityLogTable)
      .where(and(
        eq(toolActivityLogTable.clientId, clientId),
        gte(toolActivityLogTable.createdAt, since)
      ))
      .orderBy(desc(toolActivityLogTable.createdAt))
      .limit(50),
    db
      .select({ id: pendingApprovalsTable.id })
      .from(pendingApprovalsTable)
      .where(and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending")
      )),
    db
      .select({ overallScore: aeoScoresTable.overallScore, scannedAt: aeoScoresTable.scannedAt })
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        gte(aeoScoresTable.scannedAt, since)
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(10),
    db
      .select({ title: bingolingoContentTable.title, status: bingolingoContentTable.status, createdAt: bingolingoContentTable.createdAt })
      .from(bingolingoContentTable)
      .innerJoin(bingolingoClientsTable, eq(bingolingoContentTable.clientId, bingolingoClientsTable.id))
      .where(and(
        eq(bingolingoClientsTable.galaxybotsClientId, clientId),
        gte(bingolingoContentTable.createdAt, since)
      ))
      .orderBy(desc(bingolingoContentTable.createdAt))
      .limit(10),
    db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.clientId, clientId),
        isNull(notificationsTable.readAt)
      ))
      .limit(100),
    db
      .select({ companyName: competitorUrlsTable.companyName, url: competitorUrlsTable.url })
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ))
      .limit(10),
    db
      .select({ status: prospectsTable.status, createdAt: prospectsTable.createdAt })
      .from(prospectsTable)
      .where(eq(prospectsTable.clientId, clientId))
      .orderBy(desc(prospectsTable.createdAt))
      .limit(200),
  ]);

  const toolCountMap: Record<string, { count: number; botName: string | null }> = {};
  for (const row of activityRows) {
    const key = row.toolName;
    if (!toolCountMap[key]) toolCountMap[key] = { count: 0, botName: row.botName };
    toolCountMap[key].count++;
  }
  const botActivity = Object.entries(toolCountMap).map(([toolName, v]) => ({
    toolName,
    botName: v.botName,
    count: v.count,
  }));

  const recentProspects = prospectRows.filter(p => new Date(p.createdAt) >= since);
  const newProspects = recentProspects.length;
  const qualifiedLeads = prospectRows.filter(p =>
    p.status === "qualified" || p.status === "contacted" || p.status === "responded"
  ).length;
  const recentConversions = prospectRows.filter(p =>
    p.status === "converted" && new Date(p.createdAt) >= since
  ).length;

  return {
    client: { id: clientId, companyName: client.companyName, contactEmail: client.contactEmail, industry: client.industry },
    botActivity,
    pendingApprovals: approvalCount.length,
    recentAeoScores: recentScores.map(r => ({ overallScore: Number(r.overallScore), scannedAt: new Date(r.scannedAt) })),
    recentContent: contentRows.map(r => ({ title: r.title, status: r.status, createdAt: new Date(r.createdAt) })),
    unreadNotifications: unreadCount.length,
    competitors: competitorRows,
    newProspects,
    qualifiedLeads,
    recentConversions,
  };
}

function buildBriefPrompt(ctx: BriefContext, briefType: "morning" | "weekly"): string {
  const period = briefType === "morning" ? "last 24 hours" : "last 7 days";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const activitySummary = ctx.botActivity.length > 0
    ? ctx.botActivity.slice(0, 10).map(a => `- ${a.toolName} called ${a.count}x${a.botName ? ` by ${a.botName}` : ""}`).join("\n")
    : "No bot activity in this period.";

  const aeoSummary = ctx.recentAeoScores.length > 0
    ? `Latest AEO score: ${ctx.recentAeoScores[0].overallScore}. ${ctx.recentAeoScores.length} scan(s) performed.`
    : "No AEO scans performed in this period.";

  const contentSummary = ctx.recentContent.length > 0
    ? ctx.recentContent.map(c => `- "${c.title}" (${c.status})`).join("\n")
    : "No new content created in this period.";

  const competitorSummary = ctx.competitors.length > 0
    ? `Tracking ${ctx.competitors.length} competitor(s): ${ctx.competitors.map(c => c.companyName).join(", ")}`
    : "No competitors being tracked.";

  const prospectSummary = `New prospects discovered: ${ctx.newProspects}. Qualified/active leads: ${ctx.qualifiedLeads}. Recent conversions: ${ctx.recentConversions}.`;

  return `You are the AI briefing system for GalaxyBots, an AI automation platform. Generate a professional ${briefType === "morning" ? "morning" : "weekly"} intelligence brief for ${ctx.client.companyName}${ctx.client.industry ? ` (${ctx.client.industry} industry)` : ""}.

Today: ${date}
Brief period: ${period}

DATA:
1. Bot Activity (${period}):
${activitySummary}

2. AEO Intelligence (AI Search Visibility):
${aeoSummary}

3. Competitor Intelligence:
${competitorSummary}

4. Prospecting & Leads:
${prospectSummary}

5. BingoLingo Content (${period}):
${contentSummary}

6. Command Center:
- Pending approvals awaiting review: ${ctx.pendingApprovals}
- Unread notifications: ${ctx.unreadNotifications}

Generate a structured brief with these exact sections:
1. Executive Summary (2-3 sentences — the most important things that happened and need attention)
2. Bot Activity (what your AI team accomplished — specific tools used, notable decisions made)
3. AEO Intelligence (AI engine visibility score, any changes, competitor movements)
4. Prospecting & Pipeline (new leads discovered, qualified prospects, conversion updates)
5. Content Performance (new content published, AEO impact)
6. Action Required (pending approvals, escalations needing attention)
7. Today's Top Recommendations (1-3 prioritized, actionable items for the day)

Keep each section concise and executive-focused. Be specific with numbers. End with clear, actionable recommendations.
Return ONLY the brief content — no preamble or meta-commentary.`;
}

function buildSafePlainText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function generateHtmlEmail(bodyText: string, client: { companyName: string }, date: string, briefType: "morning" | "weekly"): string {
  const briefLabel = briefType === "morning" ? "Morning Brief" : "Weekly Digest";
  const sections = bodyText.split("\n\n").filter(Boolean);

  const sectionsHtml = sections
    .map(section => {
      const lines = section.split("\n");
      const [heading, ...rest] = lines;
      const isHeading = /^\d+\.|^#{1,3}\s/.test(heading) || (rest.length > 0 && heading.length < 80);
      const headingText = buildSafePlainText(heading.replace(/^\d+\.\s*|^#{1,3}\s*/, ""));
      const bodyContent = rest.map(l => buildSafePlainText(l)).join("<br>");

      if (isHeading && rest.length > 0) {
        return `
        <div style="margin-bottom:20px;padding:16px;background:#1a1a2e;border-left:3px solid #7c3aed;border-radius:6px;">
          <p style="margin:0 0 8px;font-weight:700;color:#a78bfa;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">${headingText}</p>
          <div style="color:#e2e8f0;font-size:14px;line-height:1.6;">${bodyContent}</div>
        </div>`;
      }
      return `<p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0 0 12px;">${buildSafePlainText(section)}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:linear-gradient(135deg,#1e1e3f 0%,#2d1b69 100%);border:1px solid #3b1d8a;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;border-bottom:1px solid #3b1d8a;">
        <p style="margin:0 0 4px;color:#a78bfa;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">GalaxyBots Intelligence</p>
        <h1 style="margin:0 0 4px;color:white;font-size:20px;font-weight:700;">Your ${briefLabel}</h1>
        <p style="margin:0;color:#94a3b8;font-size:13px;">${buildSafePlainText(date)} &middot; ${buildSafePlainText(client.companyName)}</p>
      </div>
      <div style="padding:24px 28px;">
        ${sectionsHtml}
      </div>
      <div style="padding:20px 28px;border-top:1px solid #3b1d8a;text-align:center;">
        <a href="${process.env.PLATFORM_URL || "https://galaxybots.ai"}/briefs" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">View Full Brief in GalaxyBots &#x2192;</a>
        <p style="margin:16px 0 0;color:#64748b;font-size:11px;">GalaxyBots Intelligence Briefings &middot; <a href="${process.env.PLATFORM_URL || "https://galaxybots.ai"}/settings" style="color:#7c3aed;">Manage Settings</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function generateSlackBlocks(bodyText: string, client: { companyName: string }, date: string, briefType: "morning" | "weekly"): unknown[] {
  const briefLabel = briefType === "morning" ? "Morning Brief" : "Weekly Digest";
  const lines = bodyText.split("\n").filter(Boolean);

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `⚡ GalaxyBots ${briefLabel} — ${date}`, emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `*${client.companyName}* · Generated by GalaxyBots Intelligence` }],
    },
    { type: "divider" },
  ];

  let currentSection = "";
  for (const line of lines) {
    const isHeading = /^\d+\.|^#{1,3}\s/.test(line);
    if (isHeading) {
      if (currentSection) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: currentSection.trim().substring(0, 3000) } });
        currentSection = "";
      }
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${line.replace(/^\d+\.\s*|^#{1,3}\s*/, "")}*` } });
    } else {
      currentSection += line + "\n";
    }
  }
  if (currentSection) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: currentSection.trim().substring(0, 3000) } });
  }

  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    elements: [{
      type: "button",
      text: { type: "plain_text", text: "View in GalaxyBots →", emoji: true },
      url: `${process.env.PLATFORM_URL || "https://galaxybots.ai"}/briefs`,
      style: "primary",
    }],
  });

  return blocks;
}

function hasActivityInContext(ctx: BriefContext): boolean {
  if (ctx.botActivity.length > 0) return true;
  if (ctx.pendingApprovals > 0) return true;
  if (ctx.recentAeoScores.length > 0) return true;
  if (ctx.recentContent.length > 0) return true;
  if (ctx.newProspects > 0) return true;
  if (ctx.recentConversions > 0) return true;
  return false;
}

export async function generateBriefForClient(clientId: number, briefType: "morning" | "weekly" = "morning"): Promise<typeof intelligenceBriefsTable.$inferSelect | null> {
  const periodHours = briefType === "morning" ? 24 : 168;
  const ctx = await gatherBriefContext(clientId, periodHours);
  if (!ctx) throw new Error(`Client ${clientId} not found`);

  if (!hasActivityInContext(ctx)) {
    console.log(`[briefing] Skipping ${briefType} brief for client ${clientId}: no activity`);
    return null;
  }

  const prompt = buildBriefPrompt(ctx, briefType);

  const completion = await openai.chat.completions.create({
    model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
    max_completion_tokens: 1500,
    messages: [
      { role: "system", content: "You are a professional executive briefing AI. Be concise, specific, and actionable. Return plain text only — no HTML or markdown formatting." },
      { role: "user", content: prompt },
    ],
  });

  const bodyText = completion.choices[0]?.message?.content?.trim() ?? "Brief generation failed.";
  const date = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const bodyHtml = generateHtmlEmail(bodyText, ctx.client, date, briefType);

  const [brief] = await db.insert(intelligenceBriefsTable).values({
    clientId,
    briefType,
    bodyHtml,
    bodyText,
    deliveryChannels: { email: false, slack: false },
  }).returning();

  return brief;
}

export async function deliverBriefToEmail(brief: typeof intelligenceBriefsTable.$inferSelect, recipients: string[]): Promise<boolean> {
  if (recipients.length === 0) return false;

  const date = new Date(brief.generatedAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const subject = `Your GalaxyBots Brief — ${date}`;

  const gmailToken = await getClientCredential(brief.clientId, "gmail");

  if (gmailToken) {
    try {
      const rawMime = [
        `To: ${recipients.join(", ")}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=utf-8`,
        ``,
        brief.bodyHtml,
      ].join("\r\n");

      const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${gmailToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: Buffer.from(rawMime).toString("base64url") }),
      });
      if (!response.ok) {
        console.error(`[briefing] Gmail send failed: ${response.status}`);
        return false;
      }
      await updateDeliveredAt(brief.id, "email");
      return true;
    } catch (err) {
      console.error(`[briefing] Gmail delivery error: ${errMsg(err)}`);
    }
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: smtpFrom || smtpUser,
        to: recipients.join(", "),
        subject,
        html: brief.bodyHtml,
        text: brief.bodyText,
      });
      await updateDeliveredAt(brief.id, "email");
      return true;
    } catch (err) {
      console.error(`[briefing] SMTP delivery error: ${errMsg(err)}`);
    }
  }

  console.warn(`[briefing] No email credential configured for client ${brief.clientId}`);
  return false;
}

export async function deliverBriefToSlack(brief: typeof intelligenceBriefsTable.$inferSelect, clientId: number, channel: string): Promise<boolean> {
  const token = await getClientCredential(clientId, "slack");

  if (!token) {
    console.warn(`[briefing] Slack delivery skipped for client ${clientId}: no Slack integration connected`);
    return false;
  }

  try {
    const channelId = await resolveSlackChannel(token, channel);
    if (!channelId) {
      console.warn(`[briefing] Slack channel not found: ${channel}`);
      return false;
    }

    const [client] = await db.select({ companyName: clientsTable.companyName }).from(clientsTable).where(eq(clientsTable.id, brief.clientId));
    const date = new Date(brief.generatedAt).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const blocks = generateSlackBlocks(brief.bodyText, { companyName: client?.companyName ?? "Unknown" }, date, brief.briefType as "morning" | "weekly");

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, blocks, text: `GalaxyBots Brief — ${date}` }),
    });
    const data = await response.json() as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error(`[briefing] Slack post failed: ${data.error}`);
      return false;
    }
    await updateDeliveredAt(brief.id, "slack");
    return true;
  } catch (err) {
    console.error(`[briefing] Slack delivery error: ${errMsg(err)}`);
    return false;
  }
}

async function updateDeliveredAt(briefId: number, channel: "email" | "slack") {
  const [existing] = await db
    .select({ deliveredAt: intelligenceBriefsTable.deliveredAt, deliveryChannels: intelligenceBriefsTable.deliveryChannels })
    .from(intelligenceBriefsTable)
    .where(eq(intelligenceBriefsTable.id, briefId));
  const prevDeliveredAt = (existing?.deliveredAt ?? {}) as Record<string, string>;
  prevDeliveredAt[channel] = new Date().toISOString();
  const prevChannels = (existing?.deliveryChannels ?? { email: false, slack: false }) as { email: boolean; slack: boolean };
  prevChannels[channel] = true;
  await db
    .update(intelligenceBriefsTable)
    .set({ deliveredAt: prevDeliveredAt, deliveryChannels: prevChannels })
    .where(eq(intelligenceBriefsTable.id, briefId));
}

export function getTzLocalHour(timezone: string): number {
  try {
    const now = new Date();
    const localHourStr = now.toLocaleString("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
    return parseInt(localHourStr, 10) % 24;
  } catch {
    return new Date().getUTCHours();
  }
}

export function getTzLocalMinute(timezone: string): number {
  try {
    const now = new Date();
    const localMinStr = now.toLocaleString("en-US", { timeZone: timezone, minute: "2-digit" });
    return parseInt(localMinStr, 10);
  } catch {
    return new Date().getUTCMinutes();
  }
}

export function isWithinDeliveryWindow(localMinute: number, targetMinute: number, windowMinutes = 5): boolean {
  const diff = (localMinute - targetMinute + 60) % 60;
  return diff < windowMinutes;
}

export function getTzLocalDay(timezone: string): number {
  try {
    const now = new Date();
    const dayStr = now.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return dayMap[dayStr] ?? new Date().getUTCDay();
  } catch {
    return new Date().getUTCDay();
  }
}

export function getTzLocalDateStr(timezone: string): string {
  try {
    const now = new Date();
    return now.toLocaleString("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).split(",")[0].trim();
  } catch {
    return new Date().toISOString().substring(0, 10);
  }
}

type EffectiveSettings = {
  emailEnabled: number;
  emailRecipients: string[] | null;
  slackEnabled: number;
  slackChannel: string | null;
  deliveryHour: number;
  deliveryMinute: number;
  timezone: string;
  id: number;
};

async function getEffectiveSettingsForClient(clientId: number): Promise<EffectiveSettings | null> {
  const [clientSettings] = await db
    .select()
    .from(briefingSettingsTable)
    .where(eq(briefingSettingsTable.clientId, clientId));

  if (clientSettings) {
    return {
      emailEnabled: clientSettings.emailEnabled,
      emailRecipients: clientSettings.emailRecipients ?? null,
      slackEnabled: clientSettings.slackEnabled,
      slackChannel: clientSettings.slackChannel ?? null,
      deliveryHour: clientSettings.deliveryHour,
      deliveryMinute: clientSettings.deliveryMinute,
      timezone: clientSettings.timezone,
      id: clientSettings.id,
    };
  }

  const [globalSettings] = await db
    .select()
    .from(briefingSettingsTable)
    .where(isNull(briefingSettingsTable.clientId));

  if (!globalSettings) return null;
  if (!globalSettings.emailEnabled && !globalSettings.slackEnabled) return null;

  return {
    emailEnabled: globalSettings.emailEnabled,
    emailRecipients: globalSettings.emailRecipients ?? null,
    slackEnabled: globalSettings.slackEnabled,
    slackChannel: globalSettings.slackChannel ?? null,
    deliveryHour: globalSettings.deliveryHour,
    deliveryMinute: globalSettings.deliveryMinute,
    timezone: globalSettings.timezone,
    id: globalSettings.id,
  };
}

async function hasReceivedBriefToday(clientId: number, timezone: string): Promise<boolean> {
  const todayStr = getTzLocalDateStr(timezone);
  const startOfDay = new Date(`${todayStr}T00:00:00`);
  const [row] = await db
    .select({ id: intelligenceBriefsTable.id })
    .from(intelligenceBriefsTable)
    .where(and(
      eq(intelligenceBriefsTable.clientId, clientId),
      eq(intelligenceBriefsTable.briefType, "morning"),
      gte(intelligenceBriefsTable.generatedAt, startOfDay)
    ))
    .limit(1);
  return !!row;
}

async function hasReceivedBriefThisWeek(clientId: number, timezone: string): Promise<boolean> {
  const todayStr = getTzLocalDateStr(timezone);
  const startOfDay = new Date(`${todayStr}T00:00:00`);
  const [row] = await db
    .select({ id: intelligenceBriefsTable.id })
    .from(intelligenceBriefsTable)
    .where(and(
      eq(intelligenceBriefsTable.clientId, clientId),
      eq(intelligenceBriefsTable.briefType, "weekly"),
      gte(intelligenceBriefsTable.generatedAt, startOfDay)
    ))
    .limit(1);
  return !!row;
}

async function runBriefForClient(
  clientId: number,
  briefType: "morning" | "weekly",
  settings: EffectiveSettings
): Promise<void> {
  const brief = await generateBriefForClient(clientId, briefType);
  if (!brief) {
    console.log(`[briefing] No brief generated for client ${clientId} (${briefType}): no activity`);
    return;
  }

  const [client] = await db
    .select({ contactEmail: clientsTable.contactEmail })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  const recipients = [
    ...(client ? [client.contactEmail] : []),
    ...(settings.emailRecipients ?? []),
  ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];

  if (settings.emailEnabled && recipients.length > 0) {
    await deliverBriefToEmail(brief, recipients);
  }

  if (settings.slackEnabled && settings.slackChannel) {
    await deliverBriefToSlack(brief, clientId, settings.slackChannel);
  }

  const updateField = briefType === "morning"
    ? { lastMorningBriefAt: new Date(), updatedAt: new Date() }
    : { lastWeeklyBriefAt: new Date(), updatedAt: new Date() };

  const [existingRow] = await db
    .select({ id: briefingSettingsTable.id })
    .from(briefingSettingsTable)
    .where(eq(briefingSettingsTable.clientId, clientId));

  if (existingRow) {
    await db
      .update(briefingSettingsTable)
      .set(updateField)
      .where(eq(briefingSettingsTable.clientId, clientId));
  }
}

export async function generateMorningBriefs() {
  try {
    const allClients = await db.select({ id: clientsTable.id }).from(clientsTable);

    for (const { id: clientId } of allClients) {
      try {
        const settings = await getEffectiveSettingsForClient(clientId);
        if (!settings) continue;
        if (!settings.emailEnabled && !settings.slackEnabled) continue;

        const localHour = getTzLocalHour(settings.timezone);
        if (localHour !== settings.deliveryHour) continue;

        const localMinute = getTzLocalMinute(settings.timezone);
        if (!isWithinDeliveryWindow(localMinute, settings.deliveryMinute)) continue;

        if (await hasReceivedBriefToday(clientId, settings.timezone)) {
          console.log(`[briefing] Morning brief already sent today for client ${clientId}`);
          continue;
        }

        console.log(`[briefing] Generating morning brief for client ${clientId} (local ${localHour}:${String(localMinute).padStart(2, "0")}, tz: ${settings.timezone})`);
        await runBriefForClient(clientId, "morning", settings);
        console.log(`[briefing] Morning brief delivered for client ${clientId}`);
      } catch (err) {
        console.error(`[briefing] Morning brief failed for client ${clientId}: ${errMsg(err)}`);
      }
    }
  } catch (err) {
    console.error(`[briefing] generateMorningBriefs failed: ${errMsg(err)}`);
  }
}

export async function generateWeeklyBriefs() {
  try {
    const allClients = await db.select({ id: clientsTable.id }).from(clientsTable);

    for (const { id: clientId } of allClients) {
      try {
        const settings = await getEffectiveSettingsForClient(clientId);
        if (!settings) continue;
        if (!settings.emailEnabled && !settings.slackEnabled) continue;

        const localDay = getTzLocalDay(settings.timezone);
        if (localDay !== 1) continue;

        const localHour = getTzLocalHour(settings.timezone);
        if (localHour !== settings.deliveryHour) continue;

        const localMinute = getTzLocalMinute(settings.timezone);
        if (!isWithinDeliveryWindow(localMinute, settings.deliveryMinute)) continue;

        if (await hasReceivedBriefThisWeek(clientId, settings.timezone)) {
          console.log(`[briefing] Weekly brief already sent this week for client ${clientId}`);
          continue;
        }

        console.log(`[briefing] Generating weekly brief for client ${clientId} (local Monday ${localHour}:${String(localMinute).padStart(2, "0")})`);
        await runBriefForClient(clientId, "weekly", settings);
        console.log(`[briefing] Weekly brief delivered for client ${clientId}`);
      } catch (err) {
        console.error(`[briefing] Weekly brief failed for client ${clientId}: ${errMsg(err)}`);
      }
    }
  } catch (err) {
    console.error(`[briefing] generateWeeklyBriefs failed: ${errMsg(err)}`);
  }
}

const DEFAULT_SETTINGS_VALUES = {
  emailEnabled: 0,
  emailRecipients: null,
  slackEnabled: 0,
  slackChannel: "galaxybots-brief",
  deliveryHour: 7,
  deliveryMinute: 30,
  timezone: "America/Toronto",
  lastMorningBriefAt: null,
  lastWeeklyBriefAt: null,
} as const;

export async function getBriefingSettingsForClient(clientId: number): Promise<typeof briefingSettingsTable.$inferSelect> {
  const [clientRow] = await db
    .select()
    .from(briefingSettingsTable)
    .where(eq(briefingSettingsTable.clientId, clientId));
  if (clientRow) return clientRow;

  const [globalRow] = await db
    .select()
    .from(briefingSettingsTable)
    .where(isNull(briefingSettingsTable.clientId));

  if (globalRow) {
    return {
      ...globalRow,
      id: -clientId,
      clientId,
    };
  }

  return {
    id: -clientId,
    clientId,
    ...DEFAULT_SETTINGS_VALUES,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function ensureBriefingSettingsForClient(clientId: number): Promise<typeof briefingSettingsTable.$inferSelect> {
  const [existing] = await db
    .select()
    .from(briefingSettingsTable)
    .where(eq(briefingSettingsTable.clientId, clientId));
  if (existing) return existing;

  const [created] = await db
    .insert(briefingSettingsTable)
    .values({ clientId })
    .returning();
  return created;
}

export async function getOrCreateGlobalBriefingSettings(): Promise<typeof briefingSettingsTable.$inferSelect> {
  const [existing] = await db.select().from(briefingSettingsTable).where(isNull(briefingSettingsTable.clientId));
  if (existing) return existing;

  const [created] = await db.insert(briefingSettingsTable).values({ clientId: null }).returning();
  return created;
}
