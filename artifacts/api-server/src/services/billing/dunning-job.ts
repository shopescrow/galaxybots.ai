import { db, invoicesTable, accountSubscriptionsTable, platformAuditLogTable } from "@workspace/db";
import { eq, and, lte, sql, or } from "drizzle-orm";
import { sendDunningEmail } from "./billing-emails.js";
import { ensureStripeCustomer, attemptOffSessionChargeForCustomer } from "./stripe-customer.js";
import { DUNNING_STEPS, isDunningStepDue, getSubscriptionOutcomeForStep } from "./billing-math.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Advances unpaid finalized invoices through the dunning sequence.
 * Idempotent: only advances when next_dunning_at <= now.
 * Run every 6 hours.
 */
export async function runDunningJob(): Promise<void> {
  const now = new Date();

  // Process finalized, failed, and pending_3ds invoices — all are eligible for dunning.
  const unpaidInvoices = await db
    .select({
      id: invoicesTable.id,
      clientId: invoicesTable.clientId,
      subscriptionId: invoicesTable.subscriptionId,
      total: invoicesTable.total,
      dunningStep: invoicesTable.dunningStep,
      nextDunningAt: invoicesTable.nextDunningAt,
      issuedAt: invoicesTable.issuedAt,
      invoiceNumber: invoicesTable.invoiceNumber,
    })
    .from(invoicesTable)
    .where(
      and(
        sql`${invoicesTable.status} IN ('finalized', 'failed', 'pending_3ds')`,
        or(
          sql`${invoicesTable.nextDunningAt} IS NULL`,
          lte(invoicesTable.nextDunningAt, now),
        ),
      ),
    );

  console.log(`[dunning] Processing ${unpaidInvoices.length} unpaid invoices`);

  for (const invoice of unpaidInvoices) {
    try {
      await advanceDunningStep(invoice, now);
    } catch (err) {
      console.error(`[dunning] Failed to advance invoice ${invoice.id}:`, err);
    }
  }
}

async function advanceDunningStep(
  invoice: {
    id: number;
    clientId: number;
    subscriptionId: number | null;
    total: string;
    dunningStep: number;
    nextDunningAt: Date | null;
    issuedAt: Date | null;
    invoiceNumber: string;
  },
  now: Date,
): Promise<void> {
  const currentStep = invoice.dunningStep;
  const nextStepDef = DUNNING_STEPS.find((s) => s.step === currentStep + 1);

  if (!nextStepDef) {
    return;
  }

  const issuedAt = invoice.issuedAt ?? now;
  const stepDueAt = daysFromNow(issuedAt, nextStepDef.daysAfterIssue);
  if (stepDueAt.getTime() > now.getTime()) {
    if (!invoice.nextDunningAt) {
      await db
        .update(invoicesTable)
        .set({ nextDunningAt: stepDueAt, updatedAt: now })
        .where(eq(invoicesTable.id, invoice.id));
    }
    return;
  }

  const amountCents = Math.round(parseFloat(invoice.total) * 100);

  // ── Audit log helper ──────────────────────────────────────────────────────
  async function auditDunning(action: string, extra?: Record<string, unknown>) {
    await db.insert(platformAuditLogTable).values({
      clientId: invoice.clientId,
      action,
      resource: "invoice",
      resourceId: String(invoice.id),
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        dunningStep: nextStepDef.step,
        subscriptionId: invoice.subscriptionId,
        ...extra,
      },
    }).catch((err) => {
      console.error(`[dunning] Audit log insert failed for invoice ${invoice.id}:`, err);
    });
  }

  if (nextStepDef.retryCharge && invoice.subscriptionId) {
    const [sub] = await db
      .select({ stripeCustomerId: accountSubscriptionsTable.stripeCustomerId })
      .from(accountSubscriptionsTable)
      .where(eq(accountSubscriptionsTable.id, invoice.subscriptionId));

    const customerId = sub?.stripeCustomerId
      ?? await ensureStripeCustomer(invoice.subscriptionId, invoice.clientId);

    if (customerId) {
      const result = await attemptOffSessionChargeForCustomer(
        customerId,
        amountCents,
        `Invoice ${invoice.invoiceNumber}`,
        { invoiceId: String(invoice.id), clientId: String(invoice.clientId) },
      );

      await auditDunning(
        result.success ? "billing.dunning.retry_charge_succeeded" : "billing.dunning.retry_charge_failed",
        { paymentIntentId: result.paymentIntentId ?? null },
      );

      if (result.success) {
        await db
          .update(invoicesTable)
          .set({
            status: "paid",
            paidAt: now,
            stripePaymentIntentId: result.paymentIntentId ?? null,
            dunningStep: nextStepDef.step,
            nextDunningAt: null,
            updatedAt: now,
          })
          .where(eq(invoicesTable.id, invoice.id));
        console.log(`[dunning] Auto-recovered invoice ${invoice.id} via off-session charge`);

        // Restore the subscription from restricted → active now that the balance is cleared.
        await db
          .update(accountSubscriptionsTable)
          .set({ status: "active", updatedAt: now })
          .where(
            and(
              eq(accountSubscriptionsTable.id, invoice.subscriptionId),
              sql`${accountSubscriptionsTable.status} = 'restricted'`,
            ),
          );
        await auditDunning("billing.dunning.restriction_lifted", { reason: "retry_charge_succeeded" });
        return;
      }
    }
  }

  if (nextStepDef.cancel) {
    if (invoice.subscriptionId) {
      await db
        .update(accountSubscriptionsTable)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(accountSubscriptionsTable.id, invoice.subscriptionId));
      console.log(`[dunning] Cancelled subscription ${invoice.subscriptionId} for unpaid invoice ${invoice.id}`);
      await auditDunning("billing.dunning.subscription_cancelled");
    }

    // Leave the invoice as "failed" (not "void") so it remains payable via the
    // self-serve Pay Now flow. Voiding would make the debt uncollectible.
    // The subscription is cancelled; the invoice persists as a collectible debt.
    await db
      .update(invoicesTable)
      .set({ dunningStep: nextStepDef.step, nextDunningAt: null, updatedAt: now })
      .where(eq(invoicesTable.id, invoice.id));
    return;
  }

  if (nextStepDef.restrict && invoice.subscriptionId) {
    await db
      .update(accountSubscriptionsTable)
      .set({ status: "restricted", updatedAt: now })
      .where(eq(accountSubscriptionsTable.id, invoice.subscriptionId));
    console.log(`[dunning] Restricted subscription ${invoice.subscriptionId} for unpaid invoice ${invoice.id}`);
    await auditDunning("billing.dunning.subscription_restricted");
  }

  const afterStep = DUNNING_STEPS.find((s) => s.step === nextStepDef.step + 1);
  const nextAt = afterStep ? daysFromNow(issuedAt, afterStep.daysAfterIssue) : null;

  await db
    .update(invoicesTable)
    .set({
      dunningStep: nextStepDef.step,
      nextDunningAt: nextAt,
      updatedAt: now,
    })
    .where(eq(invoicesTable.id, invoice.id));

  await auditDunning("billing.dunning.step_advanced", { nextDunningAt: nextAt });

  await sendDunningEmail(invoice.id, nextStepDef.step).catch((err) => {
    console.error(`[dunning] Email failed for invoice ${invoice.id} step ${nextStepDef.step}:`, err);
  });
}
