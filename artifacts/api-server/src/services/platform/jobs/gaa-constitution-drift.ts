import { db, gaaMemoryTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  detectConstitutionDrift,
  escalate,
  recordAuditEvent,
} from "../../gaa";

// Weekly governance job: detect drift between the live constitution and the
// canonical seed policy. Runs on the daily scheduler but self-throttles to
// once per 7 days via a marker in gaa_memory, so silent edits to inviolable
// principles are caught and escalated for human review.

const DRIFT_MARKER_KEY = "constitution_drift_last_run";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getLastRun(): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(gaaMemoryTable)
    .where(
      and(
        eq(gaaMemoryTable.scope, "platform"),
        eq(gaaMemoryTable.key, DRIFT_MARKER_KEY),
      ),
    );
  if (!row) return null;
  const ts = Date.parse(row.content);
  return Number.isNaN(ts) ? null : new Date(ts);
}

async function setLastRun(now: Date, summary: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(gaaMemoryTable)
    .where(
      and(
        eq(gaaMemoryTable.scope, "platform"),
        eq(gaaMemoryTable.key, DRIFT_MARKER_KEY),
      ),
    );
  if (existing) {
    await db
      .update(gaaMemoryTable)
      .set({ content: now.toISOString(), lesson: summary, updatedAt: new Date() })
      .where(eq(gaaMemoryTable.id, existing.id));
  } else {
    await db.insert(gaaMemoryTable).values({
      tier: "warm",
      scope: "platform",
      key: DRIFT_MARKER_KEY,
      content: now.toISOString(),
      lesson: summary,
    });
  }
}

export async function runConstitutionDriftCheck(): Promise<void> {
  const now = new Date();
  const last = await getLastRun();
  if (last && now.getTime() - last.getTime() < WEEK_MS) return; // throttled

  const drift = await detectConstitutionDrift();

  if (drift.drifted) {
    const parts: string[] = [];
    if (drift.missing.length) parts.push(`${drift.missing.length} missing`);
    if (drift.deactivated.length) parts.push(`${drift.deactivated.length} deactivated`);
    if (drift.severityChanged.length) parts.push(`${drift.severityChanged.length} severity-changed`);
    if (drift.extra.length) parts.push(`${drift.extra.length} unsanctioned`);
    const reason = `Constitution drift detected vs canonical policy: ${parts.join(", ")}.`;

    await recordAuditEvent({
      goalId: null,
      eventType: "plan_decision",
      decision: "flag",
      compliancePassed: false,
      violations: [
        ...drift.missing,
        ...drift.deactivated,
        ...drift.severityChanged.map((s) => `${s.principle} (${s.expected}→${s.actual})`),
      ],
      detail: reason,
    });

    await escalate({
      reason,
      severity: "high",
      recommendedAction: "Review the constitution against policy and restore inviolable principles.",
      context: { drift },
    });

    console.warn(`[gaa] ${reason}`);
  }

  await setLastRun(now, drift.drifted ? "drift detected" : "no drift");
}
