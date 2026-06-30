import type { Request, Response } from "express";
import { db, clientsTable, invoicesTable, accountSubscriptionsTable, subscriptionPlansTable, platformAuditLogTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { parseStripePayload } from "./stripe-provider";
import { parseGoDaddyPayload } from "./godaddy-provider";
import { persistStripeCustomerId } from "./stripe-customer";

const VALID_PLANS = ["single", "team", "enterprise"];

type BillingProvider = "stripe" | "godaddy";

export interface BillingEvent {
  type: string;
  clientId: number;
  plan: string;
  metadata?: Record<string, unknown>;
}

export interface BillingWebhookResult {
  received: boolean;
  event?: BillingEvent;
  error?: string;
}

async function activateClientPlan(clientId: number, plan: string): Promise<void> {
  await db
    .update(clientsTable)
    .set({ plan, status: "active" })
    .where(eq(clientsTable.id, clientId));
}

/**
 * Marks an invoice as paid, stamps paidAt, and records the PI/session ID.
 */
async function markInvoicePaid(
  clientId: number,
  invoiceId: number,
  paymentIntentId: string | null,
): Promise<void> {
  const [inv] = await db
    .select({
      id: invoicesTable.id,
      status: invoicesTable.status,
      subscriptionId: invoicesTable.subscriptionId,
    })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.clientId, clientId)));

  if (!inv) {
    console.error(`[webhook] Invoice ${invoiceId} not found for client ${clientId}`);
    return;
  }

  if (inv.status === "paid") {
    console.log(`[webhook] Invoice ${invoiceId} already paid — skipping duplicate`);
    return;
  }

  await db
    .update(invoicesTable)
    .set({
      status: "paid",
      paidAt: new Date(),
      dunningStep: 0,
      nextDunningAt: null,
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(invoicesTable.id, invoiceId));

  console.log(`[webhook] Invoice ${invoiceId} marked paid (PI: ${paymentIntentId ?? "n/a"})`);

  // ── Restore restricted subscription to active when all overdue balances cleared ──
  if (inv.subscriptionId) {
    await restoreSubscriptionIfCleared(inv.subscriptionId, clientId, invoiceId);
  }
}

/**
 * When a payment clears a subscription's last unpaid invoice, transitions
 * the subscription from "restricted" back to "active" so the customer
 * regains bot creation and API key creation.
 */
async function restoreSubscriptionIfCleared(
  subscriptionId: number,
  clientId: number,
  justPaidInvoiceId: number,
): Promise<void> {
  const [sub] = await db
    .select({ id: accountSubscriptionsTable.id, status: accountSubscriptionsTable.status })
    .from(accountSubscriptionsTable)
    .where(and(eq(accountSubscriptionsTable.id, subscriptionId), eq(accountSubscriptionsTable.clientId, clientId)));

  if (!sub || sub.status !== "restricted") return;

  // Check whether any other unpaid invoices remain for this subscription.
  const [remaining] = await db
    .select({ id: invoicesTable.id })
    .from(invoicesTable)
    .where(
      and(
        eq(invoicesTable.subscriptionId, subscriptionId),
        sql`${invoicesTable.status} IN ('finalized', 'failed', 'pending_3ds')`,
        sql`${invoicesTable.id} <> ${justPaidInvoiceId}`,
      ),
    );

  if (remaining) {
    console.log(`[webhook] Subscription ${subscriptionId} still has unpaid invoices — staying restricted`);
    return;
  }

  await db
    .update(accountSubscriptionsTable)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(accountSubscriptionsTable.id, subscriptionId));

  await db.insert(platformAuditLogTable).values({
    clientId,
    action: "billing.subscription.restriction_lifted",
    resource: "subscription",
    resourceId: String(subscriptionId),
    metadata: { reason: "all_invoices_paid", triggeredBy: "payment_webhook" },
  });

  console.log(`[webhook] Subscription ${subscriptionId} restored to active (all invoices paid)`);
}

/**
 * Upgrades the subscription plan to the new tier immediately:
 * - Updates planId on account_subscriptions
 * - Adjusts creditBalance by the incremental allotment (new - old)
 */
