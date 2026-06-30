/**
 * Subscription restriction/cancellation middleware.
 *
 * Blocks new bot creation, bot deployment, and API key creation when the
 * client's subscription is:
 *   - "restricted" — dunning step 4 (14 days past due)
 *   - "cancelled"  — dunning step 5 (21 days past due), subscription terminated
 *
 * Existing bot RESPONSES are intentionally NOT blocked here — they use a
 * separate credit-meter path and continue as long as the subscription is active.
 */
import type { Request, Response, NextFunction } from "express";
import { db, accountSubscriptionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export async function requireUnrestricted(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user?.clientId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [sub] = await db
    .select({ id: accountSubscriptionsTable.id, status: accountSubscriptionsTable.status })
    .from(accountSubscriptionsTable)
    .where(
      and(
        eq(accountSubscriptionsTable.clientId, req.user.clientId),
        sql`${accountSubscriptionsTable.status} IN ('restricted', 'cancelled')`,
      ),
    );

  if (!sub) {
    next();
    return;
  }

  if (sub.status === "cancelled") {
    res.status(403).json({
      error: "account_cancelled",
      message:
        "Your subscription has been cancelled due to non-payment. " +
        "Please contact support or settle your outstanding balance to reactivate.",
      paymentUrl: "/billing/statements",
    });
    return;
  }

  res.status(403).json({
    error: "account_restricted",
    message:
      "Your account has been restricted due to an overdue invoice. " +
      "Existing bots continue to operate but creating new bots and API keys " +
      "is blocked until your balance is settled.",
    paymentUrl: "/billing/statements",
  });
}
