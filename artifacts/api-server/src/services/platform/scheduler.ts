import { pool } from "@workspace/db";
import { checkSlaBreaches } from "./jobs/check-sla-breaches";
import { checkMorningBriefs } from "./jobs/check-morning-briefs";
import { checkWeeklyBriefs } from "./jobs/check-weekly-briefs";
import { checkDueAssignments } from "./jobs/check-due-assignments";
import { checkWeeklyBriefings } from "./jobs/check-weekly-briefings";
import { checkKnowledgeBaseSyncs } from "./jobs/check-kb-syncs";
import { checkBingolingoAutoContent } from "./jobs/check-bingolingo-auto-content";
import { checkCompetitorAlerts } from "./jobs/check-competitor-alerts";
import { checkHealthScores } from "./jobs/check-health-scores";
import { checkWeeklyPulse } from "./jobs/check-weekly-pulse";
import { checkContentAeoRescans } from "./jobs/check-content-aeo-rescans";
import { checkPartnerTierCompliance } from "./jobs/check-partner-tier-compliance";
import { checkApprovalSLAs } from "./jobs/check-approval-slas";
import { checkScheduledWorkflows, resumePausedWorkflows } from "./jobs/check-scheduled-workflows";
import { checkActivationNurture } from "./jobs/check-activation-nurture";
import { checkAeoScanQueue } from "./jobs/check-aeo-scan-queue";

export { checkApprovalSLAs };
export { checkActivationNurture };

const SCHEDULER_LOCK_ID = 999999;

type Job = {
  name: string;
  fn: () => Promise<void>;
};

const highFreqJobs: Job[] = [
  { name: "SLA breach check", fn: checkSlaBreaches },
  { name: "approval SLAs", fn: checkApprovalSLAs },
  { name: "AEO scan queue", fn: checkAeoScanQueue },
];

const mediumFreqJobs: Job[] = [
  { name: "assignments", fn: checkDueAssignments },
  { name: "KB sync", fn: checkKnowledgeBaseSyncs },
  { name: "scheduled workflows", fn: checkScheduledWorkflows },
  { name: "resume paused workflows", fn: resumePausedWorkflows },
  { name: "morning intelligence briefs", fn: checkMorningBriefs },
  { name: "weekly intelligence briefs", fn: checkWeeklyBriefs },
  { name: "health scores", fn: checkHealthScores },
  { name: "weekly briefings", fn: checkWeeklyBriefings },
  { name: "weekly pulse", fn: checkWeeklyPulse },
];

const lowFreqJobs: Job[] = [
  { name: "competitor alerts", fn: checkCompetitorAlerts },
  { name: "BingoLingo auto-content", fn: checkBingolingoAutoContent },
  { name: "content AEO re-scans", fn: checkContentAeoRescans },
  { name: "partner tier review", fn: checkPartnerTierCompliance },
  { name: "activation nurture", fn: checkActivationNurture },
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
}

export function stopScheduler() {
  started = false;
}
