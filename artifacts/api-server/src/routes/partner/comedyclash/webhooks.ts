import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  db,
  partnerInboundSecretsTable,
  partnerInboundEventsTable,
  partnerWebhookSubscriptionsTable,
  partnerCredentialsTable,
  partnerWebhookDeliveriesTable,
  pipelinesTable,
  pipelineTriggersTable,
  triggerEventsTable,
  taskSessionsTable,
  botsTable,
} from "@workspace/db";
import { eq, desc, and, ilike } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";
import { encryptValue } from "../../../services/partners/comedyclash-client";
import { testConnection } from "../../../services/partners/comedyclash-client";
import { executePipelineRun } from "../../../services/missions/pipeline-engine";
import crypto from "node:crypto";
import { z } from "zod/v4";

const router: IRouter = Router();

const COMEDYCLASH_EVENTS = [
  "session.completed",
  "session.failed",
  "bot.output_ready",
  "lead.qualified",
  "task.finished",
] as const;

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

const InboundEventSchema = z.object({
  eventType: z.string(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  sessionId: z.string().optional(),
});

router.post("/integrations/comedyclash/inbound-webhook", async (req, res): Promise<void> => {
  try {
    const [secretRecord] = await db
      .select()
      .from(partnerInboundSecretsTable)
      .where(eq(partnerInboundSecretsTable.partner, "comedyclash"))
      .limit(1);

    if (!secretRecord) {
      const parsed = InboundEventSchema.safeParse(req.body);
      const eventType = parsed.success ? parsed.data.eventType : "unknown";
      const payload = parsed.success ? parsed.data.payload : {};
      const sessionId = parsed.success ? (parsed.data.sessionId ?? null) : null;
      const [queued] = await db.insert(partnerInboundEventsTable).values({
        partner: "comedyclash",
        clientId: null,
        eventType,
        payload,
        status: "unauthenticated",
        sessionId,
      }).returning({ id: partnerInboundEventsTable.id });
      console.warn(`[CC] Inbound event stored as unauthenticated (no secret configured): ${eventType} (id=${queued.id})`);
      res.status(202).json({
        queued: true,
        eventId: queued.id,
        warning: "No inbound signing secret is configured. Event stored as unauthenticated and will not trigger pipelines until a secret is generated.",
      });
      return;
    }

    const signature = req.headers["x-comedyclash-signature"] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: "Missing x-comedyclash-signature header" });
      return;
    }

    let rawSecret: string;
    try {
      rawSecret = decryptSecret(secretRecord.encryptedSecret, secretRecord.iv, secretRecord.authTag);
    } catch {
      res.status(500).json({ error: "Failed to load inbound secret" });
      return;
    }

    const rawBody: Buffer | undefined = (req as unknown as Record<string, unknown>)["rawBody"] as Buffer | undefined;
    const bodyBytes = rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expected = `sha256=${crypto.createHmac("sha256", rawSecret).update(bodyBytes).digest("hex")}`;

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

    const parsed = InboundEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { eventType, payload, sessionId } = parsed.data;
    const callerClientId = req.user?.clientId && req.user.clientId > 0 ? req.user.clientId : null;

    // Persist inbound event for audit log.
    const [event] = await db.insert(partnerInboundEventsTable).values({
      partner: "comedyclash",
      clientId: callerClientId,
      eventType,
      payload,
      status: "received",
      sessionId: sessionId || null,
    }).returning();

    console.log(`[CC] Inbound event received: ${eventType} (id=${event.id})`);

    let runId: number | undefined;
    let triggerEventId: number | undefined;

    // Attempt to route through the unified trigger system: look for an active
    // pipeline trigger with slug "comedyclash_inbound" belonging to this client.
    if (callerClientId) {
      try {
        const [ccTrigger] = await db
          .select({
            triggerId: pipelineTriggersTable.id,
            pipelineId: pipelineTriggersTable.pipelineId,
            slug: pipelineTriggersTable.endpointSlug,
          })
          .from(pipelineTriggersTable)
          .innerJoin(pipelinesTable, eq(pipelineTriggersTable.pipelineId, pipelinesTable.id))
          .where(
            and(
              eq(pipelinesTable.clientId, callerClientId),
              eq(pipelineTriggersTable.active, true),
              ilike(pipelineTriggersTable.endpointSlug, "comedyclash%"),
            )
          )
          .limit(1);

        if (ccTrigger) {
          const payloadPreview = JSON.stringify({ eventType, ...payload }).substring(0, 500);
          const [triggerEvent] = await db
            .insert(triggerEventsTable)
            .values({
              triggerId: ccTrigger.triggerId,
              pipelineId: ccTrigger.pipelineId,
              status: "pending",
              payloadPreview,
            })
            .returning();

          triggerEventId = triggerEvent.id;

          try {
            const run = await executePipelineRun(ccTrigger.pipelineId, "generic", {
              eventType,
              ...payload,
              _trigger: {
                type: "comedyclash_inbound",
                slug: ccTrigger.slug,
                eventId: triggerEvent.id,
                source: "comedyclash_webhook",
              },
            });
            runId = run.id;

            await db
              .update(triggerEventsTable)
              .set({ status: "success", runId: run.id })
              .where(eq(triggerEventsTable.id, triggerEvent.id));
          } catch (pipelineErr) {
            await db
              .update(triggerEventsTable)
              .set({
                status: "failed",
                errorMessage: pipelineErr instanceof Error ? pipelineErr.message : "Pipeline execution failed",
              })
              .where(eq(triggerEventsTable.id, triggerEvent.id));
          }
        }
      } catch (triggerErr) {
        console.error("[CC] Trigger lookup/execution error (non-fatal):", triggerErr instanceof Error ? triggerErr.message : triggerErr);
      }

      // If no pipeline trigger was found (or ran), optionally bootstrap an agent session
      // for event types that represent new work requests (e.g. "session.request").
      if (!triggerEventId && eventType === "session.request") {
        try {
          const [salesBot] = await db
            .select()
            .from(botsTable)
            .where(and(eq(botsTable.isAvailable, true), ilike(botsTable.department, "%sales%")))
            .limit(1);

          if (salesBot) {
            const objective = String((payload as Record<string, unknown>).objective ?? `ComedyClash inbound request: ${eventType}`);
            const [bootstrapSession] = await db
              .insert(taskSessionsTable)
              .values({ clientId: callerClientId, objective, status: "active" })
              .returning();

            console.log(`[CC] Bootstrapped agent session ${bootstrapSession.id} for inbound ${eventType}`);

            await db
              .update(partnerInboundEventsTable)
              .set({ sessionId: String(bootstrapSession.id) })
              .where(eq(partnerInboundEventsTable.id, event.id));
          }
        } catch (bootstrapErr) {
          console.error("[CC] Session bootstrap error (non-fatal):", bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr);
        }
      }
    }

    res.json({ received: true, eventId: event.id, triggerEventId, runId });
  } catch (err) {
    console.error("[CC] Error processing inbound webhook:", err);
    res.status(500).json({ error: "Failed to process inbound webhook" });
  }
});

