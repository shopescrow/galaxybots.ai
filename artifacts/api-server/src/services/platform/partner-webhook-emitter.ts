import { db, partnerWebhookSubscriptionsTable, partnerWebhookDeliveriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";
import type { ComedyClashEvent } from "./webhook-delivery";

function decryptSecret(encryptedSecret: string, iv: string, authTag: string): string {
  const encryptionKey = process.env["WEBHOOK_SECRET_KEY"];
  if (!encryptionKey) throw new Error("WEBHOOK_SECRET_KEY not configured");
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, Buffer.from(iv, "hex"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encryptedSecret, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function enqueuePartnerEvent(
  partner: string,
  eventSlug: ComedyClashEvent | string,
  payload: Record<string, unknown>,
  clientId?: number | null,
): Promise<void> {
  try {
    const conditions = clientId != null
      ? and(
          eq(partnerWebhookSubscriptionsTable.partner, partner),
          eq(partnerWebhookSubscriptionsTable.status, "active"),
          eq(partnerWebhookSubscriptionsTable.clientId, clientId),
        )
      : and(
          eq(partnerWebhookSubscriptionsTable.partner, partner),
          eq(partnerWebhookSubscriptionsTable.status, "active"),
        );

    const subscriptions = await db
      .select()
      .from(partnerWebhookSubscriptionsTable)
      .where(conditions);

    const matching = subscriptions.filter((sub) => {
      const events = sub.events as string[];
      return events.includes(eventSlug);
    });

    if (matching.length === 0) return;

    const enrichedPayload = { ...payload, event: eventSlug, partner: "galaxybots", timestamp: new Date().toISOString() };

    await db.insert(partnerWebhookDeliveriesTable).values(
      matching.map((sub) => ({
        subscriptionId: sub.id,
        partner,
        eventType: eventSlug,
        payload: enrichedPayload,
        status: "pending",
      }))
    );

    console.log(`[PartnerWebhookEmitter] Queued ${matching.length} deliveries for ${partner} event: ${eventSlug}`);
  } catch (err) {
    console.error(`[PartnerWebhookEmitter] Error enqueuing ${eventSlug} for partner ${partner}:`, err);
  }
}

export async function enqueueComedyClashEvent(
  eventSlug: ComedyClashEvent | string,
  payload: Record<string, unknown>,
  clientId?: number | null,
): Promise<void> {
  return enqueuePartnerEvent("comedyclash", eventSlug, payload, clientId);
}

export async function processPartnerDeliveries(): Promise<void> {
  const DELIVERY_TIMEOUT_MS = 15_000;
  const MAX_ATTEMPTS = 3;
  const BACKOFF_BASE_MS = 30_000;

  try {
    const now = new Date();
    const pending = await db
      .select({
        delivery: partnerWebhookDeliveriesTable,
        subscription: partnerWebhookSubscriptionsTable,
      })
      .from(partnerWebhookDeliveriesTable)
      .innerJoin(
        partnerWebhookSubscriptionsTable,
        eq(partnerWebhookDeliveriesTable.subscriptionId, partnerWebhookSubscriptionsTable.id),
      )
      .where(
        and(
          eq(partnerWebhookDeliveriesTable.status, "pending"),
          eq(partnerWebhookSubscriptionsTable.status, "active"),
        )
      )
      .limit(20);

    for (const { delivery, subscription } of pending) {
      const [claimed] = await db
        .update(partnerWebhookDeliveriesTable)
        .set({ status: "processing" })
        .where(
          and(
            eq(partnerWebhookDeliveriesTable.id, delivery.id),
            eq(partnerWebhookDeliveriesTable.status, "pending"),
          )
        )
        .returning({ id: partnerWebhookDeliveriesTable.id });

      if (!claimed) continue;

      let secret = "";
      try {
        secret = decryptSecret(subscription.encryptedSecret, subscription.iv, subscription.authTag);
      } catch (e) {
        console.error(`[PartnerWebhookWorker] Failed to decrypt secret for sub ${subscription.id}:`, e);
        await db.update(partnerWebhookDeliveriesTable)
          .set({ status: "failed", attemptCount: delivery.attemptCount + 1, lastAttemptAt: now })
          .where(eq(partnerWebhookDeliveriesTable.id, delivery.id));
        continue;
      }

      const payloadStr = JSON.stringify(delivery.payload);
      const hmac = `sha256=${crypto.createHmac("sha256", secret).update(payloadStr).digest("hex")}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

        const res = await fetch(subscription.targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GalaxyBots-Signature": hmac,
            "X-GalaxyBots-Event": delivery.eventType,
            "X-GalaxyBots-Delivery": String(delivery.id),
          },
          body: payloadStr,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) {
          await db.update(partnerWebhookDeliveriesTable)
            .set({ status: "delivered", deliveredAt: now, attemptCount: delivery.attemptCount + 1, lastAttemptAt: now, responseStatus: res.status })
            .where(eq(partnerWebhookDeliveriesTable.id, delivery.id));
          console.log(`[PartnerWebhookWorker] Delivered ${delivery.id} to ${subscription.targetUrl}`);
        } else {
          const nextAttempt = delivery.attemptCount + 1;
          if (nextAttempt >= MAX_ATTEMPTS) {
            await db.update(partnerWebhookDeliveriesTable)
              .set({ status: "failed", attemptCount: nextAttempt, lastAttemptAt: now, responseStatus: res.status })
              .where(eq(partnerWebhookDeliveriesTable.id, delivery.id));
          } else {
            await db.update(partnerWebhookDeliveriesTable)
              .set({ status: "pending", attemptCount: nextAttempt, lastAttemptAt: now, responseStatus: res.status })
              .where(eq(partnerWebhookDeliveriesTable.id, delivery.id));
          }
          console.warn(`[PartnerWebhookWorker] Delivery ${delivery.id} HTTP ${res.status} (attempt ${delivery.attemptCount + 1}/${MAX_ATTEMPTS})`);
        }
      } catch (err) {
        const nextAttempt = delivery.attemptCount + 1;
        const newStatus = nextAttempt >= MAX_ATTEMPTS ? "failed" : "pending";
        await db.update(partnerWebhookDeliveriesTable)
          .set({ status: newStatus, attemptCount: nextAttempt, lastAttemptAt: now })
          .where(eq(partnerWebhookDeliveriesTable.id, delivery.id));
        console.error(`[PartnerWebhookWorker] Delivery ${delivery.id} error: ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("relation") && msg.includes("does not exist")) {
      console.error(`[PartnerWebhookWorker] Missing table: ${msg}. Run migration to create partner_webhook_deliveries.`);
    } else {
      console.error("[PartnerWebhookWorker] Error processing partner deliveries:", err);
    }
  }
}
