import {
  db,
  subscriptionPlansTable,
  accountSubscriptionsTable,
  invoicesTable,
} from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { finalizeInvoice } from "./invoice-builder.js";

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
}

function addOneMonth(d: Date): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Best-effort, single off-session settlement attempt. Real provider charging
 * requires a saved payment method / customer reference which this platform does
 * not yet persist, so this is a guarded no-op that records the outcome. Wire a
 * provider call here once saved payment methods exist.
 */
async function attemptOffSessionCharge(_clientId: number, amountDue: number): Promise<boolean> {
  if (amountDue <= 0) return true;
  return false;
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

  // Guard: only close a cycle that has actually ended, unless forced (an admin
  // intentionally closing the current cycle early via the UI).
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

  // Idempotency guard: do not double-invoice/double-settle a period that already
  // has a non-void invoice for this exact window.
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

  // Advance the cycle window and reset the credit balance to the allotment.
  const newStart = periodEnd;
  const newEnd = addOneMonth(periodEnd);
  await db
    .update(accountSubscriptionsTable)
    .set({
      creditBalance: sub.includedCredits,
      billingCycleStart: newStart,
      billingCycleEnd: newEnd,
      updatedAt: new Date(),
    })
    .where(eq(accountSubscriptionsTable.id, subscriptionId));

  // Optional settlement.
  let chargeAttempted = false;
  let charged = false;
  if (opts?.attemptCharge && composed.total > 0) {
    chargeAttempted = true;
    charged = await attemptOffSessionCharge(sub.clientId, composed.total);
    if (charged) {
      await db
        .update(invoicesTable)
        .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
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
        eq(accountSubscriptionsTable.status, "active"),
        lte(accountSubscriptionsTable.billingCycleEnd, now),
      ),
    );

  const results: CycleCloseResult[] = [];
  for (const s of due) {
    try {
      results.push(await closeCycleForSubscription(s.id, opts));
    } catch (err) {
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
