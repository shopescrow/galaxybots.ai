import {
  db,
  selfModificationsTable,
  gaaEscalationsTable,
  gaaAuditEventsTable,
  type SelfModification,
} from "@workspace/db";
import { eq, and, desc, lte, inArray } from "drizzle-orm";
import { evaluatePromotion } from "./guardrails";
import { isKillSwitchActive } from "./config";

// ---------------------------------------------------------------------------
// Safe self-modification framework. The agent may PROPOSE changes to its own
// operating parameters (tool policies, role definitions, prompt additions), but
// every change passes through a governed lifecycle:
//
//   propose → governance gate → shadow-test → promote | reject | rollback
//
// Governance gate: high-risk changes and anything touching the Constitution or
// governance itself are HUMAN-GATED (an escalation is raised and the change
// waits). Lower-risk changes enter shadow testing automatically.
// Shadow-test: the change runs in shadow and accumulates success metrics; it is
// only promoted if it clears the fidelity + margin guardrails with enough
// evidence. A global kill switch halts all promotions and can roll back live
// changes. Everything is appended to an immutable audit trail.
// ---------------------------------------------------------------------------

const SHADOW_PERIOD_MS = 24 * 60 * 60 * 1000; // minimum shadow soak

export type ModType = "tool_policy" | "role_definition" | "prompt_addition";
export type RiskLevel = "low" | "medium" | "high";

const CONSTITUTION_KEYWORDS = [
  "constitution",
  "governance",
  "guardrail",
  "kill switch",
  "permission",
  "compliance",
  "safety",
];

interface GovernanceAssessment {
  riskLevel: RiskLevel;
  humanGated: boolean;
  reason: string;
}

/**
 * Assess a proposed modification. Role-definition changes are inherently
 * higher-risk; any change whose text touches the Constitution / governance /
 * safety surface is forced to human gating regardless of computed risk.
 */
function assessGovernance(params: {
  modType: ModType;
  title: string;
  rationale: string;
  proposal: Record<string, unknown>;
  riskLevel?: RiskLevel;
  evidenceCount: number;
}): GovernanceAssessment {
  const haystack =
    `${params.title} ${params.rationale} ${JSON.stringify(params.proposal)}`.toLowerCase();
  const touchesConstitution = CONSTITUTION_KEYWORDS.some((k) => haystack.includes(k));

  let riskLevel: RiskLevel = params.riskLevel ?? "low";
  if (params.modType === "role_definition") riskLevel = riskLevel === "low" ? "medium" : riskLevel;
  if (params.evidenceCount < 3) riskLevel = riskLevel === "low" ? "medium" : riskLevel;
  if (touchesConstitution) riskLevel = "high";

  const humanGated = riskLevel === "high" || touchesConstitution;
  return {
    riskLevel,
    humanGated,
    reason: touchesConstitution
      ? "Touches Constitution/governance — human approval required"
      : humanGated
        ? "High-risk change — human approval required"
        : "Low/medium risk — eligible for autonomous shadow testing",
  };
}

async function appendAudit(
  mod: SelfModification,
  event: string,
  detail: string,
): Promise<Array<{ at: string; event: string; detail: string }>> {
  const trail = [...(mod.auditTrail ?? []), { at: new Date().toISOString(), event, detail }];
  await db.insert(gaaAuditEventsTable).values({
    eventType: "self_modification",
    decision: event.includes("block") || event.includes("reject") ? "block" : "allow",
    detail: `[self-mod #${mod.id}] ${event}: ${detail}`,
  });
  return trail;
}

/**
 * Propose a self-modification. Runs the governance gate; human-gated proposals
 * raise an escalation and wait, others enter shadow testing automatically.
 */
