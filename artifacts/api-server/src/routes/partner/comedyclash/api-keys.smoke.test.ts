import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {
  db,
  platformApiKeysTable,
  partnerWebhookSubscriptionsTable,
  partnerWebhookDeliveriesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import * as nodeHttp from "node:http";
import supertest from "supertest";
import { createTestUser, cleanupTestUser, authedAgent, type TestUser } from "../../../test-utils";
import app from "../../../app";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function encryptForSubscription(secret: string): { encryptedSecret: string; iv: string; authTag: string } {
  const encryptionKey = process.env.WEBHOOK_SECRET_KEY!;
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const ivBuf = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, ivBuf, { authTagLength: 16 });
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return { encryptedSecret: encrypted, iv: ivBuf.toString("hex"), authTag: authTag.toString("hex") };
}

async function pollDeliveryStatus(
  deliveryId: number,
  targetStatuses: string[],
  timeoutMs = 15000,
  intervalMs = 500,
): Promise<{ status: string; attemptCount: number; deliveredAt: Date | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await db
      .select()
      .from(partnerWebhookDeliveriesTable)
      .where(eq(partnerWebhookDeliveriesTable.id, deliveryId));
    if (row && targetStatuses.includes(row.status)) {
      return { status: row.status, attemptCount: row.attemptCount, deliveredAt: row.deliveredAt };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const [row] = await db
    .select()
    .from(partnerWebhookDeliveriesTable)
    .where(eq(partnerWebhookDeliveriesTable.id, deliveryId));
  return { status: row.status, attemptCount: row.attemptCount, deliveredAt: row.deliveredAt };
}

describe("ComedyClash API key rotation smoke tests", () => {
  const createdKeyIds: number[] = [];
  const createdSubIds: number[] = [];
  const createdDeliveryIds: number[] = [];
  const testUsers: TestUser[] = [];

  let receiverServer: nodeHttp.Server;
  let receiverPort: number;
  let lastReceivedBody: string | null = null;

  // Shared fixtures — all created in beforeAll to minimise per-test DB round-trips.
  let rotateUser: TestUser;
  let rotateKeyId: number;
  let rawOldKey: string;

  let deliveryUser: TestUser;
  let deliveryKeyId: number;

  let expiryUser: TestUser;
  let rawExpiredOldKey: string;
  let rawExpiredNewKey: string;

  beforeAll(async () => {
    receiverServer = nodeHttp.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        lastReceivedBody = body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => { receiverServer.listen(0, () => resolve()); });
    receiverPort = (receiverServer.address() as { port: number }).port;

    // — Fixture for "rotate endpoint" + "old key valid in 24h" tests —
    rotateUser = await createTestUser();
    testUsers.push(rotateUser);

    rawOldKey = `cck_rotate_smoke_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const [insertedKey] = await db
      .insert(platformApiKeysTable)
      .values({
        platform: "comedyclash",
        label: "Rotate smoke key",
        keyHash: hashKey(rawOldKey),
        clientId: rotateUser.clientId,
        status: "active",
        rateLimit: 100,
      })
      .returning();
    rotateKeyId = insertedKey.id;
    createdKeyIds.push(rotateKeyId);

    // — Fixture for "delivery enqueued before rotation" test —
    deliveryUser = await createTestUser();
    testUsers.push(deliveryUser);

    const deliveryRawKey = `cck_delivery_smoke_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const [deliveryApiKey] = await db
      .insert(platformApiKeysTable)
      .values({
        platform: "comedyclash",
        label: "Delivery-before-rotation smoke key",
        keyHash: hashKey(deliveryRawKey),
        clientId: deliveryUser.clientId,
        status: "active",
        rateLimit: 100,
      })
      .returning();
    deliveryKeyId = deliveryApiKey.id;
    createdKeyIds.push(deliveryKeyId);

    // — Fixture for "24h expiry rejects old key" test —
    expiryUser = await createTestUser();
    testUsers.push(expiryUser);

    rawExpiredOldKey = `cck_expired_smoke_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    rawExpiredNewKey = `cck_expired_smoke_new_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
    const rotatedAt25hAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const [expiredKey] = await db
      .insert(platformApiKeysTable)
      .values({
        platform: "comedyclash",
        label: "Expired rotation smoke key",
        keyHash: hashKey(rawExpiredNewKey),
        previousKeyHash: hashKey(rawExpiredOldKey),
        rotatedAt: rotatedAt25hAgo,
        clientId: expiryUser.clientId,
        status: "active",
        rateLimit: 100,
      })
      .returning();
    createdKeyIds.push(expiredKey.id);
  }, 120000);

  afterAll(async () => {
    for (const id of createdDeliveryIds) {
      await db.delete(partnerWebhookDeliveriesTable).where(eq(partnerWebhookDeliveriesTable.id, id)).catch(() => {});
    }
    for (const id of createdSubIds) {
      await db.delete(partnerWebhookSubscriptionsTable).where(eq(partnerWebhookSubscriptionsTable.id, id)).catch(() => {});
    }
    for (const id of createdKeyIds) {
      await db.delete(platformApiKeysTable).where(eq(platformApiKeysTable.id, id)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
    await new Promise<void>((resolve) => { receiverServer?.close(() => resolve()); });
  }, 60000);

  it("rotate endpoint issues a new key; DB confirms old key hash is within the 24h grace window", async () => {
    const rotateRes = await authedAgent(rotateUser.token)
      .post(`/api/v1/integrations/comedyclash/api-keys/${rotateKeyId}/rotate`);

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.key).toMatch(/^cck_/);
    expect(rotateRes.body.rotatedAt).toBeTruthy();

    const newRawKey = rotateRes.body.key as string;

    const [updated] = await db
      .select()
      .from(platformApiKeysTable)
      .where(eq(platformApiKeysTable.id, rotateKeyId));

    // Old key hash must be stored as previousKeyHash.
    expect(updated.previousKeyHash).toBe(hashKey(rawOldKey));
    // Key hash must have changed to the new key.
    expect(updated.keyHash).toBe(hashKey(newRawKey));
    // rotatedAt must be set and within the last few seconds.
    expect(updated.rotatedAt).toBeTruthy();
    const msSinceRotation = Date.now() - new Date(updated.rotatedAt!).getTime();
    expect(msSinceRotation).toBeLessThan(24 * 60 * 60 * 1000);

    // Verify the old key is still accepted during the grace window.
    const oldKeyRes = await supertest(app)
      .get("/api/v1/integrations/comedyclash/api-keys")
      .set("x-platform-key", rawOldKey);
    expect(oldKeyRes.status).toBe(200);

    // Verify the new key is also accepted.
    const newKeyRes = await supertest(app)
      .get("/api/v1/integrations/comedyclash/api-keys")
      .set("x-platform-key", newRawKey);
    expect(newKeyRes.status).toBe(200);
  }, 90000);

  it("a delivery enqueued before key rotation is delivered successfully after rotation", async () => {
    const { encryptedSecret, iv, authTag } = encryptForSubscription(`whsec_delivery_${Date.now()}`);

    const [sub] = await db
      .insert(partnerWebhookSubscriptionsTable)
      .values({
        partner: "comedyclash",
        clientId: deliveryUser.clientId,
        targetUrl: `http://localhost:${receiverPort}/cc-receiver`,
        encryptedSecret,
        iv,
        authTag,
        events: ["session.completed"],
        status: "active",
      })
      .returning();
    createdSubIds.push(sub.id);

    // Enqueue a delivery — this simulates an event dispatched BEFORE the key rotation.
    const [delivery] = await db
      .insert(partnerWebhookDeliveriesTable)
      .values({
        subscriptionId: sub.id,
        partner: "comedyclash",
        eventType: "session.completed",
        payload: { event: "session.completed", partner: "galaxybots", sessionId: "smoke-pre-rotate", timestamp: new Date().toISOString() },
        status: "pending",
        attemptCount: 0,
      })
      .returning();
    createdDeliveryIds.push(delivery.id);

    // Simulate key rotation — update the DB directly to represent a rotated state.
    const newKeyHash = hashKey(`cck_delivery_rotated_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`);
    await db
      .update(platformApiKeysTable)
      .set({ keyHash: newKeyHash, previousKeyHash: hashKey(`cck_delivery_smoke_placeholder`), rotatedAt: new Date() })
      .where(eq(platformApiKeysTable.id, deliveryKeyId));

    lastReceivedBody = null;

    // Run the delivery worker — must still deliver the pre-rotation pending event.
    const { processPartnerDeliveries } = await import("../../../services/platform/partner-webhook-emitter");
    await processPartnerDeliveries();

    const result = await pollDeliveryStatus(delivery.id, ["delivered"], 15000, 500);

    expect(result.status).toBe("delivered");
    expect(result.attemptCount).toBeGreaterThanOrEqual(1);
    expect(result.deliveredAt).toBeTruthy();
    expect(lastReceivedBody).toBeTruthy();
  }, 90000);

  it("the old key is rejected with 401 after the 24h rotation grace window expires", async () => {
    // Expired key DB state set up in beforeAll with rotatedAt 25h ago.
    const expiredKeyRes = await supertest(app)
      .get("/api/v1/integrations/comedyclash/api-keys")
      .set("x-platform-key", rawExpiredOldKey);

    expect(expiredKeyRes.status).toBe(401);
    expect(expiredKeyRes.body.error).toMatch(/expired after rotation/i);

    // The current (new) key must still be accepted after the old one expires.
    const newKeyRes = await supertest(app)
      .get("/api/v1/integrations/comedyclash/api-keys")
      .set("x-platform-key", rawExpiredNewKey);
    expect(newKeyRes.status).toBe(200);
  }, 90000);
});
