import { db, gaaGoalsTable, gaaJournalTable, type GaaGoal } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Parallel suspense queue. Long-horizon goals that are waiting on something
// (a dependency, an approval, an external event) are suspended with their
// in-flight state serialized, freeing the engine to work other goals. They are
// resumed when their wake condition is met.
// ---------------------------------------------------------------------------

export async function suspendGoal(params: {
  goalId: number;
  reason: string;
  state?: Record<string, unknown>;
}): Promise<GaaGoal> {
  const [updated] = await db
    .update(gaaGoalsTable)
    .set({
      status: "suspended",
      blockedReason: params.reason,
      suspendedState: params.state ?? {},
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, params.goalId))
    .returning();

  await db.insert(gaaJournalTable).values({
    goalId: params.goalId,
    phase: "suspend",
    eventType: "goal_suspended",
    decision: "info",
    detail: `Suspended: ${params.reason}`,
    metadata: { hasState: Boolean(params.state) },
  });

  return updated;
}

export async function resumeGoal(params: {
  goalId: number;
  note?: string;
}): Promise<{ goal: GaaGoal; state: Record<string, unknown> }> {
  const [current] = await db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.id, params.goalId));
  if (!current) throw new Error(`GAA goal ${params.goalId} not found`);

  const state = (current.suspendedState ?? {}) as Record<string, unknown>;

  const [updated] = await db
    .update(gaaGoalsTable)
    .set({
      status: "active",
      blockedReason: null,
      suspendedState: null,
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, params.goalId))
    .returning();

  await db.insert(gaaJournalTable).values({
    goalId: params.goalId,
    phase: "resume",
    eventType: "goal_resumed",
    decision: "proceed",
    detail: params.note ?? "Resumed from suspense queue.",
  });

  return { goal: updated, state };
}

export async function listSuspended(): Promise<GaaGoal[]> {
  return db
    .select()
    .from(gaaGoalsTable)
    .where(
      and(
        inArray(gaaGoalsTable.status, ["suspended", "blocked"]),
      ),
    )
    .orderBy(desc(gaaGoalsTable.priority));
}