async function applySubscriptionUpgrade(
  clientId: number,
  subscriptionId: number,
  newPlanTier: string,
): Promise<void> {
  const [sub] = await db
    .select({
      id: accountSubscriptionsTable.id,
      planId: accountSubscriptionsTable.planId,
      creditBalance: accountSubscriptionsTable.creditBalance,
      includedCredits: subscriptionPlansTable.includedCredits,
      currentTier: subscriptionPlansTable.tier,
    })
    .from(accountSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(and(eq(accountSubscriptionsTable.id, subscriptionId), eq(accountSubscriptionsTable.clientId, clientId)));

  if (!sub) {
    console.error(`[webhook] Subscription ${subscriptionId} not found for client ${clientId}`);
    return;
  }

  const [newPlan] = await db
    .select({ id: subscriptionPlansTable.id, includedCredits: subscriptionPlansTable.includedCredits })
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.tier, newPlanTier), eq(subscriptionPlansTable.isActive, true)));

  if (!newPlan) {
    console.error(`[webhook] Plan '${newPlanTier}' not found`);
    return;
  }

  // Immediately award the incremental credit allotment so the client can use
  // the upgraded plan's credits right away within the current cycle.
  const incrementalCredits = Math.max(0, newPlan.includedCredits - sub.includedCredits);
  const newBalance = sub.creditBalance + incrementalCredits;

  await db
    .update(accountSubscriptionsTable)
    .set({ planId: newPlan.id, creditBalance: newBalance, updatedAt: new Date() })
    .where(eq(accountSubscriptionsTable.id, subscriptionId));

  await db
    .update(clientsTable)
    .set({ plan: newPlanTier })
    .where(eq(clientsTable.id, clientId));

  console.log(
    `[webhook] Subscription ${subscriptionId} upgraded: ${sub.currentTier} → ${newPlanTier}, ` +
    `+${incrementalCredits} credits (new balance: ${newBalance})`,
  );
}

async function applyBillingEvent(event: BillingEvent): Promise<void> {
  const meta = event.metadata ?? {};

  // Persist the Stripe customer ID from any checkout session event, so future
  // off-session charges can find the saved payment method without creating a
  // duplicate customer.
  const stripeCustomerId = typeof meta["stripeCustomerId"] === "string" ? meta["stripeCustomerId"] : null;
  if (stripeCustomerId) {
    await persistStripeCustomerId(event.clientId, stripeCustomerId);
  }

  switch (event.type) {
    case "plan_activated":
      if (VALID_PLANS.includes(event.plan)) {
        await activateClientPlan(event.clientId, event.plan);
        console.log(`[webhook] Activated client ${event.clientId} on plan ${event.plan}`);
      }
      break;

    case "invoice_paid": {
      const invoiceId = typeof meta["invoiceId"] === "number" ? meta["invoiceId"] : Number(meta["invoiceId"]);
      const paymentIntentId = typeof meta["paymentIntentId"] === "string" ? meta["paymentIntentId"] : null;
      if (!isNaN(invoiceId) && invoiceId > 0) {
        await markInvoicePaid(event.clientId, invoiceId, paymentIntentId);
      } else {
        console.error(`[webhook] invoice_paid event missing valid invoiceId`, meta);
      }
      break;
    }

    case "subscription_upgraded": {
      const subscriptionId = typeof meta["subscriptionId"] === "number" ? meta["subscriptionId"] : Number(meta["subscriptionId"]);
      const paymentIntentId = typeof meta["paymentIntentId"] === "string" ? meta["paymentIntentId"] : null;
      if (!isNaN(subscriptionId) && subscriptionId > 0 && VALID_PLANS.includes(event.plan)) {
        await applySubscriptionUpgrade(event.clientId, subscriptionId, event.plan);
        console.log(`[webhook] subscription_upgraded for client ${event.clientId} → ${event.plan} (PI: ${paymentIntentId ?? "n/a"})`);
      } else {
        console.error(`[webhook] subscription_upgraded event has invalid data`, meta, event.plan);
      }
      break;
    }

    default:
      // Unknown event type — acknowledge but do nothing.
      console.log(`[webhook] Unhandled billing event type: ${event.type}`);
  }
}

export async function processBillingWebhook(provider: BillingProvider, payload: unknown, signature?: string): Promise<BillingWebhookResult> {
  let result: BillingWebhookResult;

  switch (provider) {
    case "stripe":
      if (!signature) {
        return { received: false, error: "Missing stripe-signature" };
      }
      result = parseStripePayload(payload as Buffer | string, signature);
      break;
    case "godaddy":
      result = parseGoDaddyPayload(payload, signature);
      break;
    default:
      return { received: false, error: `Unknown billing provider: ${provider}` };
  }

  if (result.event) {
    try {
      await applyBillingEvent(result.event);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Billing event processing failed:", msg);
      return { received: false, error: "Database update failed" };
    }
  }

  return result;
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"] as string | undefined;
  const result = await processBillingWebhook("stripe", req.body, sig);

  if (result.error) {
    const statusCode = result.error.includes("not configured") ? 503 :
                       result.error.includes("signature") || result.error.includes("Missing") ? 400 :
                       result.error.includes("Database") ? 500 : 400;
    res.status(statusCode).json({ error: result.error });
    return;
  }

  res.json({ received: result.received });
}
