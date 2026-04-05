import { db, aeoWebhooksTable, aeoScanRequestsTable, webhookDeliveriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";

export const PIRATEMONSTER_INBOUND_SECRET = process.env["PIRATEMONSTER_INBOUND_SECRET"] || "";
export const PIRATEMONSTER_API_KEY = process.env["PIRATEMONSTER_API_KEY"] || "";
export const PIRATEMONSTER_API_BASE_URL = process.env["PIRATEMONSTER_API_BASE_URL"] || "";

export function requireInboundSecret(req: Request, res: Response, next: NextFunction) {
  if (!PIRATEMONSTER_INBOUND_SECRET) {
    res.status(503).json({ error: "PirateMonster inbound secret not configured" });
    return;
  }

  const signature = req.headers["x-piratemonster-signature"] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: "Missing x-piratemonster-signature header" });
    return;
  }

  const rawBody: Buffer | undefined = (req as unknown as Record<string, unknown>)["rawBody"] as Buffer | undefined;
  const bodyBytes = rawBody ?? Buffer.from(JSON.stringify(req.body));

  const expected = `sha256=${crypto
    .createHmac("sha256", PIRATEMONSTER_INBOUND_SECRET)
    .update(bodyBytes)
    .digest("hex")}`;

  try {
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
    return;
  }

  next();
}

export async function queueWebhookDeliveries(scoreId: number, sourceUrl: string, eventType: string, payload: unknown) {
  try {
    const partnerKeysWithScans = await db
      .select({ partnerKeyId: aeoScanRequestsTable.partnerKeyId })
      .from(aeoScanRequestsTable)
      .where(eq(aeoScanRequestsTable.url, sourceUrl))
      .groupBy(aeoScanRequestsTable.partnerKeyId);

    const ownerKeyIds = new Set(partnerKeysWithScans.map((r) => r.partnerKeyId));

    const webhooks = await db
      .select()
      .from(aeoWebhooksTable)
      .where(eq(aeoWebhooksTable.status, "active"));

    const matchingWebhooks = webhooks.filter((wh) => {
      const events = wh.eventTypes as string[];
      return events.includes(eventType) && ownerKeyIds.has(wh.partnerKeyId);
    });

    if (matchingWebhooks.length === 0) return;

    const enrichedPayload = { ...(payload as Record<string, unknown>), sourceUrl };

    await db.insert(webhookDeliveriesTable).values(
      matchingWebhooks.map((wh) => ({
        webhookId: wh.id,
        scoreId,
        eventType,
        payload: enrichedPayload,
        status: "pending",
      }))
    );

    console.log(`[PM] Queued ${matchingWebhooks.length} webhook deliveries for event ${eventType} (url: ${sourceUrl})`);
  } catch (err) {
    console.error("[PM] Error queuing webhook deliveries:", err);
  }
}
