import { Router, type IRouter } from "express";
import {
  db,
  pipelineTriggersTable,
  triggerEventsTable,
  pipelinesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { executePipelineRun } from "../../services/missions/pipeline-engine";

const router: IRouter = Router();

router.post("/triggers/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;

  const [trigger] = await db
    .select()
    .from(pipelineTriggersTable)
    .where(eq(pipelineTriggersTable.endpointSlug, slug));

  if (!trigger) {
    res.status(404).json({ error: "Trigger not found" });
    return;
  }

  if (!trigger.active) {
    res.status(400).json({ error: "Trigger is disabled" });
    return;
  }

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(eq(pipelinesTable.id, trigger.pipelineId));

  if (!pipeline || !pipeline.active) {
    res.status(400).json({ error: "Pipeline is inactive or not found" });
    return;
  }

  const signatureValid = verifySignature(req, trigger);
  if (!signatureValid) {
    await db.insert(triggerEventsTable).values({
      triggerId: trigger.id,
      pipelineId: trigger.pipelineId,
      status: "failed",
      errorMessage: "Signature verification failed",
      payloadPreview: truncatePayload(req.body),
    });
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  const [event] = await db
    .insert(triggerEventsTable)
    .values({
      triggerId: trigger.id,
      pipelineId: trigger.pipelineId,
      status: "pending",
      payloadPreview: truncatePayload(req.body),
    })
    .returning();

  try {
    const triggerData = {
      ...(typeof req.body === "object" && req.body !== null ? req.body : {}),
      _trigger: {
        type: trigger.triggerType,
        slug: trigger.endpointSlug,
        eventId: event.id,
      },
    };

    const run = await executePipelineRun(trigger.pipelineId, trigger.triggerType, triggerData);

    await db
      .update(triggerEventsTable)
      .set({ status: "success", runId: run.id })
      .where(eq(triggerEventsTable.id, event.id));

    res.status(201).json({
      eventId: event.id,
      runId: run.id,
      status: "triggered",
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to execute pipeline";
    await db
      .update(triggerEventsTable)
      .set({ status: "failed", errorMessage })
      .where(eq(triggerEventsTable.id, event.id));

    res.status(400).json({ error: errorMessage });
  }
});

function verifySignature(req: any, trigger: { signingSecret: string; triggerType: string }): boolean {
  if (trigger.triggerType === "stripe") {
    const sig = req.headers["stripe-signature"];
    if (!sig) return false;
    const payload = JSON.stringify(req.body);
    const expectedSig = crypto
      .createHmac("sha256", trigger.signingSecret)
      .update(payload)
      .digest("hex");
    return sig.includes(expectedSig);
  }

  if (trigger.triggerType === "twilio") {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Basic ")) return false;
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const [, password] = decoded.split(":");
    if (!password) return false;
    const tokenBuf = Buffer.from(password);
    const secretBuf = Buffer.from(trigger.signingSecret);
    if (tokenBuf.length !== secretBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, secretBuf);
  }

  const authHeader = req.headers["authorization"];
  const sigHeader = req.headers["x-trigger-signature"];

  if (sigHeader) {
    const payload = JSON.stringify(req.body);
    const expectedSig = crypto
      .createHmac("sha256", trigger.signingSecret)
      .update(payload)
      .digest("hex");
    return sigHeader === expectedSig || sigHeader === `sha256=${expectedSig}`;
  }

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(trigger.signingSecret);
    if (tokenBuf.length !== secretBuf.length) return false;
    return crypto.timingSafeEqual(tokenBuf, secretBuf);
  }

  return false;
}

function truncatePayload(body: unknown): string {
  try {
    const str = JSON.stringify(body);
    return str.length > 500 ? str.substring(0, 500) + "..." : str;
  } catch {
    return "[unparseable]";
  }
}

export default router;
