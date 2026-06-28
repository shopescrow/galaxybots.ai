import { pool, db, aeoScanRequestsTable, workflowsTable, partnersTable, partnerRegistrationsTable, partnerTierReviewLogTable, clientIntegrationsTable, bingolingoContentTable, platformApiKeysTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { executeWorkflow } from "../missions/workflow-engine";
import { createNotification } from "../admin/notifications";
import { dispatchScanToPirateMonster } from "../partner/piratemonster-client";

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
import { checkSlaBreaches } from "./jobs/check-sla-breaches";
import { checkMorningBriefs } from "./jobs/check-morning-briefs";
import { checkWeeklyBriefs } from "./jobs/check-weekly-briefs";
import { checkDueAssignments } from "./jobs/check-due-assignments";
import { checkWeeklyBriefings } from "./jobs/check-weekly-briefings";
import { checkKnowledgeBaseSyncs } from "./jobs/check-kb-syncs";
import { checkBingolingoAutoContent } from "./jobs/check-bingolingo-auto-content";
import { checkContentNewsletters } from "./jobs/check-content-newsletters";
import { checkCompetitorAlerts } from "./jobs/check-competitor-alerts";
import { checkHealthScores } from "./jobs/check-health-scores";
import { checkWeeklyPulse } from "./jobs/check-weekly-pulse";
import { checkApprovalSLAs } from "./jobs/check-approval-slas";
import { resumePausedWorkflows } from "./jobs/check-scheduled-workflows";
import { checkActivationNurture } from "./jobs/check-activation-nurture";
import { checkLiberatorSyncs } from "../liberator/sync-engine";
import { checkCrmAnomalies } from "./jobs/check-crm-anomalies";
import { runGuardianHeartbeat } from "./jobs/guardian-heartbeat";
import { runGuardianPatrols } from "./jobs/guardian-patrol-runner";
import { runDependencyVulnerabilityWatcher } from "./jobs/dependency-vulnerability-watcher";
import { runGuardianInternalWatchers } from "./jobs/guardian-internal-watchers";
import { checkMemoryConsolidation } from "./jobs/consolidate-memories";
import { checkMemoryEmbeddingBackfill } from "./jobs/backfill-memory-embeddings";
import { checkEpisodicMemory } from "./jobs/episodic-memory";
import { checkBeliefDecay } from "./jobs/belief-decay";
import { checkStaleBeliefUpdates } from "../../services/ai-safety/belief-anomaly";
import { runGoalGeneration } from "./jobs/goal-generation";
import { runCounterfactualAttribution } from "./jobs/counterfactual-attribution";
import { runOpportunityDetection } from "./jobs/opportunity-detection";
import { checkUncertaintySchedules } from "./jobs/uncertainty-scheduler";
import { runSyntheticControlScan } from "./jobs/synthetic-control-builder";
import { runCalibrationPipeline } from "./jobs/calibration-pipeline";
import { runPromptEvolution, runPromptShadowPromotion } from "./jobs/prompt-evolution";
import { runModelReputationReeval } from "./jobs/model-reputation";
import { runToolHeuristicsUpdate } from "./jobs/tool-heuristics";
import { runAlignmentPatternExtraction } from "./jobs/alignment-pattern-extraction";
import { runExperimentMeasurement } from "./jobs/experiment-measurement";
import { runAlignmentHarvester } from "./jobs/alignment-harvester";
import { runCommunicationStyleAdaptation } from "./jobs/communication-style";
import { runCrossClientCausalAggregation } from "./jobs/cross-client-causal-aggregation";
import { runRoleSpecializationEngine } from "./jobs/role-specialization-engine";
import { runNovelRoleDiscovery } from "./jobs/novel-role-discovery";
import { runOracleReportGenerator } from "./jobs/oracle-report-generator";
import { runConsequenceModelTrainer } from "./jobs/consequence-model-trainer";
import { runCollectiveAnomalyDetection } from "./jobs/collective-anomaly-detection";
import { runPlatformIntelligenceScore } from "./jobs/platform-intelligence-score";
import { runWeeklyIntelligenceCycles } from "./jobs/run-intelligence-cycle";
import { runPendingRegressionChecks } from "../intelligence/intelligence-cycle";
import { computeAndStoreGlobalPriors } from "../intelligence/global-priors";
import { runMonthlyComplianceReports } from "./jobs/monthly-compliance-report";
import { runGaaTick } from "./jobs/gaa-cycle";
import { runConstitutionDriftCheck } from "./jobs/gaa-constitution-drift";
import { runSelfActualizationCycle } from "./jobs/self-actualization";
import { checkMoltbookHeartbeats } from "./jobs/check-moltbook-heartbeats";
import { runAssetManagementCycle } from "./jobs/asset-lifecycle";

export { checkApprovalSLAs };
export { checkActivationNurture };
export { checkDueAssignments };
export { runGoalGeneration };
export { runCounterfactualAttribution };
export { runOpportunityDetection };

const SCHEDULER_LOCK_ID = 999999;

type Job = {
  name: string;
  fn: () => Promise<void>;
};

const highFreqJobs: Job[] = [
  { name: "SLA breach check", fn: checkSlaBreaches },
  { name: "approval SLAs", fn: checkApprovalSLAs },
  { name: "AEO scan queue", fn: checkAeoScanQueue },
  { name: "guardian-heartbeat", fn: runGuardianHeartbeat },
  { name: "moltbook-heartbeats", fn: checkMoltbookHeartbeats },
];

const mediumFreqJobs: Job[] = [
  { name: "gaa-cycle", fn: runGaaTick },
  { name: "assignments", fn: checkDueAssignments },
  { name: "KB sync", fn: checkKnowledgeBaseSyncs },
  { name: "scheduled workflows", fn: checkScheduledWorkflows },
  { name: "resume paused workflows", fn: resumePausedWorkflows },
  { name: "morning intelligence briefs", fn: checkMorningBriefs },
  { name: "weekly intelligence briefs", fn: checkWeeklyBriefs },
  { name: "health scores", fn: checkHealthScores },
  { name: "weekly briefings", fn: checkWeeklyBriefings },
  { name: "weekly pulse", fn: checkWeeklyPulse },
  { name: "Liberator continuous sync", fn: async () => { await checkLiberatorSyncs(); } },
  { name: "guardian-patrols", fn: runGuardianPatrols },
  { name: "dependency-vulnerability-watcher", fn: runDependencyVulnerabilityWatcher },
  { name: "guardian-internal-watchers", fn: runGuardianInternalWatchers },
];

const lowFreqJobs: Job[] = [
  { name: "gaa-constitution-drift", fn: runConstitutionDriftCheck },
  { name: "self-actualization", fn: runSelfActualizationCycle },
  { name: "competitor alerts", fn: checkCompetitorAlerts },
  { name: "BingoLingo auto-content", fn: checkBingolingoAutoContent },
  { name: "content newsletters", fn: checkContentNewsletters },
  { name: "content AEO re-scans", fn: checkContentAeoRescans },
  { name: "partner tier review", fn: checkPartnerTierCompliance },
  { name: "activation nurture", fn: checkActivationNurture },
  { name: "CRM anomaly checks", fn: checkCrmAnomalies },
  { name: "goal-generation", fn: runGoalGeneration },
  { name: "counterfactual-attribution", fn: runCounterfactualAttribution },
  { name: "opportunity-detection", fn: runOpportunityDetection },
  { name: "uncertainty-schedules", fn: checkUncertaintySchedules },
  { name: "memory-consolidation", fn: checkMemoryConsolidation },
  { name: "memory-embedding-backfill", fn: checkMemoryEmbeddingBackfill },
  { name: "episodic-memory", fn: checkEpisodicMemory },
  { name: "belief-decay", fn: checkBeliefDecay },
  { name: "stale-belief-updates", fn: checkStaleBeliefUpdates },
  { name: "synthetic-control-scan", fn: runSyntheticControlScan },
  { name: "calibration-pipeline", fn: runCalibrationPipeline },
  { name: "prompt-evolution", fn: runPromptEvolution },
  { name: "prompt-shadow-promotion", fn: runPromptShadowPromotion },
  { name: "model-reputation-reeval", fn: runModelReputationReeval },
  { name: "tool-heuristics-update", fn: runToolHeuristicsUpdate },
  { name: "alignment-harvester", fn: runAlignmentHarvester },
  { name: "communication-style-adaptation", fn: runCommunicationStyleAdaptation },
  { name: "alignment-pattern-extraction", fn: runAlignmentPatternExtraction },
  { name: "experiment-measurement", fn: runExperimentMeasurement },
  { name: "cross-client-causal-aggregation", fn: runCrossClientCausalAggregation },
  { name: "role-specialization-engine", fn: runRoleSpecializationEngine },
  { name: "novel-role-discovery", fn: runNovelRoleDiscovery },
  { name: "oracle-report-generator", fn: runOracleReportGenerator },
  { name: "consequence-model-trainer", fn: runConsequenceModelTrainer },
  { name: "collective-anomaly-detection", fn: runCollectiveAnomalyDetection },
  { name: "platform-intelligence-score", fn: runPlatformIntelligenceScore },
  { name: "intelligence-cycle", fn: runWeeklyIntelligenceCycles },
  { name: "regression-checks", fn: runPendingRegressionChecks },
  { name: "global-priors-nightly", fn: async () => { await computeAndStoreGlobalPriors(); } },
  { name: "monthly-compliance-reports", fn: runMonthlyComplianceReports },
  { name: "asset-management-cycle", fn: runAssetManagementCycle },
];

const running = new Set<string>();

function handleTickError(label: string) {
  return (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      console.error(
        `[scheduler] ${label}: Missing database table — ${msg}. ` +
        `Run 'pnpm --filter @workspace/db push' to create missing tables. Will retry next tick.`
      );
    } else {
      console.error(`[scheduler] Tick error (${label}):`, err);
    }
  };
}

