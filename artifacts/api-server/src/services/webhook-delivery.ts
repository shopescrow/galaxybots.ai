import { db, webhookDeliveriesTable, aeoWebhooksTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import crypto from "node:crypto";

const DELIVERY_INTERVAL_MS = 10_000;
const MAX_ATTEMPTS = 3;
const DELIVERY_TIMEOUT_MS = 15_000;
const BACKOFF_BASE_MS = 30_000;

function decryptSecret(encryptedValue: string): string {
  const encryptionKey = process.env.WEBHOOK_SECRET_KEY;
  if (!encryptionKey) {
    throw new Error("WEBHOOK_SECRET_KEY not configured");
  }
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const withoutPrefix = encryptedValue.startsWith("enc:") ? encryptedValue.slice(4) : encryptedValue;
  const [ivHex, authTagHex, encryptedHex] = withoutPrefix.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function computeHmac(payload: string, encryptedSecret: string): string {
  const rawSecret = decryptSecret(encryptedSecret);
  return crypto.createHmac("sha256", rawSecret).update(payload).digest("hex");
}

function getBackoffDelay(attemptCount: number): number {
  return BACKOFF_BASE_MS * Math.pow(2, attemptCount - 1);
}

async function processDeliveries() {
  try {
    const now = new Date();

    const pending = await db
      .select({
        delivery: webhookDeliveriesTable,
        webhook: aeoWebhooksTable,
      })
      .from(webhookDeliveriesTable)
      .innerJoin(aeoWebhooksTable, eq(webhookDeliveriesTable.webhookId, aeoWebhooksTable.id))
      .where(
        and(
          eq(webhookDeliveriesTable.status, "pending"),
          eq(aeoWebhooksTable.status, "active"),
          or(
            sql`${webhookDeliveriesTable.lastAttemptAt} IS NULL`,
            sql`${webhookDeliveriesTable.lastAttemptAt} + (${BACKOFF_BASE_MS} * power(2, ${webhookDeliveriesTable.attemptCount} - 1) * interval '1 millisecond') <= ${now}`
          )
        )
      )
      .limit(20);

    for (const { delivery, webhook } of pending) {
      const [claimed] = await db
        .update(webhookDeliveriesTable)
        .set({ status: "processing" })
        .where(
          and(
            eq(webhookDeliveriesTable.id, delivery.id),
            eq(webhookDeliveriesTable.status, "pending")
          )
        )
        .returning({ id: webhookDeliveriesTable.id });

      if (!claimed) continue;

      const payloadStr = JSON.stringify(delivery.payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-PirateMonster-Event": delivery.eventType,
        "X-PirateMonster-Delivery": String(delivery.id),
      };

      if (webhook.secretHash) {
        const hmac = computeHmac(payloadStr, webhook.secretHash);
        headers["X-PirateMonster-Signature"] = `sha256=${hmac}`;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

        const res = await fetch(webhook.targetUrl, {
          method: "POST",
          headers,
          body: payloadStr,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (res.ok) {
          await db
            .update(webhookDeliveriesTable)
            .set({
              status: "delivered",
              deliveredAt: new Date(),
              attemptCount: delivery.attemptCount + 1,
              lastAttemptAt: new Date(),
            })
            .where(eq(webhookDeliveriesTable.id, delivery.id));

          await db
            .update(aeoWebhooksTable)
            .set({ lastDeliveredAt: new Date() })
            .where(eq(aeoWebhooksTable.id, webhook.id));

          console.log(`[WebhookWorker] Delivered ${delivery.id} to ${webhook.targetUrl}`);
        } else {
          const nextAttempt = delivery.attemptCount + 1;
          const backoffMs = getBackoffDelay(nextAttempt);
          console.log(`[WebhookWorker] Delivery ${delivery.id} got HTTP ${res.status}, next retry in ${backoffMs}ms`);
          await handleFailedAttempt(delivery.id, nextAttempt, webhook.id);
        }
      } catch (err) {
        const nextAttempt = delivery.attemptCount + 1;
        const backoffMs = getBackoffDelay(nextAttempt);
        console.error(`[WebhookWorker] Error delivering ${delivery.id}: ${err instanceof Error ? err.message : err}, next retry in ${backoffMs}ms`);
        await handleFailedAttempt(delivery.id, nextAttempt, webhook.id);
      }
    }
  } catch (err) {
    console.error("[WebhookWorker] Error processing deliveries:", err);
  }
}

async function handleFailedAttempt(deliveryId: number, attemptCount: number, webhookId: number) {
  if (attemptCount >= MAX_ATTEMPTS) {
    await db
      .update(webhookDeliveriesTable)
      .set({
        status: "failed",
        attemptCount,
        lastAttemptAt: new Date(),
      })
      .where(eq(webhookDeliveriesTable.id, deliveryId));

    await db
      .update(aeoWebhooksTable)
      .set({ status: "failed" })
      .where(eq(aeoWebhooksTable.id, webhookId));

    console.log(`[WebhookWorker] Delivery ${deliveryId} failed after ${MAX_ATTEMPTS} attempts. Webhook ${webhookId} marked failed.`);
  } else {
    await db
      .update(webhookDeliveriesTable)
      .set({
        status: "pending",
        attemptCount,
        lastAttemptAt: new Date(),
      })
      .where(eq(webhookDeliveriesTable.id, deliveryId));

    console.log(`[WebhookWorker] Delivery ${deliveryId} attempt ${attemptCount}/${MAX_ATTEMPTS} failed, will retry with exponential backoff.`);
  }
}

let deliveryInterval: ReturnType<typeof setInterval> | null = null;

export function startWebhookDeliveryWorker() {
  if (deliveryInterval) return;
  console.log("[WebhookWorker] Starting webhook delivery worker (10s interval, exponential backoff)");
  deliveryInterval = setInterval(() => {
    processDeliveries().catch((err) => {
      console.error("[WebhookWorker] Unhandled error in delivery tick (will retry next interval):", err);
    });
  }, DELIVERY_INTERVAL_MS);
}

export function stopWebhookDeliveryWorker() {
  if (deliveryInterval) {
    clearInterval(deliveryInterval);
    deliveryInterval = null;
    console.log("[WebhookWorker] Stopped webhook delivery worker");
  }
}
