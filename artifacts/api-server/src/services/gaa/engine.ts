import {
  db,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaGoal,
} from "@workspace/db";
import { eq, and, inArray, or, isNull, lte, gte, desc } from "drizzle-orm";
import { checkConstitution } from "./constitution";
import { runComplianceGate, recordAuditEvent } from "./compliance-gate";
import { classify } from "./mode-classifier";
import { runChallenger } from "./challenger";
import { recordAction } from "./action-ledger";
import { recordBurn, canAfford } from "./cost-envelope";
import { escalate, readApprovalGrant, type ApprovalGrant } from "./escalation";
import { capabilityPreflight, recordFailureAndMaybeDeadLetter } from "./dead-letter";
import { learnFromOutcome, computeOutcomeBias, scoreWithBias } from "./learning-loop";

// ---------------------------------------------------------------------------
// The long-horizon execution engine — the heart of the GAA. For each runnable
// goal it enforces the immutable plan-time pipeline:
//
//   PLAN → Constitution Check → KiloPro Gate → Reversibility Score → EXECUTE
//
// Autonomous/reversible/in-budget steps execute directly; medium/high-risk
// steps are escalated instead of executed. Every transition is journalled.
// ---------------------------------------------------------------------------

const PER_STEP_COST_CENTS = 5; // notional reasoning cost per advance
const PROGRESS_PER_STEP = 25;
const MAX_GOALS_PER_TICK = 5;

function journal(
  goalId: number,
  phase: string,
  eventType: string,
  decision: string,
  detail: string,
  metadata: Record<string, unknown> = {},
) {
  return db.insert(gaaJournalTable).values({
    goalId,
    phase,
    eventType,
    decision,
    detail,
    metadata,
  });
}

