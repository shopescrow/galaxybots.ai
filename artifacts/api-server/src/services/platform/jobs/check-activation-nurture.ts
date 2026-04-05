import {
  db,
  clientsTable,
  usersTable,
  activationEmailsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { WebsiteIntel } from "@workspace/db";

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const NODEMAILER_LOADED: { transporter?: import("nodemailer").Transporter } = {};

async function getMailTransporter() {
  if (NODEMAILER_LOADED.transporter) return NODEMAILER_LOADED.transporter;
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  NODEMAILER_LOADED.transporter = transporter;
  return transporter;
}

async function sendNurtureEmail(to: string, subject: string, html: string): Promise<boolean> {
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@galaxybots.ai";
  try {
    if (!process.env.SMTP_HOST && !process.env.SMTP_USER) {
      console.log(`[nurture-email] Stub mode: Would send "${subject}" to ${to}`);
      return true;
    }
    const transporter = await getMailTransporter();
    await transporter.sendMail({ from: smtpFrom, to, subject, html });
    return true;
  } catch (err) {
    console.error(`[nurture-email] Failed to send "${subject}" to ${to}:`, errMsg(err));
    return false;
  }
}

function nurtureDay1Html(userName: string, companyName: string, industryInsight: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8f8ff;">
<div style="background:#0f0e2a;border-radius:12px;padding:30px;margin-bottom:20px;">
  <h1 style="color:#7c3aed;margin:0 0 8px;">GalaxyBots.ai</h1>
  <p style="color:#a8a8c8;margin:0;font-size:14px;">Your AI executive team is assembled and waiting.</p>
</div>
<h2 style="color:#0f0e2a;">Hi ${userName},</h2>
<p>Your AI executive team at <strong>${companyName}</strong> is fully assembled and already analyzing your industry.</p>
<p>Magnus Drake, your Chief Strategy Officer, has been thinking about your market:</p>
<blockquote style="border-left:4px solid #7c3aed;padding:12px 20px;margin:20px 0;background:#f0ebff;border-radius:0 8px 8px 0;font-style:italic;">
  "${industryInsight}"
</blockquote>
<p>Ready to see your AI team in action? Launch your first mission and get a personalized strategy in minutes.</p>
<a href="${process.env.APP_URL || "https://galaxybots.ai"}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">Launch Your First Mission</a>
<p style="color:#888;font-size:12px;margin-top:30px;">You're receiving this because you signed up for GalaxyBots.ai. <a href="${process.env.APP_URL || "https://galaxybots.ai"}/settings">Manage preferences</a></p>
</body></html>`;
}

function nurtureDay3Html(userName: string, companyName: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8f8ff;">
<div style="background:#0f0e2a;border-radius:12px;padding:30px;margin-bottom:20px;">
  <h1 style="color:#7c3aed;margin:0 0 8px;">GalaxyBots.ai</h1>
  <p style="color:#a8a8c8;margin:0;font-size:14px;">Your bots are ready to take action.</p>
</div>
<h2 style="color:#0f0e2a;">Hi ${userName},</h2>
<p>Your AI team at <strong>${companyName}</strong> is assembled — but they can't take action without connections to your tools.</p>
<p><strong>Connect Gmail in 30 seconds</strong> and your bots can:</p>
<ul style="line-height:1.8;">
  <li>Send follow-up emails on your behalf</li>
  <li>Draft and schedule client communications</li>
  <li>Monitor your inbox for important signals</li>
</ul>
<p>It's a single click — no API keys, no configuration.</p>
<a href="${process.env.APP_URL || "https://galaxybots.ai"}/integrations?highlight=gmail" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">Connect Gmail Now</a>
<p style="color:#888;font-size:12px;margin-top:30px;">You're receiving this because you signed up for GalaxyBots.ai. <a href="${process.env.APP_URL || "https://galaxybots.ai"}/settings">Manage preferences</a></p>
</body></html>`;
}

function nurtureDay7Html(userName: string, companyName: string, stuckStep: string): string {
  const ctaMap: Record<string, { text: string; url: string }> = {
    firstClient: { text: "Add Your First Client", url: "/clients" },
    industry: { text: "Select Your Industry", url: "/" },
    integrations: { text: "Connect an Integration", url: "/integrations" },
    firstMission: { text: "Launch Your First Mission", url: "/deploy-team" },
    default: { text: "Complete Your Setup", url: "/" },
  };
  const cta = ctaMap[stuckStep] ?? ctaMap.default;
  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a2e;background:#f8f8ff;">
<div style="background:#0f0e2a;border-radius:12px;padding:30px;margin-bottom:20px;">
  <h1 style="color:#7c3aed;margin:0 0 8px;">GalaxyBots.ai</h1>
  <p style="color:#a8a8c8;margin:0;font-size:14px;">Most teams get value in the first week.</p>
</div>
<h2 style="color:#0f0e2a;">Hi ${userName},</h2>
<p>Teams that complete setup in their first week at <strong>${companyName}</strong> see 3x more value from their AI executive team.</p>
<p>You're almost there — one thing to do today:</p>
<a href="${process.env.APP_URL || "https://galaxybots.ai"}${cta.url}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">${cta.text}</a>
<p>Need help? Reply to this email and our team will assist you.</p>
<p style="color:#888;font-size:12px;margin-top:30px;">You're receiving this because you signed up for GalaxyBots.ai. <a href="${process.env.APP_URL || "https://galaxybots.ai"}/settings">Manage preferences</a></p>
</body></html>`;
}

let lastNurtureCheck = 0;
const NURTURE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

export async function checkActivationNurture() {
  const now = Date.now();
  if (now - lastNurtureCheck < NURTURE_CHECK_INTERVAL) return;
  lastNurtureCheck = now;

  try {
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const nowDate = new Date();

    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        displayName: usersTable.displayName,
        clientId: usersTable.clientId,
        onboarding: usersTable.onboarding,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.isActive, true),
        )
      );

    const sentEmailsRaw = await db.select().from(activationEmailsTable);
    const sentMap = new Map<string, boolean>();
    for (const e of sentEmailsRaw) {
      sentMap.set(`${e.userId}:${e.emailType}`, true);
    }

    for (const user of users) {
      const onboarding = user.onboarding;
      if (!onboarding) continue;
      if (onboarding.completedAt) continue;

      const accountAge = nowDate.getTime() - new Date(user.createdAt).getTime();
      const userName = user.displayName || user.email.split("@")[0];

      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, user.clientId));
      if (!client) continue;

      const companyName = client.companyName;
      const websiteIntel = client.websiteIntel as WebsiteIntel | null | undefined;

      if (accountAge >= FOUR_HOURS && !onboarding.firstMission && !sentMap.get(`${user.id}:day1`)) {
        let industryInsight = "Your industry is evolving faster than ever. Businesses that leverage AI executives are capturing market share from those still relying on traditional approaches.";

        if (websiteIntel?.summary || client.industry) {
          try {
            const insightCompletion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              max_completion_tokens: 150,
              messages: [
                {
                  role: "system",
                  content: "Generate a 2-sentence strategic insight for an executive from this company. Be specific, provocative, and insightful. Sound like a seasoned strategy consultant.",
                },
                {
                  role: "user",
                  content: `Company: ${companyName}\nIndustry: ${client.industry || websiteIntel?.industry || "Unknown"}\nContext: ${websiteIntel?.summary || ""}`,
                },
              ],
            });
            industryInsight = insightCompletion.choices[0]?.message?.content ?? industryInsight;
          } catch (_e) {}
        }

        const html = nurtureDay1Html(userName, companyName, industryInsight);
        const sent = await sendNurtureEmail(user.email, `${companyName}'s AI executive team is assembled and waiting`, html);
        if (sent) {
          try {
            await db.insert(activationEmailsTable).values({ userId: user.id, emailType: "day1" }).onConflictDoNothing();
            sentMap.set(`${user.id}:day1`, true);
            console.log(`[nurture] Day 1 email sent to user ${user.id} (${user.email})`);
          } catch (_dup) {}
        }
      }

      if (accountAge >= THREE_DAYS && !onboarding.integrations && !sentMap.get(`${user.id}:day3`)) {
        const html = nurtureDay3Html(userName, companyName);
        const sent = await sendNurtureEmail(user.email, "Your bots can't act without connections — connect Gmail in 30 seconds", html);
        if (sent) {
          try {
            await db.insert(activationEmailsTable).values({ userId: user.id, emailType: "day3" }).onConflictDoNothing();
            sentMap.set(`${user.id}:day3`, true);
            console.log(`[nurture] Day 3 email sent to user ${user.id} (${user.email})`);
          } catch (_dup) {}
        }
      }

      if (accountAge >= SEVEN_DAYS && !onboarding.completedAt && !sentMap.get(`${user.id}:day7`)) {
        const STEPS = ["companyProfile", "firstClient", "industry", "integrations", "firstMission"] as const;
        const stuckStep = STEPS.find((s) => !onboarding[s]) ?? "default";
        const html = nurtureDay7Html(userName, companyName, stuckStep);
        const sent = await sendNurtureEmail(user.email, "One thing to do today to get value from GalaxyBots", html);
        if (sent) {
          try {
            await db.insert(activationEmailsTable).values({ userId: user.id, emailType: "day7" }).onConflictDoNothing();
            sentMap.set(`${user.id}:day7`, true);
            console.log(`[nurture] Day 7 email sent to user ${user.id} (${user.email})`);
          } catch (_dup) {}
        }
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Activation nurture check failed: ${errMsg(err)}`);
  }
}