router.get("/integrations/comedyclash/inbound-events", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const events = await db
      .select()
      .from(partnerInboundEventsTable)
      .where(
        and(
          eq(partnerInboundEventsTable.partner, "comedyclash"),
          eq(partnerInboundEventsTable.clientId, clientId),
        )
      )
      .orderBy(desc(partnerInboundEventsTable.createdAt))
      .limit(20);

    res.json(events);
  } catch (err) {
    console.error("[CC] Error listing inbound events:", err);
    res.status(500).json({ error: "Failed to list inbound events" });
  }
});

router.get("/integrations/comedyclash/inbound-secret/status", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  try {
    const [secretRecord] = await db
      .select({ id: partnerInboundSecretsTable.id })
      .from(partnerInboundSecretsTable)
      .where(eq(partnerInboundSecretsTable.partner, "comedyclash"))
      .limit(1);
    res.json({ configured: !!secretRecord });
  } catch (err) {
    console.error("[CC] Error checking inbound secret status:", err);
    res.status(500).json({ error: "Failed to check inbound secret status" });
  }
});

router.post("/integrations/comedyclash/inbound-secret/regenerate", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const { encrypted, iv, authTag } = encryptValue(rawSecret);

    await db
      .delete(partnerInboundSecretsTable)
      .where(eq(partnerInboundSecretsTable.partner, "comedyclash"));

    await db.insert(partnerInboundSecretsTable).values({
      partner: "comedyclash",
      encryptedSecret: encrypted,
      iv,
      authTag,
    });

    res.json({
      secret: rawSecret,
      warning: "Store this secret securely. It will not be shown again. Configure it in ComedyClash to sign inbound webhook payloads.",
    });
  } catch (err) {
    console.error("[CC] Error regenerating inbound secret:", err);
    res.status(500).json({ error: "Failed to regenerate inbound secret" });
  }
});

const ConnectionSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

router.get("/integrations/comedyclash/connection", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const [cred] = await db
      .select({
        id: partnerCredentialsTable.id,
        apiBaseUrl: partnerCredentialsTable.apiBaseUrl,
        status: partnerCredentialsTable.status,
        updatedAt: partnerCredentialsTable.updatedAt,
      })
      .from(partnerCredentialsTable)
      .where(and(
        eq(partnerCredentialsTable.partner, "comedyclash"),
        eq(partnerCredentialsTable.clientId, clientId),
      ))
      .limit(1);

    res.json(cred || null);
  } catch (err) {
    console.error("[CC] Error fetching connection:", err);
    res.status(500).json({ error: "Failed to fetch connection" });
  }
});

router.post("/integrations/comedyclash/connection", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const parsed = ConnectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { apiBaseUrl, apiKey } = parsed.data;
    const { encrypted, iv, authTag } = encryptValue(apiKey);
    const clientId = req.user!.clientId;

    await db
      .delete(partnerCredentialsTable)
      .where(and(
        eq(partnerCredentialsTable.partner, "comedyclash"),
        eq(partnerCredentialsTable.clientId, clientId),
      ));

    const [cred] = await db.insert(partnerCredentialsTable).values({
      partner: "comedyclash",
      clientId,
      apiBaseUrl,
      encryptedApiKey: encrypted,
      iv,
      authTag,
      status: "active",
    }).returning();

    res.json({ id: cred.id, apiBaseUrl: cred.apiBaseUrl, status: cred.status });
  } catch (err) {
    console.error("[CC] Error saving connection:", err);
    res.status(500).json({ error: "Failed to save connection" });
  }
});

router.post("/integrations/comedyclash/connection/test", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const result = await testConnection(clientId);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ ok: false, message: msg });
  }
});

const WebhookSubSchema = z.object({
  targetUrl: z.string().url(),
  secret: z.string().min(8),
  events: z.array(z.string()).min(1),
});

router.get("/integrations/comedyclash/webhook-subscription", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const [sub] = await db
      .select({
        id: partnerWebhookSubscriptionsTable.id,
        targetUrl: partnerWebhookSubscriptionsTable.targetUrl,
        events: partnerWebhookSubscriptionsTable.events,
        status: partnerWebhookSubscriptionsTable.status,
        updatedAt: partnerWebhookSubscriptionsTable.updatedAt,
      })
      .from(partnerWebhookSubscriptionsTable)
      .where(and(
        eq(partnerWebhookSubscriptionsTable.partner, "comedyclash"),
        eq(partnerWebhookSubscriptionsTable.clientId, clientId),
      ))
      .limit(1);

    res.json(sub || null);
  } catch (err) {
    console.error("[CC] Error fetching webhook subscription:", err);
    res.status(500).json({ error: "Failed to fetch webhook subscription" });
  }
});

router.post("/integrations/comedyclash/webhook-subscription", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const parsed = WebhookSubSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { targetUrl, secret, events } = parsed.data;
    const { encrypted, iv, authTag } = encryptValue(secret);
    const clientId = req.user!.clientId;

    await db
      .delete(partnerWebhookSubscriptionsTable)
      .where(and(
        eq(partnerWebhookSubscriptionsTable.partner, "comedyclash"),
        eq(partnerWebhookSubscriptionsTable.clientId, clientId),
      ));

    const [sub] = await db.insert(partnerWebhookSubscriptionsTable).values({
      partner: "comedyclash",
      clientId,
      targetUrl,
      encryptedSecret: encrypted,
      iv,
      authTag,
      events,
      status: "active",
    }).returning();

    res.json({ id: sub.id, targetUrl: sub.targetUrl, events: sub.events, status: sub.status });
  } catch (err) {
    console.error("[CC] Error saving webhook subscription:", err);
    res.status(500).json({ error: "Failed to save webhook subscription" });
  }
});

