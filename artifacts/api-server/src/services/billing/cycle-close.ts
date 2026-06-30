import {
  db,
  subscriptionPlansTable,
  accountSubscriptionsTable,
  invoicesTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, lte, sql, isNotNull } from "drizzle-orm";
import { finalizeInvoice } from "./invoice-builder.js";
import { ensureStripeCustomer, attemptOffSessionChargeForCustomer } from "./stripe-customer.js";
import { applyChargeOutcome, addOneMonth } from "./billing-math.js";

export interface CycleCloseResult {
  clientId: number;
  subscriptionId: number;
  invoiceId: number | null;
  invoiceNumber: string | null;
  total: number;
  skipped: boolean;
  reason?: string;
  chargeAttempted: boolean;
  charged: boolean;
  checkoutUrl?: string;
}

/**
 * Attempts an off-session Stripe charge for the given subscription/invoice.
 * Returns true when the charge succeeded and the invoice should be marked paid.
 * Falls back to a hosted checkout link on no saved PM or 3DS required.
 */
async function attemptOffSessionCharge(
  clientId: number,
  subscriptionId: number,
  invoiceId: number,
  invoiceNumber: string,
  amountDue: number,
): Promise<{ charged: boolean; checkoutUrl?: string }> {
  if (amountDue <= 0) return { charged: true };

  const customerId = await ensureStripeCustomer(subscriptionId, clientId);
  if (!customerId) {
    console.log(`[cycle-close] No Stripe configured for client ${clientId}, skipping charge`);
    return { charged: false };
  }

  const amountCents = Math.round(amountDue * 100);
  const result = await attemptOffSessionChargeForCustomer(
    customerId,
    amountCents,
    `Invoice ${invoiceNumber}`,
    { invoiceId: String(invoiceId), clientId: String(clientId) },
  );

  // Use the shared state machine from billing-math to determine the new status.
  const outcome = applyChargeOutcome("finalized", result);
  const piUpdate = outcome.piId ? { stripePaymentIntentId: outcome.piId } : {};

  if (outcome.status !== "finalized") {
    await db
      .update(invoicesTable)
      .set({
        status: outcome.status,
        ...(outcome.paidAt ? { paidAt: new Date() } : {}),
        ...piUpdate,
        updatedAt: new Date(),
      })
      .where(eq(invoicesTable.id, invoiceId));
  }
  // status === "finalized" means no PI returned (Stripe not configured or no PM) — leave as-is.

  return { charged: result.success, checkoutUrl: result.checkoutUrl };
}

/**
 * Closes a single ended billing cycle for a subscription: finalizes the invoice,
 * resets the credit balance to the plan allotment, advances the cycle window,
 * and optionally attempts a single off-session charge. Idempotent — a cycle that
 * already has a finalized invoice for its period is skipped.
 */
