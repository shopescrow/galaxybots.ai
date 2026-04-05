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
    const clientId = session.metadata?.clientId;
    const plan = session.metadata?.plan;
    if (clientId && plan) {
      return {
        received: true,
        event: {
          type: "plan_activated",
          clientId: Number(clientId),
          plan,
          metadata: { stripeSessionId: session.id },
        },
      };
    }
    console.error("Stripe webhook: missing or invalid metadata", { clientId, plan });
  }

  return { received: true };
}
