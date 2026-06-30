import Stripe from "stripe";
import type { BillingEvent, BillingWebhookResult } from "./webhook-handler";

export function parseStripePayload(rawBody: Buffer | string, signature: string): BillingWebhookResult {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!webhookSecret || !stripeKey) {
    return { received: false, error: "Stripe webhook not configured" };
  }

  const stripe = new Stripe(stripeKey);

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Stripe webhook signature verification failed:", msg);
    return { received: false, error: "Invalid signature" };
  }

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const meta = session.metadata ?? {};
    const clientId = meta["clientId"];
    const plan = meta["plan"];
    const invoiceId = meta["invoiceId"];
    const prorationUpgrade = meta["prorationUpgrade"];
    const subscriptionId = meta["subscriptionId"];

    const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;

    // ── Case 1: Invoice payment (self-serve Pay Now) ────────────────────────
    if (clientId && invoiceId && !prorationUpgrade) {
      return {
        received: true,
        event: {
          type: "invoice_paid",
          clientId: Number(clientId),
          plan: plan ?? "",
          metadata: {
            invoiceId: Number(invoiceId),
            stripeSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            stripeCustomerId,
            provider: "stripe",
          },
        },
      };
    }

    // ── Case 2: Prorated plan upgrade ───────────────────────────────────────
    if (clientId && prorationUpgrade === "true" && subscriptionId && plan) {
      return {
        received: true,
        event: {
          type: "subscription_upgraded",
          clientId: Number(clientId),
          plan,
          metadata: {
            subscriptionId: Number(subscriptionId),
            stripeSessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            stripeCustomerId,
            provider: "stripe",
          },
        },
      };
    }

    // ── Case 3: Initial subscription activation ─────────────────────────────
    if (clientId && plan) {
      return {
        received: true,
        event: {
          type: "plan_activated",
          clientId: Number(clientId),
          plan,
          metadata: { stripeSessionId: session.id, stripeCustomerId, provider: "stripe" },
        },
      };
    }

    console.error("Stripe webhook: checkout.session.completed missing required metadata", meta);
  }

  return { received: true };
}
