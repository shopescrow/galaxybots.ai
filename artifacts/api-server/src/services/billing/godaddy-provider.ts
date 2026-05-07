import crypto from "crypto";
import { db, billingProviderConfigTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { BillingEvent, BillingWebhookResult } from "./webhook-handler";

const VALID_PLANS = ["single", "team", "enterprise"];

export interface GoDaddyPaymentLinkConfig {
  single?: string;
  team?: string;
  enterprise?: string;
}

export async function getGoDaddyPaymentLinks(): Promise<GoDaddyPaymentLinkConfig> {
  try {
    const rows = await db
      .select({ tier: billingProviderConfigTable.tier, paymentLinkUrl: billingProviderConfigTable.paymentLinkUrl })
      .from(billingProviderConfigTable)
      .where(eq(billingProviderConfigTable.provider, "godaddy"));

    if (rows.length > 0) {
      const config: GoDaddyPaymentLinkConfig = {};
      for (const row of rows) {
        if (row.tier === "single" || row.tier === "team" || row.tier === "enterprise") {
          config[row.tier] = row.paymentLinkUrl;
        }
      }
      return config;
    }
  } catch (err) {
    console.error("Failed to load GoDaddy payment links from DB, falling back to env vars:", err);
  }

  return {
    single: process.env["GODADDY_PAYMENT_LINK_SINGLE"] || undefined,
    team: process.env["GODADDY_PAYMENT_LINK_TEAM"] || undefined,
    enterprise: process.env["GODADDY_PAYMENT_LINK_ENTERPRISE"] || undefined,
  };
}

export async function upsertGoDaddyPaymentLink(tier: string, paymentLinkUrl: string, updatedBy: number) {
  if (!VALID_PLANS.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}. Must be one of: ${VALID_PLANS.join(", ")}`);
  }

  const [existing] = await db
    .select()
    .from(billingProviderConfigTable)
    .where(and(eq(billingProviderConfigTable.provider, "godaddy"), eq(billingProviderConfigTable.tier, tier)));

  if (existing) {
    const [updated] = await db
      .update(billingProviderConfigTable)
      .set({ paymentLinkUrl, updatedBy, updatedAt: new Date() })
      .where(eq(billingProviderConfigTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(billingProviderConfigTable)
    .values({ provider: "godaddy", tier, paymentLinkUrl, updatedBy })
    .returning();
  return created;
}

export async function listBillingProviderConfigs(provider?: string) {
  if (provider) {
    return db
      .select()
      .from(billingProviderConfigTable)
      .where(eq(billingProviderConfigTable.provider, provider));
  }
  return db.select().from(billingProviderConfigTable);
}

export function getActiveBillingProvider(): "stripe" | "godaddy" {
  const provider = process.env["BILLING_PROVIDER"];
  if (provider === "godaddy") return "godaddy";
  return "stripe";
}

function verifyGoDaddySignature(payload: Buffer | string, signature: string): boolean {
  const secret = process.env["GODADDY_WEBHOOK_SECRET"];
  if (!secret) return false;

  const raw = typeof payload === "string" ? payload : payload.toString("utf-8");
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

interface GoDaddyWebhookBody {
  eventType?: string;
  orderId?: string;
  customFields?: {
    clientId?: string;
    plan?: string;
  };
  metadata?: {
    clientId?: string;
    plan?: string;
  };
  amount?: number;
  currency?: string;
  status?: string;
}

export function parseGoDaddyPayload(rawPayload: unknown, signature?: string): BillingWebhookResult {
  const apiKey = process.env["GODADDY_API_KEY"];
  const apiSecret = process.env["GODADDY_API_SECRET"];
  const webhookSecret = process.env["GODADDY_WEBHOOK_SECRET"];

  if (!apiKey || !apiSecret || !webhookSecret) {
    return { received: false, error: "GoDaddy Payments not configured" };
  }

  if (!signature) {
    return { received: false, error: "Missing x-godaddy-signature header" };
  }

  const payloadBuffer = rawPayload instanceof Buffer ? rawPayload : Buffer.from(String(rawPayload));

  try {
    if (!verifyGoDaddySignature(payloadBuffer, signature)) {
      return { received: false, error: "Invalid GoDaddy webhook signature" };
    }
  } catch {
    return { received: false, error: "Invalid GoDaddy webhook signature" };
  }

  let body: GoDaddyWebhookBody;
  try {
    const raw = payloadBuffer.toString("utf-8");
    body = JSON.parse(raw) as GoDaddyWebhookBody;
  } catch {
    return { received: false, error: "Invalid JSON payload" };
  }

  if (body.eventType === "PAYMENT_COMPLETED" || body.status === "COMPLETED") {
    const meta = body.customFields || body.metadata;
    const clientId = meta?.clientId;
    const plan = meta?.plan;

    if (clientId && plan && VALID_PLANS.includes(plan)) {
      const event: BillingEvent = {
        type: "plan_activated",
        clientId: Number(clientId),
        plan,
        metadata: {
          provider: "godaddy",
          orderId: body.orderId,
          amount: body.amount,
          currency: body.currency,
        },
      };
      return { received: true, event };
    }

    console.error("GoDaddy webhook: missing or invalid metadata", { clientId, plan });
  }

  return { received: true };
}