async function selectRunnableGoals(): Promise<GaaGoal[]> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(gaaGoalsTable)
    .where(
      and(
        inArray(gaaGoalsTable.status, ["pending", "active"]),
        or(isNull(gaaGoalsTable.expiresAt), gte(gaaGoalsTable.expiresAt, now)),
      ),
    )
    .orderBy(gaaGoalsTable.priority, desc(gaaGoalsTable.updatedAt))
    .limit(50);

  // Expire time-boxed goals whose window has passed.
  const expired = await db
    .select()
    .from(gaaGoalsTable)
    .where(
      and(
        inArray(gaaGoalsTable.status, ["pending", "active"]),
        lte(gaaGoalsTable.expiresAt, now),
      ),
    );
  for (const g of expired) {
    await db
      .update(gaaGoalsTable)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(gaaGoalsTable.id, g.id));
    await journal(g.id, "system", "goal_expired", "info", "Time-boxed window elapsed.");
  }

  const bias = await computeOutcomeBias();
  return candidates
    .map((g) => ({ g, score: g.priority * 100 - scoreWithBias(g, bias) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_GOALS_PER_TICK)
    .map((x) => x.g);
}

export interface StepResult {
  goalId: number;
  outcome:
    | "executed"
    | "escalated"
    | "blocked"
    | "completed"
    | "preflight_failed"
    | "budget_exhausted";
  detail: string;
}

/**
 * Run the full plan-time pipeline for one goal and execute (or escalate) a
 * single step of progress.
 */
export async function runGoalStep(goal: GaaGoal): Promise<StepResult> {
  const involvesPii = /\b(client|customer|user|email|contact|personal|pii)\b/i.test(
    `${goal.title} ${goal.description ?? ""}`,
  );

  // --- 0. Capability pre-flight ---------------------------------------------
  const pre = capabilityPreflight(goal);
  await db
    .update(gaaGoalsTable)
    .set({ readinessScore: pre.readinessScore, updatedAt: new Date() })
    .where(eq(gaaGoalsTable.id, goal.id));
  if (!pre.ready) {
    await db
      .update(gaaGoalsTable)
      .set({ status: "blocked", blockedReason: `Missing capabilities: ${pre.missing.join(", ")}`, updatedAt: new Date() })
      .where(eq(gaaGoalsTable.id, goal.id));
    await journal(goal.id, "plan", "preflight_failed", "blocked", `Missing capabilities: ${pre.missing.join(", ")}`);
    return { goalId: goal.id, outcome: "preflight_failed", detail: pre.missing.join(", ") };
  }

  // --- 1. PLAN --------------------------------------------------------------
  // A valid, unconsumed human-approval artifact authorises ONE guarded
  // execution past the mode gate (and any hard constitution exception). It is
  // cleared after the step so it can never authorise a second execution.
  const grant: ApprovalGrant | null = readApprovalGrant(goal.metadata);
  await journal(goal.id, "plan", "plan_started", "info", `Planning next step for "${goal.title}".`, {
    approved: Boolean(grant),
    approvalEscalationId: grant?.escalationId ?? null,
  });
  await recordAuditEvent({
    goalId: goal.id,
    eventType: "plan_decision",
    decision: "allow",
    purpose: goal.purpose,
    piiInvolved: involvesPii,
    detail: grant
      ? `Planning step under human approval #${grant.escalationId} (by ${grant.approvedBy}).`
      : `Planning autonomous step for "${goal.title}".`,
  });

  // --- 2. Constitution Check ------------------------------------------------
  const constitution = await checkConstitution({
    title: goal.title,
    description: goal.description,
    purpose: goal.purpose,
    involvesPii,
  });
  if (!constitution.passed) {
    const reason = `Constitution violation: ${constitution.violations.map((v) => v.principle).join("; ")}`;
    // A human-approved exception may authorise a hard-violation step (e.g. an
    // irreversible action explicitly signed off). Without a grant, block.
    if (!grant) {
      await journal(goal.id, "constitution_check", "constitution_blocked", "blocked", reason, {
        violations: constitution.violations,
      });
      await recordAuditEvent({
        goalId: goal.id,
        eventType: "plan_decision",
        decision: "block",
        compliancePassed: false,
        violations: constitution.violations.map((v) => v.principle),
        detail: reason,
      });
      await escalate({
        goalId: goal.id,
        reason,
        severity: "high",
        recommendedAction: "Revise the goal to comply with the constitution, or approve an exception.",
        context: { violations: constitution.violations },
        state: { phase: "constitution_check", violations: constitution.violations },
      });
      return { goalId: goal.id, outcome: "escalated", detail: reason };
    }
    await journal(goal.id, "constitution_check", "constitution_override", "proceed",
      `Hard violation authorised by human approval #${grant.escalationId}: ${reason}`, {
        violations: constitution.violations,
        approvalEscalationId: grant.escalationId,
      });
    await recordAuditEvent({
      goalId: goal.id,
      eventType: "plan_decision",
      decision: "flag",
      compliancePassed: true,
      violations: constitution.violations.map((v) => v.principle),
      detail: `Constitution exception executed under human approval #${grant.escalationId}.`,
    });
  } else {
    await journal(goal.id, "constitution_check", "constitution_passed", "passed", `Checked ${constitution.evaluated} principles.`);
    await recordAuditEvent({
      goalId: goal.id,
      eventType: "plan_decision",
      decision: "allow",
      compliancePassed: true,
      detail: `Constitution check passed (${constitution.evaluated} principles).`,
    });
  }

  // --- 3. KiloPro Compliance Gate -------------------------------------------
  // The tool that will actually run the step MUST be declared so the gate can
  // enforce the PII allow-list against it (fail-closed when PII is involved).
  const EXECUTION_TOOL = "gaa.advance";
  const gate = await runComplianceGate({
    goalId: goal.id,
    title: goal.title,
    purpose: goal.purpose,
    involvesPii,
    toolName: EXECUTION_TOOL,
  });
  if (!gate.passed) {
    const reason = `KiloPro gate blocked: ${gate.violations.join("; ")}`;
    await journal(goal.id, "compliance_gate", "compliance_blocked", "blocked", reason);
    await escalate({
      goalId: goal.id,
      reason,
      severity: "high",
      recommendedAction: "Declare a lawful purpose / attach a compliance record, then retry.",
      context: { violations: gate.violations },
    });
    return { goalId: goal.id, outcome: "escalated", detail: reason };
  }
  await journal(goal.id, "compliance_gate", "compliance_passed", "passed", "KiloPro gate cleared.");

  // --- 4. Reversibility Score + Mode classification -------------------------
  const cls = classify({
    title: goal.title,
    description: goal.description,
    involvesPii,
    costCents: PER_STEP_COST_CENTS,
    costEnvelopeCents: goal.costEnvelopeCents,
    impactScore: goal.riskScore,
  });
  await db
    .update(gaaGoalsTable)
    .set({
      reversibilityScore: cls.reversibilityScore,
      riskScore: cls.riskScore,
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, goal.id));
  await journal(goal.id, "reversibility", "classified", "info", `${cls.mode} — ${cls.rationale}`, {
    reversibilityScore: cls.reversibilityScore,
    riskScore: cls.riskScore,
    mode: cls.mode,
  });

  // --- 4b. Budget governor --------------------------------------------------
  const afford = await canAfford(goal.id, PER_STEP_COST_CENTS);
  if (!afford.allowed) {
    await journal(goal.id, "execute", "budget_exhausted", "blocked", "Cost envelope exhausted.");
    await escalate({
      goalId: goal.id,
      reason: "Cost envelope exhausted.",
      severity: "medium",
      recommendedAction: "Increase the goal's budget or mark it complete.",
      context: { burn: afford.state },
    });
    return { goalId: goal.id, outcome: "budget_exhausted", detail: "budget exhausted" };
  }

  // --- 5. Mode gate: only autonomous executes without humans ----------------
  // Agenda/Mission goals require explicit human approval. A valid approval
  // grant lets the goal proceed for exactly one guarded step (consumed below);
  // otherwise it is escalated and suspended until a human resolves it.
  if (cls.mode !== "autonomous") {
    if (!grant) {
      await escalate({
        goalId: goal.id,
        reason: `Step requires ${cls.mode} mode (risk ${cls.riskScore}, reversibility ${cls.reversibilityScore}).`,
        severity: cls.mode === "mission" ? "high" : "medium",
        recommendedAction:
          cls.mode === "mission"
            ? "Explicit human approval required before execution."
            : "Review on the agenda and approve to proceed.",
        context: { classification: cls },
        state: { phase: "mode_gate", classification: cls, progressScore: goal.progressScore },
      });
      return { goalId: goal.id, outcome: "escalated", detail: `${cls.mode} mode requires human review.` };
    }
    await journal(goal.id, "execute", "approved_execution", "proceed",
      `${cls.mode}-mode step authorised by human approval #${grant.escalationId} (by ${grant.approvedBy}).`, {
        approvalEscalationId: grant.escalationId,
        mode: cls.mode,
      });
    await recordAuditEvent({
      goalId: goal.id,
      eventType: "tool_execution",
      decision: "allow",
      detail: `${cls.mode}-mode execution authorised under human approval #${grant.escalationId}.`,
    });
  }

  // --- 5b. Adversarial challenger (red team) on higher-risk autonomous steps -
  if (cls.riskScore >= 50) {
    const challenge = await runChallenger({
      title: goal.title,
      description: goal.description,
      toolName: null,
      reversibilityScore: cls.reversibilityScore,
      riskScore: cls.riskScore,
      involvesPii,
    });
    await journal(goal.id, "execute", "challenger_pass", challenge.blocking ? "blocked" : "passed",
      challenge.risks.join("; ") || "No blocking risks.", { method: challenge.method });
    // A human approval overrides a challenger block (the risk was already
    // reviewed and signed off); without a grant, escalate.
    if (challenge.blocking && !grant) {
      await escalate({
        goalId: goal.id,
        reason: `Challenger flagged blocking risk: ${challenge.risks.join("; ")}`,
        severity: "high",
        recommendedAction: challenge.recommendation,
        context: { challenge },
        state: { phase: "challenger", challenge },
      });
      return { goalId: goal.id, outcome: "escalated", detail: "challenger blocked" };
    }
  }

  // --- 6. EXECUTE (reversible autonomous step) ------------------------------
  await recordAction({
    goalId: goal.id,
    action: `Advance "${goal.title}"`,
    toolName: EXECUTION_TOOL,
    payload: { step: Math.floor(goal.progressScore / PROGRESS_PER_STEP) + 1, progressDelta: PROGRESS_PER_STEP },
    compensatingAction: "Revert progress increment and re-open the goal step.",
    reversibilityScore: cls.reversibilityScore,
  });
  await recordAuditEvent({
    goalId: goal.id,
    eventType: "tool_execution",
    decision: "allow",
    toolName: EXECUTION_TOOL,
    detail: `Executed autonomous step for "${goal.title}".`,
  });
  await recordBurn(goal.id, PER_STEP_COST_CENTS, grant ? "approved step" : "autonomous step");

  const newProgress = Math.min(100, goal.progressScore + PROGRESS_PER_STEP);
  const completed = newProgress >= 100;
  // Consume the one-shot approval grant (and clear any serialized suspense
  // state) so it can never authorise a second execution.
  const nextMetadata: Record<string, unknown> = { ...(goal.metadata ?? {}) };
  delete nextMetadata["approvalGrant"];
  await db
    .update(gaaGoalsTable)
    .set({
      status: completed ? "completed" : "active",
      progressScore: newProgress,
      metadata: nextMetadata,
      suspendedState: null,
      lastEvaluatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(gaaGoalsTable.id, goal.id));

  await journal(goal.id, "evaluate", completed ? "goal_completed" : "step_executed",
    "proceed", `Progress ${newProgress}%.`, { progress: newProgress });

  if (completed) {
    await learnFromOutcome({
      goalId: goal.id,
      outcome: "completed",
      summary: `Goal reached 100% across ${100 / PROGRESS_PER_STEP} autonomous steps.`,
    });
    return { goalId: goal.id, outcome: "completed", detail: "100% progress" };
  }

  return { goalId: goal.id, outcome: "executed", detail: `progress ${newProgress}%` };
}

export interface CycleSummary {
  processed: number;
  executed: number;
  escalated: number;
  blocked: number;
  completed: number;
  results: StepResult[];
}

export async function runEngineCycle(): Promise<CycleSummary> {
  const goals = await selectRunnableGoals();
  const results: StepResult[] = [];
  for (const goal of goals) {
    try {
      results.push(await runGoalStep(goal));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await journal(goal.id, "execute", "execution_failed", "blocked", msg);
      await learnFromOutcome({ goalId: goal.id, outcome: "failed", summary: msg }).catch(() => {});
      // Move the goal to blocked, and to dead-letter once it has failed too many
      // times, so a persistently-failing goal is never silently retried forever.
      const deadLettered = await recordFailureAndMaybeDeadLetter(goal).catch(() => false);
      results.push({
        goalId: goal.id,
        outcome: "blocked",
        detail: deadLettered ? `${msg} (dead-lettered)` : msg,
      });
    }
  }
  return {
    processed: results.length,
    executed: results.filter((r) => r.outcome === "executed").length,
    escalated: results.filter((r) => r.outcome === "escalated").length,
    blocked: results.filter((r) => r.outcome === "blocked" || r.outcome === "preflight_failed").length,
    completed: results.filter((r) => r.outcome === "completed").length,
    results,
  };
}
