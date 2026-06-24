import {
  db,
  gaaActionLedgerTable,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaActionLedgerEntry,
} from "@workspace/db";
import { eq, and, lt, desc } from "drizzle-orm";
import { recordAuditEvent } from "./compliance-gate";

// ---------------------------------------------------------------------------
// Compensating-action executors. Each side-effecting tool registers a function
// that ACTUALLY reverses its effect. rollbackAction() invokes the matching
// executor and only marks an entry rolled_back once the compensating
// transaction has run successfully — it never claims success without execution.
// ---------------------------------------------------------------------------

export type CompensatingExecutor = (
  entry: GaaActionLedgerEntry,
) => Promise<void>;

const COMPENSATORS: Record<string, CompensatingExecutor> = {
  // Reverse a "gaa.advance" step: decrement the goal's progress by the recorded
  // delta and re-open the goal so the step can be re-planned.
  "gaa.advance": async (entry) => {
    if (entry.goalId == null) return;
    const goalId = entry.goalId;
    const payload = (entry.payload ?? {}) as { progressDelta?: number };
    const delta = typeof payload.progressDelta === "number" ? payload.progressDelta : 25;
    const [goal] = await db
      .select({ progressScore: gaaGoalsTable.progressScore })
      .from(gaaGoalsTable)
      .where(eq(gaaGoalsTable.id, goalId));
    if (!goal) return;
    await db
      .update(gaaGoalsTable)
      .set({
        progressScore: Math.max(0, goal.progressScore - delta),
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(gaaGoalsTable.id, goalId));
  },
};

/** Register/override a compensating executor for a tool (used by executors). */
export function registerCompensator(toolName: string, fn: CompensatingExecutor): void {
  COMPENSATORS[toolName] = fn;
}

// ---------------------------------------------------------------------------
// Reversible action ledger. Every side-effecting action is recorded together
// with its compensating (undo) action and an undo window. Within the window
// an action can be rolled back; afterwards it is marked undo_expired.
// ---------------------------------------------------------------------------

const DEFAULT_UNDO_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export async function recordAction(params: {
  goalId: number;
  action: string;
  toolName?: string | null;
  payload?: Record<string, unknown>;
  compensatingAction?: string | null;
  reversibilityScore?: number | null;
  undoWindowMs?: number;
}): Promise<GaaActionLedgerEntry> {
  const reversibility = params.reversibilityScore ?? null;
  const irreversible =
    !params.compensatingAction ||
    (typeof reversibility === "number" && reversibility < 15);

  const undoWindowExpiresAt = irreversible
    ? null
    : new Date(Date.now() + (params.undoWindowMs ?? DEFAULT_UNDO_WINDOW_MS));

  const [entry] = await db
    .insert(gaaActionLedgerTable)
    .values({
      goalId: params.goalId,
      action: params.action,
      toolName: params.toolName ?? null,
      payload: params.payload ?? {},
      compensatingAction: params.compensatingAction ?? null,
      reversibilityScore: reversibility,
      status: irreversible ? "irreversible" : "executed",
      undoWindowExpiresAt,
    })
    .returning();

  await db.insert(gaaJournalTable).values({
    goalId: params.goalId,
    phase: "execute",
    eventType: "action_recorded",
    decision: "info",
    detail: `Action "${params.action}" recorded (${entry.status}).`,
    metadata: { ledgerId: entry.id, toolName: params.toolName },
  });

  return entry;
}

export interface RollbackResult {
  ok: boolean;
  reason?: string;
  entry?: GaaActionLedgerEntry;
}

/**
 * Roll back a previously recorded action within its undo window. The actual
 * compensating side effect is described in `compensatingAction`; here we
 * transition ledger + audit state. (Executors apply the compensating action.)
 */
export async function rollbackAction(
  ledgerId: number,
  rolledBackBy: string,
): Promise<RollbackResult> {
  const [entry] = await db
    .select()
    .from(gaaActionLedgerTable)
    .where(eq(gaaActionLedgerTable.id, ledgerId));

  if (!entry) return { ok: false, reason: "Ledger entry not found." };
  if (entry.status === "rolled_back") {
    return { ok: false, reason: "Already rolled back." };
  }
  if (entry.status === "irreversible" || !entry.compensatingAction) {
    return { ok: false, reason: "Action is irreversible — cannot roll back." };
  }
  if (
    entry.undoWindowExpiresAt &&
    entry.undoWindowExpiresAt.getTime() < Date.now()
  ) {
    await db
      .update(gaaActionLedgerTable)
      .set({ status: "undo_expired" })
      .where(eq(gaaActionLedgerTable.id, ledgerId));
    return { ok: false, reason: "Undo window has expired." };
  }

  const compensator = entry.toolName ? COMPENSATORS[entry.toolName] : undefined;
  if (!compensator) {
    // No executor can actually reverse this action — do NOT claim success.
    // Mark it as needing manual compensation so it is never falsely "rolled_back".
    const [pending] = await db
      .update(gaaActionLedgerTable)
      .set({ status: "rollback_pending", rolledBackBy })
      .where(eq(gaaActionLedgerTable.id, ledgerId))
      .returning();
    await db.insert(gaaJournalTable).values({
      goalId: entry.goalId,
      phase: "execute",
      eventType: "rollback_pending",
      decision: "blocked",
      detail: `No compensating executor registered for tool "${entry.toolName ?? "unknown"}"; manual reversal required: ${entry.compensatingAction}`,
      metadata: { ledgerId, rolledBackBy },
    });
    return {
      ok: false,
      reason: "No compensating executor registered; manual reversal required.",
      entry: pending,
    };
  }

  // Execute the compensating transaction; only mark rolled_back on success.
  try {
    await compensator(entry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(gaaActionLedgerTable)
      .set({ status: "rollback_failed" })
      .where(eq(gaaActionLedgerTable.id, ledgerId));
    await db.insert(gaaJournalTable).values({
      goalId: entry.goalId,
      phase: "execute",
      eventType: "rollback_failed",
      decision: "blocked",
      detail: `Compensating action for "${entry.action}" FAILED: ${msg}`,
      metadata: { ledgerId, rolledBackBy },
    });
    await recordAuditEvent({
      goalId: entry.goalId,
      eventType: "rollback",
      decision: "block",
      toolName: entry.toolName,
      compliancePassed: false,
      detail: `Rollback of ledger #${ledgerId} failed during compensating execution: ${msg}`,
    });
    return { ok: false, reason: `Compensating action failed: ${msg}`, entry };
  }

  const [updated] = await db
    .update(gaaActionLedgerTable)
    .set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rolledBackBy,
    })
    .where(eq(gaaActionLedgerTable.id, ledgerId))
    .returning();

  await db.insert(gaaJournalTable).values({
    goalId: entry.goalId,
    phase: "execute",
    eventType: "action_rolled_back",
    decision: "rolled_back",
    detail: `Compensating action executed for "${entry.action}": ${entry.compensatingAction}`,
    metadata: { ledgerId, rolledBackBy },
  });

  await recordAuditEvent({
    goalId: entry.goalId,
    eventType: "rollback",
    decision: "allow",
    toolName: entry.toolName,
    detail: `Compensating action executed and confirmed for ledger #${ledgerId}.`,
  });

  return { ok: true, entry: updated };
}

/**
 * Mark expired undo windows. Run periodically by the GAA service.
 */
export async function expireUndoWindows(): Promise<number> {
  const expired = await db
    .update(gaaActionLedgerTable)
    .set({ status: "undo_expired" })
    .where(
      and(
        eq(gaaActionLedgerTable.status, "executed"),
        lt(gaaActionLedgerTable.undoWindowExpiresAt, new Date()),
      ),
    )
    .returning({ id: gaaActionLedgerTable.id });
  return expired.length;
}

export async function listLedger(goalId?: number): Promise<GaaActionLedgerEntry[]> {
  const query = db.select().from(gaaActionLedgerTable);
  if (goalId) {
    return query
      .where(eq(gaaActionLedgerTable.goalId, goalId))
      .orderBy(desc(gaaActionLedgerTable.createdAt));
  }
  return query.orderBy(desc(gaaActionLedgerTable.createdAt)).limit(200);
}
