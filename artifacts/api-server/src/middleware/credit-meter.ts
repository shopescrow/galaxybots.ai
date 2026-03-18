import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { accountSubscriptionsTable, subscriptionPlansTable, usageEventsTable, accessorialSubscriptionsTable, accessorialAddonsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const CREDITS_PER_CALL: Record<string, number> = {
  "gpt-4o": 10,
  "gpt-4o-mini": 3,
  "gpt-5.2": 15,
  "default": 5,
};

function estimateCredits(model: string): number {
  return CREDITS_PER_CALL[model] ?? CREDITS_PER_CALL["default"];
}

async function getSubscription(clientId: number) {
  const [sub] = await db
    .select({
      id: accountSubscriptionsTable.id,
      creditBalance: accountSubscriptionsTable.creditBalance,
      status: accountSubscriptionsTable.status,
      planTier: subscriptionPlansTable.tier,
    })
    .from(accountSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(
      and(
        eq(accountSubscriptionsTable.clientId, clientId),
        eq(accountSubscriptionsTable.status, "active")
      )
    );
  return sub ?? null;
}

export function creditMeter(modelHint = "gpt-4o-mini") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.clientId) {
      next();
      return;
    }

    const clientId = req.user.clientId;

    try {
      const sub = await getSubscription(clientId);

      if (!sub) {
        next();
        return;
      }

      const credits = estimateCredits(modelHint);

      if (sub.creditBalance <= 0) {
        res.status(402).json({
          error: "credits_exhausted",
          message: "Your AI credit balance is empty. Upgrade your plan or wait for your next billing cycle to continue.",
          upgradeUrl: "/pricing",
          currentBalance: 0,
        });
        return;
      }

      await db
        .update(accountSubscriptionsTable)
        .set({ creditBalance: Math.max(0, sub.creditBalance - credits), updatedAt: new Date() })
        .where(eq(accountSubscriptionsTable.id, sub.id));

      await db.insert(usageEventsTable).values({
        clientId,
        model: modelHint,
        tokens: credits * 100,
        creditsDeducted: credits,
        route: req.path,
      });

      req.user = { ...req.user, creditBalance: Math.max(0, sub.creditBalance - credits) } as typeof req.user;

      next();
    } catch (err) {
      console.error("[creditMeter] Error:", err);
      next();
    }
  };
}

export async function checkAccessorial(clientId: number, addonKey: string): Promise<boolean> {
  const [addon] = await db
    .select({ id: accessorialAddonsTable.id })
    .from(accessorialAddonsTable)
    .where(eq(accessorialAddonsTable.key, addonKey));

  if (!addon) return false;

  const [sub] = await db
    .select({ id: accessorialSubscriptionsTable.id })
    .from(accessorialSubscriptionsTable)
    .where(
      and(
        eq(accessorialSubscriptionsTable.clientId, clientId),
        eq(accessorialSubscriptionsTable.addonId, addon.id),
        eq(accessorialSubscriptionsTable.status, "active")
      )
    );

  return !!sub;
}

export function requireAccessorial(addonKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.clientId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const hasAccess = await checkAccessorial(req.user.clientId, addonKey);
    if (!hasAccess) {
      res.status(403).json({
        error: "accessorial_required",
        message: `This feature requires the "${addonKey}" add-on. Activate it from your account settings.`,
        addonKey,
        upgradeUrl: "/pricing#addons",
      });
      return;
    }
    next();
  };
}
