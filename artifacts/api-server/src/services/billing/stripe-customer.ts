import Stripe from "stripe";
import { db, accountSubscriptionsTable, clientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export function getStripeClient(): Stripe | null {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  const opts: Stripe.StripeConfig = {};
  if (process.env["STRIPE_API_BASE"]) {
    try {
      const base = new URL(process.env["STRIPE_API_BASE"]);
      opts.host = base.hostname;
      opts.port = parseInt(base.port, 10);
      opts.protocol = base.protocol.replace(":", "") as "http" | "https";
    } catch {}
  }
  return new Stripe(key, opts);
}

/**
 * Returns the Stripe Customer ID for a client, creating one if it doesn't exist.
 * Works in two modes:
 *   - subscriptionId given: reads/writes stripe_customer_id on account_subscriptions
 *   - subscriptionId omitted (new customer, no sub row yet): creates a Stripe customer
 *     and immediately persists it on any existing sub row, or returns the ID for the
 *     caller to store after the subscription row is created.
 *
 * The Stripe customer is created at most once per client across both paths — the
 * first call with a client's email creates it; subsequent calls return the stored ID.
 */
export async function ensureStripeCustomer(
  subscriptionId: number | null,
  clientId: number,
): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  // ── 1. Check for an existing stripe_customer_id on any sub row ─────────
  const [existingSub] = await db
    .select({ id: accountSubscriptionsTable.id, stripeCustomerId: accountSubscriptionsTable.stripeCustomerId })
    .from(accountSubscriptionsTable)
    .where(eq(accountSubscriptionsTable.clientId, clientId));

  if (existingSub?.stripeCustomerId) return existingSub.stripeCustomerId;

  // ── 2. Also check by subscription ID when given ─────────────────────────
  if (subscriptionId) {
    const [targetSub] = await db
      .select({ stripeCustomerId: accountSubscriptionsTable.stripeCustomerId })
      .from(accountSubscriptionsTable)
      .where(eq(accountSubscriptionsTable.id, subscriptionId));
    if (targetSub?.stripeCustomerId) return targetSub.stripeCustomerId;
  }

  // ── 3. Create the Stripe customer ───────────────────────────────────────
  const [client] = await db
    .select({ email: clientsTable.contactEmail, name: clientsTable.companyName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  const customer = await stripe.customers.create({
    email: client?.email,
    name: client?.name,
    metadata: {
      clientId: String(clientId),
      ...(subscriptionId ? { subscriptionId: String(subscriptionId) } : {}),
    },
  });

  console.log(`[stripe-customer] Created Stripe customer ${customer.id} for client ${clientId}`);

  // ── 4. Persist on the sub row (by subscriptionId or the first row found) ─
  const rowId = subscriptionId ?? existingSub?.id;
  if (rowId) {
    await db
      .update(accountSubscriptionsTable)
      .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
      .where(eq(accountSubscriptionsTable.id, rowId));
  }

  return customer.id;
}

/**
 * Persists a Stripe customer ID on the subscription row for a given client.
 * Called from the webhook handler when a Stripe Checkout session provides a
 * customer ID that may not yet be stored locally.
 */
export async function persistStripeCustomerId(
  clientId: number,
  stripeCustomerId: string,
): Promise<void> {
  // Only update rows that don't already have a customer ID.
  const [sub] = await db
    .select({ id: accountSubscriptionsTable.id, stripeCustomerId: accountSubscriptionsTable.stripeCustomerId })
    .from(accountSubscriptionsTable)
    .where(eq(accountSubscriptionsTable.clientId, clientId));

  if (sub && !sub.stripeCustomerId) {
    await db
      .update(accountSubscriptionsTable)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(accountSubscriptionsTable.id, sub.id));
    console.log(`[stripe-customer] Persisted customer ${stripeCustomerId} for client ${clientId} from webhook`);
  }
}

export interface OffSessionChargeResult {
  success: boolean;
  paymentIntentId?: string;
  status?: string;
  checkoutUrl?: string;
}

/**
 * Attempts to charge the saved payment method on file for a customer.
 * If no payment method exists or 3DS is required, returns a hosted checkout URL.
 */
export async function attemptOffSessionChargeForCustomer(
  stripeCustomerId: string,
  amountCents: number,
  description: string,
  metadata: Record<string, string>,
): Promise<OffSessionChargeResult> {
  const stripe = getStripeClient();
  if (!stripe) return { success: false };

  const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
  if (customer.deleted) return { success: false };

  const defaultPm = customer.invoice_settings?.default_payment_method as string | null | undefined;

  if (!defaultPm) {
    const checkoutUrl = await createInvoiceCheckoutSession(stripe, stripeCustomerId, amountCents, description, metadata);
    return { success: false, checkoutUrl: checkoutUrl ?? undefined };
  }

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: defaultPm,
      confirm: true,
      off_session: true,
      description,
      metadata,
    });

    if (pi.status === "succeeded") {
      return { success: true, paymentIntentId: pi.id, status: pi.status };
    }

    if (pi.status === "requires_action" || pi.status === "requires_payment_method") {
      const checkoutUrl = await createInvoiceCheckoutSession(stripe, stripeCustomerId, amountCents, description, metadata);
      return { success: false, paymentIntentId: pi.id, status: pi.status, checkoutUrl: checkoutUrl ?? undefined };
    }

    return { success: false, paymentIntentId: pi.id, status: pi.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe-charge] Off-session charge failed:", msg);
    const checkoutUrl = await createInvoiceCheckoutSession(stripe, stripeCustomerId, amountCents, description, metadata);
    return { success: false, checkoutUrl: checkoutUrl ?? undefined };
  }
}

async function createInvoiceCheckoutSession(
  stripe: Stripe,
  customerId: string,
  amountCents: number,
  description: string,
  metadata: Record<string, string>,
): Promise<string | null> {
  const appUrl = process.env["APP_URL"] || "https://galaxybots.ai";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price_data: { currency: "usd", product_data: { name: description }, unit_amount: amountCents }, quantity: 1 }],
      metadata,
      success_url: `${appUrl}/billing/statements?checkout=success`,
      cancel_url: `${appUrl}/billing/statements?checkout=cancelled`,
    });
    return session.url;
  } catch (err) {
    console.error("[stripe-charge] Failed to create checkout session:", err);
    return null;
  }
}
