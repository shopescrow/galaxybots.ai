import { db, platformAuditLogTable } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { closeEndedCycles } from "../../billing/cycle-close.js";
import { runDunningJob } from "../../billing/dunning-job.js";

const CYCLE_CLOSE_ACTION = "billing.cycle_close.ran";
const WINDOW_HOUR_UTC = 2; // 02:00 UTC daily window

/**
 * Returns the "billing day" key for a given Date: the UTC date on which the
 * 02:00 UTC window is open for billing cycle close.
 *
 * Before 02:00 UTC the key is yesterday so today's window is not yet open.
 *
 * Examples:
 *   2026-07-01T01:30Z  → "2026-06-30" (window not open yet)
 *   2026-07-01T02:05Z  → "2026-07-01" (window is open)
 */
export function getBillingDayKey(now: Date): string {
  const utcHour = now.getUTCHours();
  const dayOffset = utcHour < WINDOW_HOUR_UTC ? -1 : 0;
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset),
  );
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Checks the audit log to see whether cycle-close already ran for today's
 * billing day.  Restart-proof: the marker persists in the DB.
 */
async function alreadyRanToday(todayKey: string): Promise<boolean> {
  // billing day key is stored in metadata.billingDay
  const [row] = await db
    .select({ id: platformAuditLogTable.id })
    .from(platformAuditLogTable)
    .where(
      and(
        eq(platformAuditLogTable.action, CYCLE_CLOSE_ACTION),
        sql`${platformAuditLogTable.metadata}->>'billingDay' = ${todayKey}`,
      ),
    );
  return !!row;
}

/**
 * Daily job: close every billing cycle that has ended and attempt off-session
 * charge for each finalized invoice.
 *
 * Scheduling design:
 *   - Registered in mediumFreqJobs so it is polled hourly.
 *   - Opens at 02:00 UTC and runs at most once per UTC calendar day.
 *   - Run marker is persisted in platformAuditLogTable (restart-proof).
 */
export async function runBillingCycleClose(): Promise<void> {
  const now = new Date();

  // 1. Check the 02:00 UTC window is open.
  if (now.getUTCHours() < WINDOW_HOUR_UTC) return;

  const todayKey = getBillingDayKey(now);

  // 2. Check DB — did we already run today?
  if (await alreadyRanToday(todayKey)) return;

  // 3. Record the run marker BEFORE executing so a crash does not cause a
  //    double-run on the next hourly tick.
  await db.insert(platformAuditLogTable).values({
    action: CYCLE_CLOSE_ACTION,
    resource: "billing",
    metadata: { billingDay: todayKey, startedAt: now.toISOString() },
  });

  try {
    const results = await closeEndedCycles({ attemptCharge: true });
    const closed = results.filter((r) => !r.skipped);
    const charged = results.filter((r) => r.charged);
    console.log(
      `[billing-cycle-close] ${todayKey}: Closed ${closed.length} cycle(s), ` +
      `collected ${charged.length} payment(s)`,
    );
  } catch (err) {
    console.error("[billing-cycle-close] Job failed:", err);
    // The run marker already exists — this is intentional so a single failure
    // does not flood the DB with retries.  Operators can delete the audit entry
    // to force a same-day re-run during incident recovery.
  }
}

/**
 * Medium-frequency job (every hour): advance dunning steps for unpaid invoices.
 */
export async function runBillingDunning(): Promise<void> {
  try {
    await runDunningJob();
  } catch (err) {
    console.error("[billing-dunning] Job failed:", err);
  }
}
