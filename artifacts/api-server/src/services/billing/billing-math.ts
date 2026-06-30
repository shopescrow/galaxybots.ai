/**
 * Pure billing math — no DB, Stripe, or email dependencies.
 *
 * Exported so both production modules and the test suite import the *same*
 * implementation.  If this module's behaviour changes, the tests catch it.
 */

// ─── Invoice composition ─────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOverage(
  usedCredits: number,
  includedCredits: number,
  overageRatePerCredit: number,
): number {
  const overageCredits = Math.max(0, usedCredits - includedCredits);
  return round2(overageCredits * overageRatePerCredit);
}

export function computeGrandTotal(
  basePrice: number,
  addonSubtotal: number,
  overageSubtotal: number,
  taxRate: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(basePrice + addonSubtotal + overageSubtotal);
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

// ─── Proration ───────────────────────────────────────────────────────────────

export function computeProration(
  currentMonthlyPrice: number,
  newMonthlyPrice: number,
  cycleStart: Date,
  cycleEnd: Date,
  now: Date,
): number {
  if (newMonthlyPrice <= currentMonthlyPrice) return 0;
  const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 864e5));
  const remainingDays = Math.max(0, Math.round((cycleEnd.getTime() - now.getTime()) / 864e5));
  return round2((newMonthlyPrice - currentMonthlyPrice) * (remainingDays / totalDays));
}

// ─── Usage attribution ───────────────────────────────────────────────────────

export function allocateUsageByBot(
  totalCredits: number,
  botWeights: { botId: number; weight: number }[],
): { botId: number; credits: number }[] {
  const totalWeight = botWeights.reduce((s, b) => s + b.weight, 0);
  if (totalWeight === 0 || botWeights.length === 0) return [];
  let allocated = 0;
  return botWeights.map((b, idx) => {
    const isLast = idx === botWeights.length - 1;
    const credits = isLast
      ? totalCredits - allocated
      : Math.round((b.weight / totalWeight) * totalCredits);
    allocated += credits;
    return { botId: b.botId, credits };
  });
}

// ─── Off-session charge → invoice status state machine ───────────────────────

export type InvoiceStatus = "draft" | "finalized" | "paid" | "failed" | "pending_3ds" | "void";

export interface OffSessionChargeResult {
  success: boolean;
  paymentIntentId?: string;
  status?: string;
}

export function applyChargeOutcome(
  current: InvoiceStatus,
  result: OffSessionChargeResult,
): { status: InvoiceStatus; paidAt: boolean; piId: string | null } {
  if (result.success) {
    return { status: "paid", paidAt: true, piId: result.paymentIntentId ?? null };
  }
  if (result.status === "requires_action" || result.status === "requires_payment_method") {
    return { status: "pending_3ds", paidAt: false, piId: result.paymentIntentId ?? null };
  }
  if (result.paymentIntentId) {
    return { status: "failed", paidAt: false, piId: result.paymentIntentId };
  }
  // No PI returned (Stripe not configured or no saved payment method) — leave as-is.
  return { status: current, paidAt: false, piId: null };
}

// ─── Dunning step scheduling ──────────────────────────────────────────────────

export interface DunningStepDef {
  step: number;
  daysAfterIssue: number;
  retryCharge: boolean;
  restrict?: boolean;
  cancel?: boolean;
}

export const DUNNING_STEPS: DunningStepDef[] = [
  { step: 1, daysAfterIssue: 0,  retryCharge: false },
  { step: 2, daysAfterIssue: 3,  retryCharge: true  },
  { step: 3, daysAfterIssue: 7,  retryCharge: true  },
  { step: 4, daysAfterIssue: 14, retryCharge: false, restrict: true },
  { step: 5, daysAfterIssue: 21, retryCharge: false, cancel: true  },
];

export function isDunningStepDue(issuedAt: Date, daysAfterIssue: number, now: Date): boolean {
  const dueAt = new Date(issuedAt.getTime() + daysAfterIssue * 24 * 60 * 60 * 1000);
  return now.getTime() >= dueAt.getTime();
}

export function getNextDunningStep(
  currentStep: number,
  issuedAt: Date,
  now: Date,
): DunningStepDef | null {
  const nextDef = DUNNING_STEPS.find((s) => s.step === currentStep + 1);
  if (!nextDef) return null;
  return isDunningStepDue(issuedAt, nextDef.daysAfterIssue, now) ? nextDef : null;
}

export function getSubscriptionOutcomeForStep(
  stepDef: DunningStepDef,
): "active" | "restricted" | "cancelled" {
  if (stepDef.cancel) return "cancelled";
  if (stepDef.restrict) return "restricted";
  return "active";
}

// ─── Cycle-close eligibility ──────────────────────────────────────────────────

export function shouldCloseCycle(
  cycleEnd: Date,
  now: Date,
  existingInvoiceId: number | null,
  force = false,
): { close: boolean; reason?: string } {
  if (!force && cycleEnd.getTime() > now.getTime()) {
    return { close: false, reason: "cycle has not ended" };
  }
  if (existingInvoiceId !== null) {
    return { close: false, reason: "already invoiced" };
  }
  return { close: true };
}

// ─── Month arithmetic ─────────────────────────────────────────────────────────

export function addOneMonth(d: Date): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
}
