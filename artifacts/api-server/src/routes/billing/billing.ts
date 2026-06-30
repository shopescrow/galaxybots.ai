import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, clientsTable, subscriptionPlansTable, accountSubscriptionsTable, accessorialAddonsTable, accessorialSubscriptionsTable, usageEventsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/auth";
import { getActiveBillingProvider, getGoDaddyPaymentLinks, upsertGoDaddyPaymentLink, listBillingProviderConfigs } from "../../services/billing/godaddy-provider";

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
  const opts: Stripe.StripeConfig = {};
  if (process.env["STRIPE_API_BASE"]) {
    const base = new URL(process.env["STRIPE_API_BASE"]);
    opts.host = base.hostname;
    opts.port = parseInt(base.port, 10);
    opts.protocol = base.protocol.replace(":", "") as "http" | "https";
  }
  return new Stripe(key, opts);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

router.get("/billing/links", authenticate, async (_req, res): Promise<void> => {
  const provider = getActiveBillingProvider();
  const godaddyLinks = await getGoDaddyPaymentLinks();

  res.json({
    provider: provider === "godaddy" ? "GoDaddy Payments" : "Stripe",
    activeProvider: provider,
    plans: {
      single: {
        name: "Single Director",
        price: 999,
        link: provider === "godaddy" ? (godaddyLinks.single || null) : null,
      },
      team: {
        name: "Department Team",
        price: 2999,
        link: provider === "godaddy" ? (godaddyLinks.team || null) : null,
      },
      enterprise: {
        name: "Enterprise Command",
        price: 7999,
        link: provider === "godaddy" ? (godaddyLinks.enterprise || null) : null,
      },
    },
  });
});

