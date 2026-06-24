import {
  db,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaGoal,
} from "@workspace/db";
import { eq, and, inArray, lt, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Dead-letter reaper + capability pre-flight. Goals that stay blocked past a
// TTL, or that repeatedly fail, are moved to a dead-letter state instead of
// silently churning. Capability pre-flight verifies a goal is actionable
// (required capabilities/tools present) before the engine tries to run it.
// ---------------------------------------------------------------------------

const BLOCKED_TTL_MS = 24 * 60 * 60 * 1000; // 24h blocked => dead letter
const MAX_FAILURES = 3;

export interface PreflightResult {
  ready: boolean;
  readinessScore: number; // 0..100
  missing: string[];
}

// Capabilities the platform currently exposes to autonomous goals.
const AVAILABLE_CAPABILITIES = new Set([
  "analysis",
  "research",
  "monitoring",
  "reporting",
  "planning",
  "coordination",
  "memory",
  "compliance",
]);

// Keyword → capability mapping used to infer what a goal needs.
const CAPABILITY_HINTS: Array<[RegExp, string]> = [
  [/\b(analy|insight|evaluate|assess)\b/i, "analysis"],
  [/\b(research|investigat|discover|scan)\b/i, "research"],
  [/\b(monitor|watch|track|detect)\b/i, "monitoring"],
  [/\b(report|summar|brief|digest)\b/i, "reporting"],
  [/\b(plan|roadmap|strateg|prioriti)\b/i, "planning"],
  [/\b(coordinat|orchestrat|delegate|assign)\b/i, "coordination"],
  [/\b(remember|learn|recall|memor)\b/i, "memory"],
  [/\b(complian|audit|privacy|gdpr)\b/i, "compliance"],
];

export function capabilityPreflight(goal: {
  title: string;
  description?: string | null;
}): PreflightResult {
  const haystack = `${goal.title} ${goal.description ?? ""}`;
  const required = new Set<string>();
  for (const [re, cap] of CAPABILITY_HINTS) {
    if (re.test(haystack)) required.add(cap);
  }
  // Default to analysis if nothing matched (every goal can be reasoned about).
  if (required.size === 0) required.add("analysis");

  const missing = [...required].filter((c) => !AVAILABLE_CAPABILITIES.has(c));
  const readinessScore = Math.round(
    ((required.size - missing.length) / required.size) * 100,
  );
  return { ready: missing.length === 0, readinessScore, missing };
}

async function countFailures(goalId: number): Promise<number> {
  const rows = await db
    .select({ id: gaaJournalTable.id })
    .from(gaaJournalTable)
    .where(
      and(
        eq(gaaJournalTable.goalId, goalId),
        eq(gaaJournalTable.eventType, "execution_failed"),
      ),
    );
  return rows.length;
}

/**
 * Record an execution failure and, if the goal has now failed too many times,
 * move it straight to the dead-letter queue. Called from the engine's catch
 * path so that repeatedly-failing pending/active goals can never churn forever.
 * Returns true if the goal was dead-lettered.
 */
export async function recordFailureAndMaybeDeadLetter(
  goal: GaaGoal,
): Promise<boolean> {
  const failures = await countFailures(goal.id);
  if (failures >= MAX_FAILURES) {
    await toDeadLetter(
      goal,
      `Exceeded ${MAX_FAILURES} execution failures; dead-lettered to stop retry churn.`,
    );
    return true;
  }
  // Below threshold: surface the degraded state so the reaper's TTL applies.
  await db
    .update(gaaGoalsTable)
    .set({
      status: "blocked",
      blockedReason: `Execution failure ${failures}/${MAX_FAILURES}; will dead-letter on repeat.`,
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, goal.id));
  return false;
}

async function toDeadLetter(goal: GaaGoal, reason: string): Promise<void> {
  await db
    .update(gaaGoalsTable)
    .set({
      status: "dead_letter",
      deadLetterReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, goal.id));

  await db.insert(gaaJournalTable).values({
    goalId: goal.id,
    phase: "system",
    eventType: "dead_lettered",
    decision: "info",
    detail: reason,
  });
}

/**
 * Reaper pass: dead-letter goals that have been blocked too long or failed
 * too many times. Run periodically by the GAA service.
 */
export async function reapDeadLetters(): Promise<number> {
  const cutoff = new Date(Date.now() - BLOCKED_TTL_MS);

  const stuck = await db
    .select()
    .from(gaaGoalsTable)
    .where(
      and(
        inArray(gaaGoalsTable.status, ["blocked", "suspended"]),
        lt(gaaGoalsTable.updatedAt, cutoff),
      ),
    );

  let reaped = 0;
  for (const goal of stuck) {
    const failures = await countFailures(goal.id);
    if (failures >= MAX_FAILURES) {
      await toDeadLetter(
        goal,
        `Exceeded ${MAX_FAILURES} failures while ${goal.status}.`,
      );
      reaped++;
    } else {
      await toDeadLetter(
        goal,
        `Stuck in "${goal.status}" beyond TTL with no progress.`,
      );
      reaped++;
    }
  }
  return reaped;
}

export async function listDeadLetters(): Promise<GaaGoal[]> {
  return db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.status, "dead_letter"))
    .orderBy(desc(gaaGoalsTable.updatedAt));
}

/**
 * Revive a dead-lettered goal back to pending (human-triggered).
 */
export async function reviveDeadLetter(goalId: number): Promise<GaaGoal | null> {
  const [updated] = await db
    .update(gaaGoalsTable)
    .set({
      status: "pending",
      deadLetterReason: null,
      blockedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, goalId))
    .returning();
  if (updated) {
    await db.insert(gaaJournalTable).values({
      goalId,
      phase: "system",
      eventType: "dead_letter_revived",
      decision: "proceed",
      detail: "Manually revived from dead-letter queue.",
    });
  }
  return updated ?? null;
}