function runWithOverlapGuard(job: Job) {
  if (running.has(job.name)) {
    console.warn(`[scheduler] Skipping "${job.name}" — previous run still in progress`);
    return;
  }
  running.add(job.name);
  job.fn()
    .catch(handleTickError(job.name))
    .finally(() => running.delete(job.name));
}

function staggerJobs(jobs: Job[], intervalMs: number) {
  if (jobs.length === 0) return;
  const gap = Math.floor(intervalMs / jobs.length);
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    setTimeout(() => {
      runWithOverlapGuard(job);
      setInterval(() => runWithOverlapGuard(job), intervalMs);
    }, gap * i);
  }
}

async function tryAcquireSchedulerLock(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [SCHEDULER_LOCK_ID],
    );
    return result.rows[0]?.acquired === true;
  } catch (err) {
    console.error("[scheduler] Failed to acquire advisory lock:", err);
    return false;
  }
}

let started = false;
let lastContentRescanCheck = 0;
const CONTENT_RESCAN_INTERVAL = 24 * 60 * 60 * 1000;

async function checkContentAeoRescans() {
  const now = Date.now();
  if (now - lastContentRescanCheck < CONTENT_RESCAN_INTERVAL) return;
  lastContentRescanCheck = now;

  try {
    const publishedContent = await db
      .select()
      .from(bingolingoContentTable)
      .where(and(
        eq(bingolingoContentTable.status, "published"),
        isNotNull(bingolingoContentTable.publishedUrl),
        isNotNull(bingolingoContentTable.publishedAt)
      ));

    const [partnerKey] = await db
      .select()
      .from(platformApiKeysTable)
      .where(and(eq(platformApiKeysTable.platform, "piratemonster_mcp"), eq(platformApiKeysTable.status, "active")))
      .limit(1);

    if (!partnerKey) return;

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const content of publishedContent) {
      if (!content.publishedAt || !content.publishedUrl) continue;

      const elapsed = now - new Date(content.publishedAt).getTime();
      const shouldRescan7 = elapsed >= SEVEN_DAYS && elapsed < SEVEN_DAYS + ONE_DAY;
      const shouldRescan30 = elapsed >= THIRTY_DAYS && elapsed < THIRTY_DAYS + ONE_DAY;

      if (shouldRescan7 || shouldRescan30) {
        const existing = await db
          .select()
          .from(aeoScanRequestsTable)
          .where(and(
            eq(aeoScanRequestsTable.url, content.publishedUrl),
            eq(aeoScanRequestsTable.status, "queued")
          ));

        if (existing.length === 0) {
          await db.insert(aeoScanRequestsTable).values({
            partnerKeyId: partnerKey.id,
            url: content.publishedUrl,
            status: "queued",
          });
          console.log(`[scheduler] Queued ${shouldRescan7 ? "7-day" : "30-day"} AEO re-scan for content #${content.id}: ${content.publishedUrl}`);
        }
      }
    }
  } catch (err: unknown) {
    console.error(`[scheduler] Content AEO re-scan check failed: ${errMsg(err)}`);
  }
}