router.get("/billing/status", authenticate, async (req, res): Promise<void> => {
  const [client] = await db
    .select({ plan: clientsTable.plan, status: clientsTable.status, createdAt: clientsTable.createdAt })
    .from(clientsTable)
    .where(eq(clientsTable.id, req.user!.clientId));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  let renewalDate: string | null = null;

  if (client.createdAt) {
    const created = new Date(client.createdAt);
    const renewal = new Date(created);
    renewal.setMonth(renewal.getMonth() + 1);
    while (renewal < new Date()) {
      renewal.setMonth(renewal.getMonth() + 1);
    }
    renewalDate = renewal.toISOString();
  }

  res.json({ plan: client.plan, status: client.status, renewalDate });
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

  const clientId = req.user!.clientId;
  const appUrl = process.env["APP_URL"] || req.headers.origin || "";
  const billingUrl = `${appUrl}/billing`;

  const [activeSub] = await db
    .select({
      id: accountSubscriptionsTable.id,
      planId: accountSubscriptionsTable.planId,
      billingCycleStart: accountSubscriptionsTable.billingCycleStart,
      billingCycleEnd: accountSubscriptionsTable.billingCycleEnd,
      creditBalance: accountSubscriptionsTable.creditBalance,
      stripeCustomerId: accountSubscriptionsTable.stripeCustomerId,
      currentPrice: subscriptionPlansTable.monthlyPrice,
      currentTier: subscriptionPlansTable.tier,
      includedCredits: subscriptionPlansTable.includedCredits,
    })
    .from(accountSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(and(eq(accountSubscriptionsTable.clientId, clientId), eq(accountSubscriptionsTable.status, "active")));

  const [newPlan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.tier, plan), eq(subscriptionPlansTable.isActive, true)));

  if (!newPlan) {
    res.status(404).json({ error: `Plan '${plan}' not found` });
    return;
  }

  if (activeSub) {
    const currentPrice = parseFloat(activeSub.currentPrice);
    const newPrice = parseFloat(newPlan.monthlyPrice);

    if (newPrice <= currentPrice) {
      // Schedule downgrade for the next billing cycle — persist it so cycle-close can apply it.
      await db
        .update(accountSubscriptionsTable)
        .set({ pendingPlanTier: plan, pendingPlanChangeAt: new Date(activeSub.billingCycleEnd), updatedAt: new Date() })
        .where(eq(accountSubscriptionsTable.id, activeSub.id));
      res.json({
        downgrade: true,
        message: `Downgrade to ${plan} scheduled for next billing cycle. Your current plan remains active until then.`,
        effectiveDate: activeSub.billingCycleEnd,
      });
      return;
    }

    const now = new Date();
    const cycleStart = new Date(activeSub.billingCycleStart);
    const cycleEnd = new Date(activeSub.billingCycleEnd);
    const totalDays = Math.max(1, Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (24 * 60 * 60 * 1000)));
    const remainingDays = Math.max(0, Math.round((cycleEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    const proratedAmount = Math.round(((newPrice - currentPrice) * (remainingDays / totalDays)) * 100) / 100;
    const proratedCents = Math.round(proratedAmount * 100);

    if (proratedCents <= 0) {
      // Upgrade is effectively free for the remainder of this cycle — apply immediately.
      const incrementalCredits = Math.max(0, newPlan.includedCredits - activeSub.includedCredits);
      await db
        .update(accountSubscriptionsTable)
        .set({
          planId: newPlan.id,
          creditBalance: activeSub.creditBalance + incrementalCredits,
          pendingPlanTier: null,
          pendingPlanChangeAt: null,
          updatedAt: new Date(),
        })
        .where(eq(accountSubscriptionsTable.id, activeSub.id));
      await db.update(clientsTable).set({ plan }).where(eq(clientsTable.id, clientId));
      res.json({
        upgrade: true,
        noCharge: true,
        message: `Plan upgraded to ${plan} immediately. ${incrementalCredits > 0 ? `${incrementalCredits.toLocaleString()} bonus credits added.` : ""}`,
        creditsAdded: incrementalCredits,
      });
      return;
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        ...(activeSub.stripeCustomerId ? { customer: activeSub.stripeCustomerId } : {}),
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `Upgrade to ${plan} plan — prorated for ${remainingDays} remaining days` },
            unit_amount: proratedCents,
          },
          quantity: 1,
        }],
        metadata: {
          clientId: String(clientId),
          plan,
          subscriptionId: String(activeSub.id),
          prorationUpgrade: "true",
        },
        success_url: `${billingUrl}?checkout=success&upgrade=${plan}`,
        cancel_url: `${billingUrl}?checkout=cancelled`,
      });

      if (!session.url) {
        res.status(500).json({ error: "Stripe did not return a checkout URL" });
        return;
      }
      res.json({ url: session.url, prorated: true, proratedAmount, remainingDays });
      return;
    } catch (error: unknown) {
      console.error("Stripe prorated checkout failed:", getErrorMessage(error));
      res.status(500).json({ error: "Failed to create prorated checkout session" });
      return;
    }
  }

  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) {
    res.status(503).json({ error: `Stripe Price ID not configured for the ${plan} plan` });
    return;
  }

  // Create (or retrieve) a Stripe customer before opening a new subscription Checkout.
  // This ensures stripeCustomerId is persisted from the very first interaction so
  // future off-session charges and dunning retries can use the saved payment method.
  let stripeCustomerId: string | undefined;
  try {
    const { ensureStripeCustomer } = await import("../../services/billing/stripe-customer.js");
    // We may not have an account_subscription row yet — pass clientId only so
    // ensureStripeCustomer can create the customer even without a subscription ID.
    // Resolve an existing sub if present, otherwise create Stripe customer directly.
    const [existingSub] = await db
      .select({ id: accountSubscriptionsTable.id })
      .from(accountSubscriptionsTable)
      .where(eq(accountSubscriptionsTable.clientId, clientId));
    if (existingSub) {
      stripeCustomerId = await ensureStripeCustomer(existingSub.id, clientId) ?? undefined;
    }
  } catch {
    // Non-fatal — proceed without customer ID and the webhook will save it later.
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(stripeCustomerId ? { customer: stripeCustomerId } : {}),
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

export { stripeWebhookHandler, processBillingWebhook } from "../../services/billing/webhook-handler";

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

router.get("/billing/plans", async (_req, res): Promise<void> => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.monthlyPrice);
    res.json(plans);
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

router.get("/billing/addons", async (_req, res): Promise<void> => {
  try {
    const addons = await db
      .select()
      .from(accessorialAddonsTable)
      .where(eq(accessorialAddonsTable.isActive, true))
      .orderBy(accessorialAddonsTable.monthlyPrice);
    res.json(addons);
  } catch (error) {
    console.error("Error fetching addons:", error);
    res.status(500).json({ error: "Failed to fetch addons" });
  }
});

router.get("/billing/subscription", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;

    const [sub] = await db
      .select({
        id: accountSubscriptionsTable.id,
        creditBalance: accountSubscriptionsTable.creditBalance,
        billingCycleStart: accountSubscriptionsTable.billingCycleStart,
        billingCycleEnd: accountSubscriptionsTable.billingCycleEnd,
        status: accountSubscriptionsTable.status,
        planTier: subscriptionPlansTable.tier,
        planMonthlyPrice: subscriptionPlansTable.monthlyPrice,
        planIncludedCredits: subscriptionPlansTable.includedCredits,
        overageRate: subscriptionPlansTable.overageRatePerCredit,
      })
      .from(accountSubscriptionsTable)
      .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(and(eq(accountSubscriptionsTable.clientId, clientId), eq(accountSubscriptionsTable.status, "active")));

    const activeAddons = await db
      .select({
        id: accessorialAddonsTable.id,
        key: accessorialAddonsTable.key,
        name: accessorialAddonsTable.name,
        description: accessorialAddonsTable.description,
        monthlyPrice: accessorialAddonsTable.monthlyPrice,
      })
      .from(accessorialSubscriptionsTable)
      .innerJoin(accessorialAddonsTable, eq(accessorialSubscriptionsTable.addonId, accessorialAddonsTable.id))
      .where(and(eq(accessorialSubscriptionsTable.clientId, clientId), eq(accessorialSubscriptionsTable.status, "active")));

    res.json({ subscription: sub || null, addons: activeAddons });
  } catch (error) {
    console.error("Error fetching subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

router.post("/billing/subscribe", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const { planTier } = req.body;

    const [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.tier, planTier), eq(subscriptionPlansTable.isActive, true)));

    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    await db
      .update(accountSubscriptionsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(accountSubscriptionsTable.clientId, clientId), eq(accountSubscriptionsTable.status, "active")));

    const cycleEnd = new Date();
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);

    const [sub] = await db.insert(accountSubscriptionsTable).values({
      clientId,
      planId: plan.id,
      creditBalance: plan.includedCredits,
      billingCycleStart: new Date(),
      billingCycleEnd: cycleEnd,
      status: "active",
    }).returning();

    res.status(201).json({ success: true, subscription: sub });
  } catch (error) {
    console.error("Error subscribing:", error);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

router.get("/billing/usage", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await db
      .select()
      .from(usageEventsTable)
      .where(and(eq(usageEventsTable.clientId, clientId), gte(usageEventsTable.createdAt, thirtyDaysAgo)))
      .orderBy(desc(usageEventsTable.createdAt));

    const dailyUsage: Record<string, number> = {};
    let totalCredits = 0;

    for (const event of events) {
      totalCredits += event.creditsDeducted;
      const day = event.createdAt.toISOString().slice(0, 10);
      dailyUsage[day] = (dailyUsage[day] || 0) + event.creditsDeducted;
    }

    const dailyArray = Object.entries(dailyUsage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, credits]) => ({ date, credits }));

    res.json({ totalCreditsUsed: totalCredits, dailyUsage: dailyArray, recentEvents: events.slice(0, 20) });
  } catch (error) {
    console.error("Error fetching usage:", error);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

router.post("/billing/addons/toggle", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const { addonKey, activate } = req.body;

    const [addon] = await db
      .select()
      .from(accessorialAddonsTable)
      .where(eq(accessorialAddonsTable.key, addonKey));

    if (!addon) {
      res.status(404).json({ error: "Add-on not found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(accessorialSubscriptionsTable)
      .where(and(eq(accessorialSubscriptionsTable.clientId, clientId), eq(accessorialSubscriptionsTable.addonId, addon.id)));

    if (activate) {
      if (existing) {
        await db
          .update(accessorialSubscriptionsTable)
          .set({ status: "active", deactivatedAt: null })
          .where(and(eq(accessorialSubscriptionsTable.clientId, clientId), eq(accessorialSubscriptionsTable.addonId, addon.id)));
      } else {
        await db.insert(accessorialSubscriptionsTable).values({
          clientId,
          addonId: addon.id,
          status: "active",
        });
      }
      res.json({ success: true, status: "active" });
    } else {
      if (existing) {
        await db
          .update(accessorialSubscriptionsTable)
          .set({ status: "inactive", deactivatedAt: new Date() })
          .where(and(eq(accessorialSubscriptionsTable.clientId, clientId), eq(accessorialSubscriptionsTable.addonId, addon.id)));
      }
      res.json({ success: true, status: "inactive" });
    }
  } catch (error) {
    console.error("Error toggling addon:", error);
    res.status(500).json({ error: "Failed to toggle add-on" });
  }
});

router.get(
  "/billing/provider-config",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!req.user?.bypassPayment) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }
    try {
      const provider = req.query.provider as string | undefined;
      const configs = await listBillingProviderConfigs(provider || undefined);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching provider configs:", error);
      res.status(500).json({ error: "Failed to fetch provider configs" });
    }
  }
);

router.put(
  "/billing/provider-config",
  authenticate,
  requireRole("owner", "admin"),
  async (req, res): Promise<void> => {
    if (!req.user?.bypassPayment) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }

    const { provider, tier, paymentLinkUrl } = req.body;
    if (!provider || !tier || !paymentLinkUrl) {
      res.status(400).json({ error: "provider, tier, and paymentLinkUrl are required" });
      return;
    }
    if (provider !== "godaddy") {
      res.status(400).json({ error: "Only 'godaddy' provider config is supported" });
      return;
    }

    try {
      const config = await upsertGoDaddyPaymentLink(tier, paymentLinkUrl, req.user!.userId);
      res.json({ success: true, config });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Invalid tier")) {
        res.status(400).json({ error: msg });
        return;
      }
      console.error("Error updating provider config:", error);
      res.status(500).json({ error: "Failed to update provider config" });
    }
  }
);

export default router;
