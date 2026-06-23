/**
 * Alignment Signal Harvester — automatic pipeline wiring.
 *
 * Runs daily. Harvests THREE streams of multi-stakeholder alignment signals:
 *
 * 1. Owner signals  — resolved pending_approvals where a human modified or
 *    rejected an AI tool proposal. Deduped by unique constraint on approval_id.
 *
 * 2. Client signals — session_outcomes with client-facing failure categories
 *    (quality_gate_failed, timeout, tool_failure). Deduped via escalationTicketId
 *    fingerprint.
 *
 * 3. Downstream signals — clientHealthEventsTable negative events (churn_risk,
 *    escalation, nps_negative). These represent indirect, downstream system
 *    signals of misalignment. Deduped via escalationTicketId.
 *
 * Newly created alignment_signals feed the weekly alignment-pattern-extraction
 * job which clusters them by stakeholder-tier-weighted category and derives
 * soft rules.
 */

import {
  db,
  pendingApprovalsTable,
  alignmentSignalsTable,
  sessionOutcomesTable,
  clientHealthEventsTable,
} from "@workspace/db";
import { eq, and, gte, isNotNull, ne, sql } from "drizzle-orm";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let lastHarvestRun = 0;

function computeDiffSummary(
  original: Record<string, unknown>,
  modified: Record<string, unknown> | null,
): string {
  if (!modified) return "Tool call rejected without modification.";
  const origKeys = Object.keys(original);
  const diffParts: string[] = [];
  for (const key of origKeys) {
    const origVal = JSON.stringify(original[key]);
    const modVal = JSON.stringify(modified[key]);
    if (origVal !== modVal) {
      diffParts.push(`${key}: ${origVal} → ${modVal}`);
    }
  }
  const newKeys = Object.keys(modified).filter((k) => !origKeys.includes(k));
  for (const key of newKeys) {
    diffParts.push(`+${key}: ${JSON.stringify(modified[key])}`);
  }
  return diffParts.length > 0
    ? diffParts.slice(0, 5).join("; ")
    : "Approved without modification";
}