export async function closeCycleForSubscription(
  subscriptionId: number,
  opts?: { attemptCharge?: boolean; force?: boolean },
): Promise<CycleCloseResult> {
  const now = new Date();
  const [sub] = await db
    .select({
      id: accountSubscriptionsTable.id,
      clientId: accountSubscriptionsTable.clientId,
      planId: accountSubscriptionsTable.planId,
      status: accountSubscriptionsTable.status,
      billingCycleStart: accountSubscriptionsTable.billingCycleStart,
      billingCycleEnd: accountSubscriptionsTable.billingCycleEnd,
      includedCredits: subscriptionPlansTable.includedCredits,
      pendingPlanTier: accountSubscriptionsTable.pendingPlanTier,
      pendingPlanChangeAt: accountSubscriptionsTable.pendingPlanChangeAt,
    })
    .from(accountSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(accountSubscriptionsTable.id, subscriptionId));

  if (!sub) {
    return {
      clientId: 0,
      subscriptionId,
      invoiceId: null,
      invoiceNumber: null,
      total: 0,
      skipped: true,
      reason: "Subscription not found",
      chargeAttempted: false,
      charged: false,
    };
  }

  const periodStart = new Date(sub.billingCycleStart);
  const periodEnd = new Date(sub.billingCycleEnd);

  if (!opts?.force && periodEnd.getTime() > now.getTime()) {
    return {
      clientId: sub.clientId,
      subscriptionId,
      invoiceId: null,
      invoiceNumber: null,
      total: 0,
      skipped: true,
      reason: "Current cycle has not ended yet",
      chargeAttempted: false,
      charged: false,
    };
  }

  const [existing] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.clientId, sub.clientId),
        eq(invoicesTable.periodStart, periodStart),
        eq(invoicesTable.periodEnd, periodEnd),
        sql`${invoicesTable.status} <> 'void'`,
      ),
    );

  if (existing) {
    return {
      clientId: sub.clientId,
      subscriptionId,
      invoiceId: existing.id,
      invoiceNumber: null,
      total: 0,
      skipped: true,
      reason: "Cycle already invoiced",
      chargeAttempted: false,
      charged: false,
    };
  }

  const { invoiceId, invoiceNumber, composed } = await finalizeInvoice(sub.clientId, {
    periodStart,
    periodEnd,
  });

  const newStart = periodEnd;
  const newEnd = addOneMonth(periodEnd);

  // ── Apply a queued downgrade if it was scheduled for this cycle boundary ──
  let effectivePlanId = sub.planId;
  if (sub.pendingPlanTier && sub.pendingPlanChangeAt && sub.pendingPlanChangeAt <= newStart) {
    const [newPlan] = await db
      .select({ id: subscriptionPlansTable.id, includedCredits: subscriptionPlansTable.includedCredits })
      .from(subscriptionPlansTable)
      .where(
        and(
          eq(subscriptionPlansTable.tier, sub.pendingPlanTier),
          eq(subscriptionPlansTable.isActive, true),
        ),
      );
    if (newPlan) {
      effectivePlanId = newPlan.id;
      // Keep includedCredits for credit reset in sync with new plan.
      sub.includedCredits = newPlan.includedCredits;
      // Also update the client.plan column to reflect the active plan.
      await db
        .update(clientsTable)
        .set({ plan: sub.pendingPlanTier })
        .where(eq(clientsTable.id, sub.clientId));
      console.log(`[cycle-close] Applied queued downgrade to ${sub.pendingPlanTier} for subscription ${subscriptionId}`);
    }
  }

  await db
    .update(accountSubscriptionsTable)
    .set({
      planId: effectivePlanId,
      creditBalance: sub.includedCredits,
      billingCycleStart: newStart,
      billingCycleEnd: newEnd,
      lastUsageAlertThreshold: 0,
      // Clear pending downgrade columns once applied (or unconditionally to clean stale entries).
      pendingPlanTier: null,
      pendingPlanChangeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(accountSubscriptionsTable.id, subscriptionId));

  let chargeAttempted = false;
  let charged = false;
  let checkoutUrl: string | undefined;

  if (opts?.attemptCharge && composed.total > 0) {
    chargeAttempted = true;
    const chargeResult = await attemptOffSessionCharge(
      sub.clientId,
      subscriptionId,
      invoiceId,
      invoiceNumber,
      composed.total,
    );
    charged = chargeResult.charged;
    checkoutUrl = chargeResult.checkoutUrl;

    // attemptOffSessionCharge already wrote the invoice status update.
    // Only stamp nextDunningAt here if the charge was not successful.
    if (!charged) {
      await db
        .update(invoicesTable)
        .set({ nextDunningAt: new Date(), updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));
    }
  }

  return {
    clientId: sub.clientId,
    subscriptionId,
    invoiceId,
    invoiceNumber,
    total: composed.total,
    skipped: false,
    chargeAttempted,
    charged,
    checkoutUrl,
  };
}

/**
 * Finds and closes every subscription whose billing cycle has ended. Safe to run
 * on a schedule; double-invoicing is guarded per cycle.
 */
export async function closeEndedCycles(opts?: { attemptCharge?: boolean }): Promise<CycleCloseResult[]> {
  const now = new Date();
  const due = await db
    .select({ id: accountSubscriptionsTable.id })
    .from(accountSubscriptionsTable)
    .where(
      and(
        sql`${accountSubscriptionsTable.status} IN ('active', 'restricted')`,
        lte(accountSubscriptionsTable.billingCycleEnd, now),
      ),
    );

  console.log(`[cycle-close] Found ${due.length} subscription(s) due for cycle close`);
  const results: CycleCloseResult[] = [];
  for (const s of due) {
    try {
      results.push(await closeCycleForSubscription(s.id, opts));
    } catch (err) {
      console.error(`[cycle-close] Failed to close subscription ${s.id}:`, err);
      results.push({
        clientId: 0,
        subscriptionId: s.id,
        invoiceId: null,
        invoiceNumber: null,
        total: 0,
        skipped: true,
        reason: err instanceof Error ? err.message : "Close failed",
        chargeAttempted: false,
        charged: false,
      });
    }
  }
  return results;
}