router.patch("/integrations/comedyclash/webhook-subscription/:id/status", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid subscription ID" }); return; }

    const { status } = req.body || {};
    if (!["active", "paused"].includes(status)) {
      res.status(400).json({ error: "status must be active or paused" });
      return;
    }

    const clientId = req.user!.clientId;

    const [updated] = await db
      .update(partnerWebhookSubscriptionsTable)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(partnerWebhookSubscriptionsTable.id, id),
          eq(partnerWebhookSubscriptionsTable.partner, "comedyclash"),
          eq(partnerWebhookSubscriptionsTable.clientId, clientId),
        )
      )
      .returning();

    if (!updated) { res.status(404).json({ error: "Subscription not found" }); return; }
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    console.error("[CC] Error updating webhook subscription status:", err);
    res.status(500).json({ error: "Failed to update subscription status" });
  }
});

router.post("/integrations/comedyclash/webhook-subscription/test-ping", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const [sub] = await db
      .select()
      .from(partnerWebhookSubscriptionsTable)
      .where(and(
        eq(partnerWebhookSubscriptionsTable.partner, "comedyclash"),
        eq(partnerWebhookSubscriptionsTable.clientId, clientId),
      ))
      .limit(1);

    if (!sub) { res.status(404).json({ error: "No webhook subscription configured" }); return; }

    const payload = { event: "test.ping", partner: "galaxybots", timestamp: new Date().toISOString() };
    const payloadStr = JSON.stringify(payload);

    let secret = "";
    try {
      secret = decryptSecret(sub.encryptedSecret, sub.iv, sub.authTag);
    } catch {
      res.status(500).json({ error: "Failed to decrypt signing secret" });
      return;
    }

    const hmac = `sha256=${crypto.createHmac("sha256", secret).update(payloadStr).digest("hex")}`;

    try {
      const response = await fetch(sub.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GalaxyBots-Signature": hmac,
          "X-GalaxyBots-Event": "test.ping",
        },
        body: payloadStr,
        signal: AbortSignal.timeout(10000),
      });
      res.json({ ok: response.ok, status: response.status });
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      res.json({ ok: false, message: msg });
    }
  } catch (err) {
    console.error("[CC] Error sending test ping:", err);
    res.status(500).json({ error: "Failed to send test ping" });
  }
});

router.get("/integrations/comedyclash/webhook-deliveries", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const deliveries = await db
      .select({
        id: partnerWebhookDeliveriesTable.id,
        eventType: partnerWebhookDeliveriesTable.eventType,
        status: partnerWebhookDeliveriesTable.status,
        attemptCount: partnerWebhookDeliveriesTable.attemptCount,
        responseStatus: partnerWebhookDeliveriesTable.responseStatus,
        deliveredAt: partnerWebhookDeliveriesTable.deliveredAt,
        lastAttemptAt: partnerWebhookDeliveriesTable.lastAttemptAt,
        createdAt: partnerWebhookDeliveriesTable.createdAt,
      })
      .from(partnerWebhookDeliveriesTable)
      .innerJoin(
        partnerWebhookSubscriptionsTable,
        eq(partnerWebhookDeliveriesTable.subscriptionId, partnerWebhookSubscriptionsTable.id),
      )
      .where(
        and(
          eq(partnerWebhookDeliveriesTable.partner, "comedyclash"),
          eq(partnerWebhookSubscriptionsTable.clientId, clientId),
        )
      )
      .orderBy(desc(partnerWebhookDeliveriesTable.createdAt))
      .limit(20);

    res.json(deliveries);
  } catch (err) {
    console.error("[CC] Error fetching delivery log:", err);
    res.status(500).json({ error: "Failed to fetch delivery log" });
  }
});

router.get("/integrations/comedyclash/events", requireRole("owner", "admin"), (_req, res): void => {
  res.json(COMEDYCLASH_EVENTS);
});

export default router;
