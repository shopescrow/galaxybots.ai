/**
 * Experiment assignment service.
 *
 * At the start of every agentic loop session, this module checks all running
 * experiments and assigns the session to a deterministic A/B cohort based on a
 * hash of the conversationId/sessionId.  The assignment is persisted in
 * `experiment_assignments` so the measurement job can query only labeled sessions.
 */

import { db, experimentsTable, experimentAssignmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Deterministic bucket: same (seed, splitPct) always yields the same cohort. */
function assignCohort(seed: number, splitPct: number): "A" | "B" {
  const bucket = Math.floor((seed * 2654435761) % 100);
  return bucket < splitPct * 100 ? "B" : "A";
}

/**
 * Assigns the current session/conversation to any active experiments.
 * Idempotent: if an assignment already exists for the same session + experiment it is skipped.
 * Called once at the start of `runAgenticLoopEngine`.
 *
 * Returns the list of variant assignments so the loop engine can inject them as
 * pipeline tags — this enables downstream filtering of tool calls, outcomes, and
 * logs by experiment variant (e.g., "Experiment #3: cohort B").
 */
export async function assignSessionToExperiments(opts: {
  sessionId?: number;
  conversationId?: number;
}): Promise<Array<{ experimentId: number; cohort: string }>> {
  if (!opts.sessionId && !opts.conversationId) return [];

  try {
    const runningExperiments = await db
      .select({ id: experimentsTable.id, splitPct: experimentsTable.splitPct })
      .from(experimentsTable)
      .where(eq(experimentsTable.status, "running"))
      .limit(50);

    if (runningExperiments.length === 0) return [];

    const seed = opts.conversationId ?? opts.sessionId ?? 0;

    const assignments = runningExperiments.map((exp) => ({
      experimentId: exp.id,
      sessionId: opts.sessionId ?? null,
      conversationId: opts.conversationId ?? null,
      cohort: assignCohort(seed, exp.splitPct ?? 0.2),
    }));

    for (const v of assignments) {
      await db.insert(experimentAssignmentsTable).values(v).onConflictDoNothing?.();
    }

    return assignments.map((a) => ({ experimentId: a.experimentId, cohort: a.cohort }));
  } catch (err) {
    // Non-fatal — experiment assignment failure must never block agent execution
    console.error("[experiment-assignment] Error assigning session:", err);
    return [];
  }
}