const PARTNER_TIER_THRESHOLDS = {
  authorized: { minClients: 5, minMonthlySpend: 200 },
  certified: { minClients: 15, minMonthlySpend: 500 },
  elite: { minClients: 50, minMonthlySpend: 2000 },
};

let lastPartnerTierReview: Date | null = null;

async function checkPartnerTierCompliance() {
  const now = new Date();
  if (lastPartnerTierReview) {
    const daysSince = (now.getTime() - lastPartnerTierReview.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 28) return;
  }

  const partners = await db.select().from(partnersTable).where(eq(partnersTable.isActive, true));

  for (const partner of partners) {
    try {
      const referrals = await db
        .select()
        .from(partnerRegistrationsTable)
        .where(and(eq(partnerRegistrationsTable.partnerRef, partner.ref), eq(partnerRegistrationsTable.status, "active")));

      const activeCount = referrals.length;
      const tierKey = partner.tier as keyof typeof PARTNER_TIER_THRESHOLDS;
      const thresholds = PARTNER_TIER_THRESHOLDS[tierKey] ?? PARTNER_TIER_THRESHOLDS.authorized;

      const isBelowThreshold = activeCount < thresholds.minClients;
      const newConsecutive = isBelowThreshold ? partner.consecutiveMonthsBelowThreshold + 1 : 0;

      let action = "no_change";
      let newTier = partner.tier;

      if (isBelowThreshold && newConsecutive >= 2) {
        const tiers = ["elite", "certified", "authorized"];
        const currentIdx = tiers.indexOf(partner.tier);
        if (currentIdx < tiers.length - 1) {
          newTier = tiers[currentIdx + 1];
          action = "downgraded";
        }
      } else if (!isBelowThreshold) {
        action = "no_change";
      } else {
        action = "below_threshold_warning";
      }

      await db.insert(partnerTierReviewLogTable).values({
        partnerId: partner.id,
        partnerRef: partner.ref,
        activeClientCount: activeCount,
        monthlySpend: "0",
        tierAtReview: partner.tier,
        action,
        notes: isBelowThreshold
          ? `Active clients (${activeCount}) below minimum (${thresholds.minClients}) for ${newConsecutive} month(s)`
          : `Thresholds met with ${activeCount} active clients`,
      });

      await db
        .update(partnersTable)
        .set({
          tier: newTier,
          consecutiveMonthsBelowThreshold: newConsecutive,
          lastTierReviewAt: now,
        })
        .where(eq(partnersTable.id, partner.id));

      if (action === "downgraded") {
        console.log(`[scheduler] Partner ${partner.ref} downgraded from ${partner.tier} to ${newTier}`);
      }
    } catch (err) {
      console.error(`[scheduler] Error reviewing partner ${partner.ref}:`, err);
    }
  }

  lastPartnerTierReview = now;
  console.log(`[scheduler] Partner tier review complete for ${partners.length} partner(s)`);
}

