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

  const fireSignatureIncident = (reason: string, remoteIp: string) => {
    import("../../../services/guardian/queen-orchestrator").then(async ({ runSwarmCycle }) => {
      const { db: gdb, guardianIncidentsTable } = await import("@workspace/db");
      const fp = `piratemonster:sig_fail:${remoteIp}`.slice(0, 32);
      await gdb.insert(guardianIncidentsTable).values({
        domain: "webhook_auth",
        title: `PirateMonster HMAC Signature Failure (${reason})`,
        description: `Inbound webhook rejected: ${reason}. Remote IP: ${remoteIp}. This may indicate a replay attack, misconfigured secret, or an unauthorised caller attempting to inject data.`,
        severity: 82,
        blastRadius: 70,
        status: "open",
        affectedComponent: "PirateMonster inbound webhook",
        errorFingerprint: fp,
        sourcePayload: { reason, remoteIp, at: new Date().toISOString() },
      });
      await runSwarmCycle();
    }).catch(() => {});
  };

  try {
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      fireSignatureIncident("hmac_mismatch", req.ip ?? "unknown");
      res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
      return;
    }
  } catch {
    fireSignatureIncident("comparison_error", req.ip ?? "unknown");
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