export async function proposeSelfModification(params: {
  modType: ModType;
  title: string;
  rationale: string;
  proposal: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  botId?: number | null;
  clientId?: number | null;
  riskLevel?: RiskLevel;
  proposedBy?: string;
}): Promise<SelfModification> {
  const evidenceCount =
    typeof params.evidence?.sampleN === "number" ? (params.evidence.sampleN as number) : 0;
  const gov = assessGovernance({
    modType: params.modType,
    title: params.title,
    rationale: params.rationale,
    proposal: params.proposal,
    riskLevel: params.riskLevel,
    evidenceCount,
  });

  const [created] = await db
    .insert(selfModificationsTable)
    .values({
      botId: params.botId ?? null,
      clientId: params.clientId ?? null,
      modType: params.modType,
      title: params.title,
      proposal: params.proposal,
      rationale: params.rationale,
      evidence: params.evidence ?? {},
      riskLevel: gov.riskLevel,
      humanGated: gov.humanGated,
      status: gov.humanGated ? "proposed" : "shadow_testing",
      governanceDecision: gov.reason,
      shadowPeriodEnd: gov.humanGated ? null : new Date(Date.now() + SHADOW_PERIOD_MS),
      proposedBy: params.proposedBy ?? "self_actualization",
    })
    .returning();

  const trail = await appendAudit(
    created,
    gov.humanGated ? "proposed_human_gated" : "entered_shadow",
    gov.reason,
  );
  await db
    .update(selfModificationsTable)
    .set({ auditTrail: trail, updatedAt: new Date() })
    .where(eq(selfModificationsTable.id, created.id));

  if (gov.humanGated) {
    await db.insert(gaaEscalationsTable).values({
      reason: `Self-modification requires approval: ${params.title}`,
      severity: gov.riskLevel === "high" ? "high" : "medium",
      recommendedAction: `Review proposed ${params.modType} change. Rationale: ${params.rationale}`,
      context: {
        selfModificationId: created.id,
        modType: params.modType,
        proposal: params.proposal,
      },
      status: "open",
    });
  }

  return { ...created, auditTrail: trail };
}

/**
 * Approve a human-gated modification, moving it into shadow testing.
 */
export async function approveSelfModification(
  modId: number,
  reviewedBy: string,
): Promise<SelfModification | null> {
  const [mod] = await db
    .select()
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.id, modId));
  if (!mod || mod.status !== "proposed") return null;

  const trail = await appendAudit(mod, "human_approved", `Approved by ${reviewedBy}`);
  const [updated] = await db
    .update(selfModificationsTable)
    .set({
      status: "shadow_testing",
      reviewedBy,
      shadowPeriodEnd: new Date(Date.now() + SHADOW_PERIOD_MS),
      auditTrail: trail,
      updatedAt: new Date(),
    })
    .where(eq(selfModificationsTable.id, modId))
    .returning();
  return updated;
}

/**
 * Reject a modification (human or automatic).
 */
export async function rejectSelfModification(
  modId: number,
  reason: string,
  reviewedBy = "system",
): Promise<SelfModification | null> {
  const [mod] = await db
    .select()
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.id, modId));
  if (!mod) return null;
  const trail = await appendAudit(mod, "rejected", reason);
  const [updated] = await db
    .update(selfModificationsTable)
    .set({ status: "rejected", reviewedBy, governanceDecision: reason, auditTrail: trail, updatedAt: new Date() })
    .where(eq(selfModificationsTable.id, modId))
    .returning();
  return updated;
}

/**
 * Record one shadow observation (a shadow-mode run's success/failure) for a
 * modification under test.
 */
export async function recordShadowObservation(
  modId: number,
  shadowSuccess: boolean,
  controlSuccess: boolean,
): Promise<void> {
  const [mod] = await db
    .select()
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.id, modId));
  if (!mod || mod.status !== "shadow_testing") return;
  const m = mod.shadowMetrics ?? {
    shadowSuccesses: 0,
    shadowSampleN: 0,
    controlSuccesses: 0,
    controlSampleN: 0,
  };
  await db
    .update(selfModificationsTable)
    .set({
      shadowMetrics: {
        shadowSuccesses: m.shadowSuccesses + (shadowSuccess ? 1 : 0),
        shadowSampleN: m.shadowSampleN + 1,
        controlSuccesses: m.controlSuccesses + (controlSuccess ? 1 : 0),
        controlSampleN: m.controlSampleN + 1,
      },
      updatedAt: new Date(),
    })
    .where(eq(selfModificationsTable.id, modId));
}

export interface ShadowEvaluation {
  modId: number;
  promoted: boolean;
  blocked: boolean;
  reasons: string[];
}