function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  if (field.includes(",")) return field.split(",").some((f) => matchesCronField(f.trim(), value));
  if (field.includes("-")) {
    const [lo, hi] = field.split("-").map(Number);
    return value >= lo && value <= hi;
  }
  if (field.includes("/")) {
    const [base, step] = field.split("/");
    const stepNum = Number(step);
    const start = base === "*" ? 0 : Number(base);
    return value >= start && (value - start) % stepNum === 0;
  }
  return Number(field) === value;
}

function cronDueInWindow(cron: string, since: Date, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [minuteF, hourF, domF, monthF, dowF] = parts;
  const windowMs = now.getTime() - since.getTime();
  const steps = Math.max(1, Math.ceil(windowMs / 60000));
  for (let i = 0; i < steps; i++) {
    const t = new Date(now.getTime() - i * 60000);
    if (
      matchesCronField(minuteF, t.getMinutes()) &&
      matchesCronField(hourF, t.getHours()) &&
      matchesCronField(domF, t.getDate()) &&
      matchesCronField(monthF, t.getMonth() + 1) &&
      matchesCronField(dowF, t.getDay())
    ) {
      return true;
    }
  }
  return false;
}

async function checkScheduledWorkflows() {
  const now = new Date();

  const workflows = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.enabled, true), eq(workflowsTable.triggerType, "schedule")));

  for (const workflow of workflows) {
    const config = (workflow.triggerConfig ?? {}) as Record<string, unknown>;
    const cron = (config.cron ?? config.cronExpression) as string | undefined;
    const intervalMinutes = Number(config.intervalMinutes ?? 0);

    const lastRun = workflow.lastRunAt;
    let shouldRun = false;

    if (cron) {
      const checkSince = lastRun ?? workflow.createdAt;
      shouldRun = cronDueInWindow(cron, checkSince, now);
      if (lastRun) {
        const msSinceLast = now.getTime() - lastRun.getTime();
        const minsBetween = msSinceLast / 60000;
        if (minsBetween < 59) shouldRun = false;
      }
    } else if (intervalMinutes > 0) {
      const nextRun = lastRun
        ? new Date(lastRun.getTime() + intervalMinutes * 60 * 1000)
        : new Date(workflow.createdAt.getTime());
      shouldRun = now >= nextRun;
    }

    if (shouldRun) {
      executeWorkflow(workflow.id, "schedule", { scheduledAt: now.toISOString(), cron: cron ?? null }).catch((err) => {
        console.error(`[scheduler] Scheduled workflow ${workflow.id} failed:`, err);
      });
    }
  }
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