export async function runAlignmentHarvester() {
  const now = Date.now();
  if (now - lastHarvestRun < ONE_DAY_MS) return;
  lastHarvestRun = now;

  console.log("[alignment-harvester] Running daily alignment signal harvest...");

  const since = new Date(now - 7 * 24 * 60 * 60 * 1000);

  // ── Stream 1: Owner approvals ─────────────────────────────────────────────
  // Unique constraint on approval_id prevents duplicates across runs.
  const resolvedApprovals = await db
    .select({
      id: pendingApprovalsTable.id,
      toolName: pendingApprovalsTable.toolName,
      toolInput: pendingApprovalsTable.toolInput,
      toolResult: pendingApprovalsTable.toolResult,
      status: pendingApprovalsTable.status,
      rejectionReason: pendingApprovalsTable.rejectionReason,
      resolvedAt: pendingApprovalsTable.resolvedAt,
    })
    .from(pendingApprovalsTable)
    .where(
      and(
        gte(pendingApprovalsTable.resolvedAt, since),
        ne(pendingApprovalsTable.status, "pending"),
      ),
    )
    .limit(500);

  let ownerSignalsCreated = 0;
  for (const approval of resolvedApprovals) {
    try {
      const originalProposal = (approval.toolInput ?? {}) as Record<string, unknown>;
      const humanEdit = approval.status === "approved"
        ? (approval.toolResult ?? {}) as Record<string, unknown>
        : {};
      const diffSummary = approval.status === "rejected"
        ? `Rejected: ${approval.rejectionReason ?? "no reason given"}`
        : computeDiffSummary(originalProposal, Object.keys(humanEdit).length > 0 ? humanEdit : null);

      let patternCategory = "tool_override";
      if (approval.status === "rejected") patternCategory = "tool_rejection";
      else if (Object.keys(humanEdit).length === 0) patternCategory = "no_change_approval";

      await db.insert(alignmentSignalsTable).values({
        approvalId: approval.id,
        originalProposal,
        humanEdit,
        diffSummary,
        patternCategory,
        sourceStakeholder: "owner",
        softRuleStatus: "pending",
      }).onConflictDoNothing();
      ownerSignalsCreated++;
    } catch {
      // Skip any unexpected insert errors
    }
  }

  // ── Stream 2: Client signals from session outcomes ────────────────────────
  // Deduped via escalationTicketId storing a deterministic fingerprint.
  const clientFrictionSessions = await db
    .select({
      sessionId: sessionOutcomesTable.sessionId,
      clientId: sessionOutcomesTable.clientId,
      terminationReason: sessionOutcomesTable.terminationReason,
      failureCategory: sessionOutcomesTable.failureCategory,
      outcomeSummary: sessionOutcomesTable.outcomeSummary,
    })
    .from(sessionOutcomesTable)
    .where(
      and(
        gte(sessionOutcomesTable.createdAt, since),
        isNotNull(sessionOutcomesTable.failureCategory),
      ),
    )
    .limit(200);

  let clientSignalsCreated = 0;
  for (const session of clientFrictionSessions) {
    const isClientFacing = ["quality_gate_failed", "timeout", "tool_failure"].includes(
      session.failureCategory ?? "",
    );
    if (!isClientFacing) continue;

    const fingerprint = `client-session-${session.sessionId}`;
    const existing = await db
      .select({ id: alignmentSignalsTable.id })
      .from(alignmentSignalsTable)
      .where(eq(alignmentSignalsTable.escalationTicketId, fingerprint))
      .limit(1);

    if (existing.length > 0) continue;

    try {
      await db.insert(alignmentSignalsTable).values({
        escalationTicketId: fingerprint,
        originalProposal: { sessionId: session.sessionId, clientId: session.clientId },
        humanEdit: { terminationReason: session.terminationReason, summary: session.outcomeSummary },
        diffSummary: `Client session failure: ${session.failureCategory}. ${session.outcomeSummary?.slice(0, 200) ?? ""}`,
        patternCategory: session.failureCategory ?? "unknown_failure",
        sourceStakeholder: "client",
        softRuleStatus: "pending",
      });
      clientSignalsCreated++;
    } catch {
      // Skip any unexpected insert errors
    }
  }

  // ── Stream 3: Downstream signals from client health events ───────────────
  // Health events with negative signals (churn_risk, nps_negative, escalation)
  // represent downstream system signals of misalignment. Lower tier than owner/client
  // but important for catching systemic issues.
  const DOWNSTREAM_NEGATIVE_SIGNALS = ["churn_risk", "nps_negative", "escalation", "sla_breach", "renewal_risk"];

  const downstreamEvents = await db
    .select({
      id: clientHealthEventsTable.id,
      clientId: clientHealthEventsTable.clientId,
      signal: clientHealthEventsTable.signal,
      value: clientHealthEventsTable.value,
      metadata: clientHealthEventsTable.metadata,
      recordedAt: clientHealthEventsTable.recordedAt,
    })
    .from(clientHealthEventsTable)
    .where(
      and(
        gte(clientHealthEventsTable.recordedAt, since),
        sql`${clientHealthEventsTable.signal} = ANY(${DOWNSTREAM_NEGATIVE_SIGNALS}::text[])`,
      ),
    )
    .limit(200);

  let downstreamSignalsCreated = 0;
  for (const event of downstreamEvents) {
    const fingerprint = `downstream-health-event-${event.id}`;
    const existing = await db
      .select({ id: alignmentSignalsTable.id })
      .from(alignmentSignalsTable)
      .where(eq(alignmentSignalsTable.escalationTicketId, fingerprint))
      .limit(1);

    if (existing.length > 0) continue;

    try {
      await db.insert(alignmentSignalsTable).values({
        escalationTicketId: fingerprint,
        originalProposal: { clientId: event.clientId, signal: event.signal },
        humanEdit: { value: event.value, metadata: event.metadata },
        diffSummary: `Downstream signal "${event.signal}" from client ${event.clientId}: value=${event.value}`,
        patternCategory: event.signal,
        sourceStakeholder: "downstream",
        softRuleStatus: "pending",
      });
      downstreamSignalsCreated++;
    } catch {
      // Skip any unexpected insert errors
    }
  }

  console.log(
    `[alignment-harvester] Harvested ${ownerSignalsCreated} owner, ${clientSignalsCreated} client, ${downstreamSignalsCreated} downstream signals.`,
  );
}
