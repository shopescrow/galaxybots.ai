import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db, aeoWebhooksTable, webhookDeliveriesTable, platformApiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import * as nodeHttp from "node:http";
import { createTestUser, cleanupTestUser, type TestUser } from "../../test-utils";
import { processDeliveries } from "./webhook-delivery";

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
      .from(webhookDeliveriesTable)
      .where(eq(webhookDeliveriesTable.id, deliveryId));
    if (row && targetStatuses.includes(row.status)) {
      return { status: row.status, attemptCount: row.attemptCount, deliveredAt: row.deliveredAt };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const [row] = await db
    .select()
    .from(webhookDeliveriesTable)
    .where(eq(webhookDeliveriesTable.id, deliveryId));
  return { status: row.status, attemptCount: row.attemptCount, deliveredAt: row.deliveredAt };
}

function encryptSecret(value: string): string {
  const encryptionKey = process.env.WEBHOOK_SECRET_KEY!;
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv, { authTagLength: 16 });
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

describe("Webhook delivery smoke tests", () => {
  const createdWebhookIds: number[] = [];
  const createdDeliveryIds: number[] = [];
  const createdKeyIds: number[] = [];
  const testUsers: TestUser[] = [];

  let successServer: nodeHttp.Server;
  let failServer: nodeHttp.Server;
  let successPort: number;
  let failPort: number;

  let receivedBody: string | null = null;
  let receivedSignature: string | null = null;
  let receivedEventType: string | null = null;

  beforeAll(async () => {
    successServer = nodeHttp.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        receivedBody = body;
        receivedSignature = req.headers["x-piratemonster-signature"] as string || null;
        receivedEventType = req.headers["x-piratemonster-event"] as string || null;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    failServer = nodeHttp.createServer((_req, res) => {
      let body = "";
      _req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      _req.on("end", () => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "server error" }));
      });
    });

    await new Promise<void>((resolve) => { successServer.listen(0, () => resolve()); });
    successPort = (successServer.address() as { port: number }).port;

    await new Promise<void>((resolve) => { failServer.listen(0, () => resolve()); });
    failPort = (failServer.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const id of createdDeliveryIds) {
      await db.delete(webhookDeliveriesTable).where(eq(webhookDeliveriesTable.id, id)).catch(() => {});
    }
    for (const id of createdWebhookIds) {
      await db.delete(aeoWebhooksTable).where(eq(aeoWebhooksTable.id, id)).catch(() => {});
    }
    for (const id of createdKeyIds) {
      await db.delete(platformApiKeysTable).where(eq(platformApiKeysTable.id, id)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
    await new Promise<void>((resolve) => { successServer?.close(() => resolve()); });
    await new Promise<void>((resolve) => { failServer?.close(() => resolve()); });
  });

  async function createWebhookFixture(targetUrl?: string) {
    const user = await createTestUser();
    testUsers.push(user);

    const rawApiKey = `pm_wh_smoke_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const keyHash = crypto.createHash("sha256").update(rawApiKey).digest("hex");

    const [apiKey] = await db
      .insert(platformApiKeysTable)
      .values({
        clientId: user.clientId,
        platform: "piratemonster_mcp",
        keyHash,
        label: "Webhook Smoke Test Key",
        status: "active",
        rateLimit: 100,
      })
      .returning();
    createdKeyIds.push(apiKey.id);

    const secret = `whsec_smoke_${Date.now()}`;
    const encryptedSecret = encryptSecret(secret);

    const url = targetUrl ?? `http://localhost:${successPort}/receiver`;

    const [webhook] = await db
      .insert(aeoWebhooksTable)
      .values({
        partnerKeyId: apiKey.id,
        targetUrl: url,
        eventTypes: ["score.completed"],
        status: "active",
        secretHash: encryptedSecret,
      })
      .returning();
    createdWebhookIds.push(webhook.id);

    return { user, apiKey, webhook, secret, encryptedSecret };
  }

  it("should deliver a pending webhook via the worker and verify HMAC signature", async () => {
    receivedBody = null;
    receivedSignature = null;
    receivedEventType = null;

    const { webhook, secret } = await createWebhookFixture();

    const [delivery] = await db
      .insert(webhookDeliveriesTable)
      .values({
        webhookId: webhook.id,
        eventType: "score.completed",
        payload: { test: true, score: 85 },
        status: "pending",
        attemptCount: 0,
      })
      .returning();
    createdDeliveryIds.push(delivery.id);

    await processDeliveries();
    const result = await pollDeliveryStatus(delivery.id, ["delivered"], 5000, 200);

    expect(result.status).toBe("delivered");
    expect(result.attemptCount).toBeGreaterThanOrEqual(1);
    expect(result.deliveredAt).toBeTruthy();

    expect(receivedBody).toBeTruthy();
    expect(receivedEventType).toBe("score.completed");

    if (receivedBody && receivedSignature) {
      const expectedHmac = crypto.createHmac("sha256", secret).update(receivedBody).digest("hex");
      expect(receivedSignature).toBe(`sha256=${expectedHmac}`);
    }
  }, 20000);

  it("should mark delivery as failed after max retries when target returns 500", async () => {
    const { webhook } = await createWebhookFixture(`http://localhost:${failPort}/receiver`);

    const [delivery] = await db
      .insert(webhookDeliveriesTable)
      .values({
        webhookId: webhook.id,
        eventType: "score.completed",
        payload: { test: true },
        status: "pending",
        attemptCount: 2,
        lastAttemptAt: new Date(Date.now() - 120000),
      })
      .returning();
    createdDeliveryIds.push(delivery.id);

    await processDeliveries();
    const result = await pollDeliveryStatus(delivery.id, ["failed"], 5000, 200);

    expect(result.status).toBe("failed");
    expect(result.attemptCount).toBe(3);
  }, 20000);

  it("should correctly encrypt and decrypt webhook secrets round-trip", () => {
    const originalSecret = "my-test-webhook-secret";
    const encrypted = encryptSecret(originalSecret);

    expect(encrypted.startsWith("enc:")).toBe(true);

    const encryptionKey = process.env.WEBHOOK_SECRET_KEY!;
    const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
    const withoutPrefix = encrypted.slice(4);
    const [ivHex, authTagHex, encryptedHex] = withoutPrefix.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    expect(decrypted).toBe(originalSecret);
  });

  it("should compute correct HMAC signature matching the delivery header format", () => {
    const secret = "test-hmac-secret";
    const payload = JSON.stringify({ event: "score.completed", data: { score: 90 } });

    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const signatureHeader = `sha256=${hmac}`;

    expect(signatureHeader).toMatch(/^sha256=[a-f0-9]{64}$/);

    const hmacDiff = crypto.createHmac("sha256", "different-secret").update(payload).digest("hex");
    expect(hmacDiff).not.toBe(hmac);
  });
});
