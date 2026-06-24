import {
  db,
  gaaEscalationsTable,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaEscalation,
} from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { recordAuditEvent } from "./compliance-gate";

// ---------------------------------------------------------------------------
// Escalation & risk engine. When the GAA cannot safely decide (irreversible
// action, exhausted budget, unresolved conflict, repeated failure) it raises
// an escalation for a human, suspends the goal, and records the recommendation.
// ---------------------------------------------------------------------------

export type EscalationSeverity = "low" | "medium" | "high" | "critical";

// Shape of the consumable, one-shot human-approval artifact persisted on a
// goal's metadata. Consumed by the engine (runGoalStep) to authorise exactly
// one guarded execution past the mode gate / a constitution exception, then
// cleared. Without this, approved Agenda/Mission goals would re-escalate
// forever on the next tick.
export interface ApprovalGrant {
  escalationId: number;
  approvedBy: string;
  grantedAt: string;
  expiresAt: string;
  reason: string;
  resolution: string | null;
}

// How long a granted approval remains valid before it must be re-requested.
const APPROVAL_GRANT_TTL_MS = 60 * 60 * 1000; // 1 hour

export function readApprovalGrant(
  metadata: Record<string, unknown> | null | undefined,
): ApprovalGrant | null {
  const raw = (metadata ?? {})["approvalGrant"] as ApprovalGrant | undefined;
  if (!raw || typeof raw.expiresAt !== "string") return null;
  if (new Date(raw.expiresAt).getTime() < Date.now()) return null; // expired
  return raw;
}

export async function escalate(params: {
  goalId?: number | null;
  reason: string;
  severity?: EscalationSeverity;
  recommendedAction?: string;
  context?: Record<string, unknown>;
  suspendGoal?: boolean;
  state?: Record<string, unknown>;
}): Promise<GaaEscalation> {
  const [escalation] = await db
    .insert(gaaEscalationsTable)
    .values({
      goalId: params.goalId ?? null,
      reason: params.reason,
      severity: params.severity ?? "medium",
      recommendedAction: params.recommendedAction ?? null,
      context: params.context ?? {},
    })
    .returning();

  if (params.goalId) {
    if (params.suspendGoal !== false) {
      await db
        .update(gaaGoalsTable)
        .set({
          status: "suspended",
          blockedReason: params.reason,
          // Serialize the in-flight step state so the goal can be resumed
          // exactly where it left off once approved (parallel suspense queue).
          suspendedState: params.state ?? {},
          updatedAt: new Date(),
        })
        .where(eq(gaaGoalsTable.id, params.goalId));
    }

    await db.insert(gaaJournalTable).values({
      goalId: params.goalId,
      phase: "system",
      eventType: "escalation_raised",
      decision: "escalated",
      detail: params.reason,
      metadata: { escalationId: escalation.id, severity: escalation.severity },
    });

    await recordAuditEvent({
      goalId: params.goalId,
      eventType: "escalation",
      decision: "flag",
      detail: `Escalated: ${params.reason}`,
    });
  }

  return escalation;
}

export async function listEscalations(
  status?: string,
): Promise<GaaEscalation[]> {
  const query = db.select().from(gaaEscalationsTable);
  if (status) {
    return query
      .where(eq(gaaEscalationsTable.status, status))
      .orderBy(desc(gaaEscalationsTable.createdAt));
  }
  return query.orderBy(desc(gaaEscalationsTable.createdAt)).limit(200);
}

/**
 * Resolve an escalation. The human decides to approve (resume), redirect
 * (re-plan), or abort (fail) the underlying goal.
 */
export async function resolveEscalation(params: {
  escalationId: number;
  decision: "approved" | "redirected" | "aborted";
  resolvedBy: string;
  resolution?: string;
}): Promise<GaaEscalation | null> {
  const [escalation] = await db
    .select()
    .from(gaaEscalationsTable)
    .where(eq(gaaEscalationsTable.id, params.escalationId));
  if (!escalation) return null;

  const [updated] = await db
    .update(gaaEscalationsTable)
    .set({
      status: params.decision,
      resolution: params.resolution ?? null,
      resolvedBy: params.resolvedBy,
      resolvedAt: new Date(),
    })
    .where(eq(gaaEscalationsTable.id, params.escalationId))
    .returning();

  if (escalation.goalId) {
    const nextStatus =
      params.decision === "approved"
        ? "active"
        : params.decision === "redirected"
          ? "pending"
          : "failed";

    // Load the goal so we can merge (not clobber) its metadata.
    const [goal] = await db
      .select()
      .from(gaaGoalsTable)
      .where(eq(gaaGoalsTable.id, escalation.goalId));
    const metadata: Record<string, unknown> = { ...(goal?.metadata ?? {}) };

    if (params.decision === "approved") {
      // Mint a one-shot, time-boxed approval artifact the engine consumes to
      // authorise exactly one guarded execution past the mode gate.
      const grant: ApprovalGrant = {
        escalationId: params.escalationId,
        approvedBy: params.resolvedBy,
        grantedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + APPROVAL_GRANT_TTL_MS).toISOString(),
        reason: escalation.reason,
        resolution: params.resolution ?? null,
      };
      metadata["approvalGrant"] = grant;
    } else {
      // Redirected / aborted: revoke any stale grant.
      delete metadata["approvalGrant"];
    }

    await db
      .update(gaaGoalsTable)
      .set({
        status: nextStatus,
        blockedReason: params.decision === "aborted" ? escalation.reason : null,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(gaaGoalsTable.id, escalation.goalId));

    await db.insert(gaaJournalTable).values({
      goalId: escalation.goalId,
      phase: "resume",
      eventType: "escalation_resolved",
      decision: params.decision,
      detail: `Resolved by ${params.resolvedBy}: ${params.resolution ?? params.decision}`,
      metadata: { escalationId: params.escalationId },
    });

    // Audit the human decision so every approval transition is on the record.
    await recordAuditEvent({
      goalId: escalation.goalId,
      eventType: "plan_decision",
      decision: params.decision === "approved" ? "allow" : "block",
      compliancePassed: params.decision === "approved",
      detail:
        params.decision === "approved"
          ? `Human approval granted by ${params.resolvedBy} for escalation #${params.escalationId}.`
          : `Escalation #${params.escalationId} ${params.decision} by ${params.resolvedBy}.`,
    });
  }

  return updated;
}

export async function countOpenEscalations(): Promise<number> {
  const rows = await db
    .select({ id: gaaEscalationsTable.id })
    .from(gaaEscalationsTable)
    .where(and(eq(gaaEscalationsTable.status, "open")));
  return rows.length;
}
