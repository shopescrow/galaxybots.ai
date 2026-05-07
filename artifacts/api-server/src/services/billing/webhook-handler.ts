import type { Request, Response } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { parseStripePayload } from "./stripe-provider";
import { parseGoDaddyPayload } from "./godaddy-provider";

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

async function applyBillingEvent(event: BillingEvent): Promise<void> {
  if (event.type === "plan_activated" && VALID_PLANS.includes(event.plan)) {
    await activateClientPlan(event.clientId, event.plan);
    console.log(`Billing: activated client ${event.clientId} with plan ${event.plan} via ${event.metadata?.provider || "unknown"}`);
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
