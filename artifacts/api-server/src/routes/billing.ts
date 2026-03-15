import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/auth";

const router: IRouter = Router();

const VALID_PLANS = ["single", "team", "enterprise"];

const STRIPE_PRICE_IDS: Record<string, string | undefined> = {
  single: process.env["STRIPE_PRICE_ID_SINGLE"],
  team: process.env["STRIPE_PRICE_ID_TEAM"],
  enterprise: process.env["STRIPE_PRICE_ID_ENTERPRISE"],
};

function getStripe(): Stripe | null {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  return new Stripe(key);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

router.get("/billing/links", authenticate, (_req, res): void => {
  res.json({
    provider: "Stripe",
    plans: {
      single: {
        name: "Single Director",
        price: 999,
        link: null,
      },
      team: {
        name: "Department Team",
        price: 2999,
        link: null,
      },
      enterprise: {
        name: "Enterprise Command",
        price: 7999,
        link: null,
      },
    },
  });
});

router.get("/billing/status", authenticate, async (req, res): Promise<void> => {
  const [client] = await db
    .select({ plan: clientsTable.plan, status: clientsTable.status })
    .from(clientsTable)
    .where(eq(clientsTable.id, req.user!.clientId));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({ plan: client.plan, status: client.status });
});

router.post("/billing/stripe/checkout", authenticate, async (req, res): Promise<void> => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  const { plan } = req.body;
  if (!plan || !VALID_PLANS.includes(plan)) {
    res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
    return;
  }

  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) {
    res.status(503).json({ error: `Stripe Price ID not configured for the ${plan} plan` });
    return;
  }

  const clientId = req.user!.clientId;
  const appUrl = process.env["APP_URL"] || req.headers.origin || "";
  const billingUrl = `${appUrl}/billing`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clientId: String(clientId), plan },
      success_url: `${billingUrl}?checkout=success`,
      cancel_url: `${billingUrl}?checkout=cancelled`,
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.json({ url: session.url });
  } catch (error: unknown) {
    console.error("Stripe checkout session creation failed:", getErrorMessage(error));
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  const stripeKey = process.env["STRIPE_SECRET_KEY"];
  if (!webhookSecret || !stripeKey) {
    res.status(503).json({ error: "Stripe webhook not configured" });
    return;
  }

  const stripe = new Stripe(stripeKey);
  const sig = req.headers["stripe-signature"];
  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (error: unknown) {
    console.error("Stripe webhook signature verification failed:", getErrorMessage(error));
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const clientId = session.metadata?.clientId;
    const plan = session.metadata?.plan;
    if (clientId && plan && VALID_PLANS.includes(plan)) {
      try {
        await db
          .update(clientsTable)
          .set({ plan, status: "active" })
          .where(eq(clientsTable.id, Number(clientId)));
        console.log(`Stripe webhook: activated client ${clientId} with plan ${plan}`);
      } catch (error: unknown) {
        console.error("Stripe webhook DB update failed:", getErrorMessage(error));
        res.status(500).json({ error: "Database update failed" });
        return;
      }
    } else {
      console.error("Stripe webhook: missing or invalid metadata", { clientId, plan });
    }
  }

  res.json({ received: true });
}

router.post(
  "/billing/activate",
  authenticate,
  requireRole("admin"),
  async (req, res): Promise<void> => {
    const { clientId, plan } = req.body;

    if (!clientId || !plan) {
      res.status(400).json({ error: "clientId and plan are required" });
      return;
    }

    if (!VALID_PLANS.includes(plan)) {
      res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
      return;
    }

    const [updated] = await db
      .update(clientsTable)
      .set({ plan, status: "active" })
      .where(eq(clientsTable.id, Number(clientId)))
      .returning({ id: clientsTable.id, plan: clientsTable.plan, status: clientsTable.status });

    if (!updated) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json({ success: true, client: updated });
  }
);

export default router;