const INTEGRATION_HEALTH_ENDPOINTS: Record<string, { url: string; method?: string; authHeader: (token: string) => Record<string, string> }> = {
  slack: {
    url: "https://slack.com/api/auth.test",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  hubspot: {
    url: "https://api.hubapi.com/crm/v3/objects/contacts?limit=1",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  github: {
    url: "https://api.github.com/user",
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, "User-Agent": "GalaxyBots/1.0" }),
  },
  gmail: {
    url: "https://www.googleapis.com/gmail/v1/users/me/profile",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  google_calendar: {
    url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  google_sheets: {
    url: "https://www.googleapis.com/drive/v3/files?pageSize=1&q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27",
    authHeader: (t) => ({ Authorization: `Bearer ${t}` }),
  },
  notion: {
    url: "https://api.notion.com/v1/users/me",
    authHeader: (t) => ({ Authorization: `Bearer ${t}`, "Notion-Version": "2022-06-28" }),
  },
};

let lastIntegrationHealthCheck = 0;
const INTEGRATION_HEALTH_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function checkIntegrationHealth() {
  const now = Date.now();
  if (now - lastIntegrationHealthCheck < INTEGRATION_HEALTH_INTERVAL_MS) return;
  lastIntegrationHealthCheck = now;

  const { decryptCredential } = await import("../../utils/credential-encryption");

  const integrations = await db
    .select()
    .from(clientIntegrationsTable)
    .where(eq(clientIntegrationsTable.status, "connected"));

  let checked = 0;
  let failed = 0;

  for (const integration of integrations) {
    const endpoint = INTEGRATION_HEALTH_ENDPOINTS[integration.service];
    if (!endpoint) continue;

    checked++;
    try {
      let token: string;
      try {
        token = decryptCredential(integration.credential);
      } catch {
        continue;
      }

      const resp = await fetch(endpoint.url, {
        method: endpoint.method ?? "GET",
        headers: endpoint.authHeader(token),
        signal: AbortSignal.timeout(10000),
      });

      let isAuthFailure = resp.status === 401 || resp.status === 403;

      if (!isAuthFailure && resp.ok && integration.service === "slack") {
        try {
          const body = await resp.json() as { ok?: boolean; error?: string };
          if (body.ok === false && /invalid_auth|token_revoked|token_expired|account_inactive|not_authed/i.test(body.error ?? "")) {
            isAuthFailure = true;
          }
        } catch {}
      }

      if (isAuthFailure) {
        failed++;
        await db
          .update(clientIntegrationsTable)
          .set({ status: "needs_reauth" })
          .where(eq(clientIntegrationsTable.id, integration.id));

        await createNotification({
          clientId: integration.clientId,
          category: "system",
          severity: "warning",
          title: `${integration.service} integration needs re-authorization`,
          body: `Health check detected that your ${integration.service} integration credentials have expired or been revoked. Please reconnect it in your Integrations settings.`,
          link: "/settings/integrations",
        });

        console.log(`[scheduler] Integration health check: ${integration.service} (client ${integration.clientId}) marked as needs_reauth`);
      }
    } catch (err) {
      console.error(`[scheduler] Integration health check error for ${integration.service} (client ${integration.clientId}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[scheduler] Integration health check complete: checked=${checked}, failed=${failed}`);
}

const SCAN_QUEUE_BATCH = 10;

async function checkAeoScanQueue() {
  const apiKey = process.env["PIRATEMONSTER_API_KEY"] || "";
  const apiBase = process.env["PIRATEMONSTER_API_BASE_URL"] || "";
  if (!apiKey || !apiBase) return;

  const queued = await db
    .select()
    .from(aeoScanRequestsTable)
    .where(eq(aeoScanRequestsTable.status, "queued"))
    .limit(SCAN_QUEUE_BATCH);

  if (queued.length === 0) return;

  console.log(`[PM] Scan queue processor: dispatching ${queued.length} queued scan(s)`);

  for (const request of queued) {
    try {
      await db
        .update(aeoScanRequestsTable)
        .set({ status: "processing" })
        .where(
          and(
            eq(aeoScanRequestsTable.id, request.id),
            eq(aeoScanRequestsTable.status, "queued")
          )
        );

      const result = await dispatchScanToPirateMonster(request.id, request.url);

      if (!result.success) {
        console.error(`[PM] Scan queue: failed to dispatch request ${request.id} (${request.url}): ${result.error}`);
        await db
          .update(aeoScanRequestsTable)
          .set({ status: "failed" })
          .where(eq(aeoScanRequestsTable.id, request.id));
      } else {
        console.log(`[PM] Scan queue: dispatched request ${request.id} (${request.url}) — pmScanId: ${result.pmScanId ?? "unknown"}`);
      }
    } catch (err: unknown) {
      console.error(`[PM] Scan queue processor error for request ${request.id}: ${errMsg(err)}`);
      try {
        await db
          .update(aeoScanRequestsTable)
          .set({ status: "failed" })
          .where(eq(aeoScanRequestsTable.id, request.id));
      } catch { }
    }
  }
}

let slaBreachInterval: ReturnType<typeof setInterval> | null = null;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export async function startScheduler() {
  if (started) return;

  const acquired = await tryAcquireSchedulerLock();
  if (!acquired) {
    console.log("[scheduler] Lock not acquired — another instance is running scheduled jobs");
    return;
  }

  started = true;

  const HIGH_FREQ = 5 * 60 * 1000;
  const MEDIUM_FREQ = 60 * 60 * 1000;
  const LOW_FREQ = 24 * 60 * 60 * 1000;

  staggerJobs(highFreqJobs, HIGH_FREQ);
  staggerJobs(mediumFreqJobs, MEDIUM_FREQ);
  staggerJobs(lowFreqJobs, LOW_FREQ);

  console.log(
    `[scheduler] Started — ${highFreqJobs.length} high-freq (5m), ` +
    `${mediumFreqJobs.length} medium-freq (1h), ` +
    `${lowFreqJobs.length} low-freq (24h) jobs`
  );

  slaBreachInterval = setInterval(() => {
    checkSlaBreaches().catch(handleTickError("SLA breach check"));
  }, 60 * 1000);

  schedulerInterval = setInterval(() => {
    checkDueAssignments().catch(handleTickError("assignments"));
    checkWeeklyBriefings().catch(handleTickError("weekly briefings"));
    checkCompetitorAlerts().catch(handleTickError("competitor alerts"));
    checkKnowledgeBaseSyncs().catch(handleTickError("KB sync"));
    checkBingolingoAutoContent().catch(handleTickError("BingoLingo auto-content"));
    checkContentAeoRescans().catch(handleTickError("content AEO re-scans"));
    checkHealthScores().catch(handleTickError("health scores"));
    checkWeeklyPulse().catch(handleTickError("weekly pulse"));
    checkPartnerTierCompliance().catch(handleTickError("partner tier review"));
    checkMorningBriefs().catch(handleTickError("morning intelligence briefs"));
    checkWeeklyBriefs().catch(handleTickError("weekly intelligence briefs"));
    checkApprovalSLAs().catch(handleTickError("approval SLAs"));
    checkScheduledWorkflows().catch(handleTickError("scheduled workflows"));
    resumePausedWorkflows().catch(handleTickError("resume paused workflows"));
    checkActivationNurture().catch(handleTickError("activation nurture"));
    checkAeoScanQueue().catch(handleTickError("AEO scan queue"));
    checkIntegrationHealth().catch(handleTickError("integration health check"));
  }, 5 * 60 * 1000);
}

export function stopScheduler() {
  started = false;
}
