import { db, workflowsTable, workflowRunsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { executeWorkflow, resumeWorkflowRunFromDelay } from "../../missions/workflow-engine";

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

export async function checkScheduledWorkflows() {
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

export async function resumePausedWorkflows() {
  const now = new Date();
  const pausedRuns = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.status, "paused"));

  for (const run of pausedRuns) {
    const logEntries = (run.log ?? []) as Array<Record<string, unknown>>;
    const resumeEntry = logEntries.find((e) => e.type === "delay_resume");
    if (!resumeEntry) continue;

    const resumeAt = new Date(resumeEntry.resumeAt as string);
    if (now < resumeAt) continue;

    const remainingNodeIds = resumeEntry.remainingNodeIds as string[];
    const payload = (resumeEntry.payload ?? {}) as Record<string, unknown>;

    const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, run.workflowId));
    if (!workflow || !workflow.enabled) {
      await db.update(workflowRunsTable).set({ status: "failed", completedAt: now }).where(eq(workflowRunsTable.id, run.id));
      continue;
    }

    if (remainingNodeIds.length === 0) {
      const completedLog = logEntries.filter((e) => e.type !== "delay_resume");
      await db.update(workflowRunsTable).set({
        status: "done",
        completedAt: now,
        log: completedLog,
      }).where(eq(workflowRunsTable.id, run.id));
      continue;
    }

    const priorLog = logEntries.filter((e) => e.type !== "delay_resume");
    await db.update(workflowRunsTable).set({
      status: "running",
      log: priorLog,
    }).where(eq(workflowRunsTable.id, run.id));

    resumeWorkflowRunFromDelay(run.id, run.workflowId, remainingNodeIds[0], payload, priorLog)
      .catch((e) => console.error(`[scheduler] Failed to resume paused workflow run ${run.id}:`, e));
  }
}