/**
 * Evaluate all shadow-testing modifications whose soak period has elapsed and
 * promote those that clear the guardrails. The kill switch blocks promotions.
 */
export async function evaluateShadowModifications(): Promise<ShadowEvaluation[]> {
  const killed = await isKillSwitchActive();
  const due = await db
    .select()
    .from(selfModificationsTable)
    .where(
      and(
        eq(selfModificationsTable.status, "shadow_testing"),
        lte(selfModificationsTable.shadowPeriodEnd, new Date()),
      ),
    );

  const results: ShadowEvaluation[] = [];
  for (const mod of due) {
    const m = mod.shadowMetrics ?? {
      shadowSuccesses: 0,
      shadowSampleN: 0,
      controlSuccesses: 0,
      controlSampleN: 0,
    };
    const baseline = m.controlSampleN > 0 ? m.controlSuccesses / m.controlSampleN : 0.5;
    const candidate = m.shadowSampleN > 0 ? m.shadowSuccesses / m.shadowSampleN : 0;

    if (killed) {
      const trail = await appendAudit(mod, "promotion_blocked", "Kill switch active");
      await db
        .update(selfModificationsTable)
        .set({ auditTrail: trail, updatedAt: new Date() })
        .where(eq(selfModificationsTable.id, mod.id));
      results.push({ modId: mod.id, promoted: false, blocked: true, reasons: ["Kill switch active"] });
      continue;
    }

    const gate = evaluatePromotion({
      baseline,
      candidate,
      costCents: 0,
      budgetCents: Number.MAX_SAFE_INTEGER,
      sampleN: m.shadowSampleN,
    });

    if (gate.approved) {
      const trail = await appendAudit(mod, "promoted", gate.reasons.join("; "));
      await db
        .update(selfModificationsTable)
        .set({
          status: "promoted",
          promotedAt: new Date(),
          governanceDecision: gate.reasons.join("; "),
          auditTrail: trail,
          updatedAt: new Date(),
        })
        .where(eq(selfModificationsTable.id, mod.id));
      results.push({ modId: mod.id, promoted: true, blocked: false, reasons: gate.reasons });
    } else {
      const trail = await appendAudit(mod, "rejected_guardrail", gate.reasons.join("; "));
      await db
        .update(selfModificationsTable)
        .set({
          status: "rejected",
          governanceDecision: gate.reasons.join("; "),
          auditTrail: trail,
          updatedAt: new Date(),
        })
        .where(eq(selfModificationsTable.id, mod.id));
      results.push({ modId: mod.id, promoted: false, blocked: false, reasons: gate.reasons });
    }
  }
  return results;
}

/**
 * Roll back a promoted modification (kill-switch / regression / manual).
 */
export async function rollbackSelfModification(
  modId: number,
  reason: string,
): Promise<SelfModification | null> {
  const [mod] = await db
    .select()
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.id, modId));
  if (!mod) return null;
  const trail = await appendAudit(mod, "rolled_back", reason);
  const [updated] = await db
    .update(selfModificationsTable)
    .set({
      status: "rolled_back",
      rolledBackAt: new Date(),
      rollbackReason: reason,
      auditTrail: trail,
      updatedAt: new Date(),
    })
    .where(eq(selfModificationsTable.id, modId))
    .returning();
  return updated;
}

/**
 * Emergency rollback of every currently-promoted modification. Invoked when the
 * kill switch is engaged.
 */
export async function rollbackAllPromoted(reason = "Kill switch engaged"): Promise<number> {
  const promoted = await db
    .select({ id: selfModificationsTable.id })
    .from(selfModificationsTable)
    .where(eq(selfModificationsTable.status, "promoted"));
  for (const m of promoted) {
    await rollbackSelfModification(m.id, reason);
  }
  return promoted.length;
}

/** List modifications, optionally filtered by status, for the console. */
export async function listSelfModifications(statuses?: string[], limit = 100) {
  const q = db.select().from(selfModificationsTable);
  if (statuses && statuses.length > 0) {
    return q
      .where(inArray(selfModificationsTable.status, statuses))
      .orderBy(desc(selfModificationsTable.createdAt))
      .limit(limit);
  }
  return q.orderBy(desc(selfModificationsTable.createdAt)).limit(limit);
}
