import { Router, type IRouter } from "express";
import {
  db,
  pool,
  pipelinesTable,
  pipelineStepsTable,
  pipelineRunsTable,
  pipelineRunStepsTable,
  pipelineTriggersTable,
  triggerEventsTable,
  botsTable,
  clientsTable,
  withBypassRLS,
  tenantContextStore,
} from "@workspace/db";
import { eq, desc, asc, and } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import { requireRole } from "../../middleware/auth";
import { executePipelineRun } from "../../services/missions/pipeline-engine";

const router: IRouter = Router();

function generateSlug(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

const CreatePipelineBody = z.object({
  name: z.string().min(1),
  triggerType: z.enum(["manual", "webhook", "pipeline_completion"]),
  triggerConfig: z.record(z.unknown()).optional().default({}),
  active: z.boolean().optional().default(true),
  steps: z.array(z.object({
    botId: z.number(),
    instruction: z.string().min(1),
  })).min(1),
});

const UpdatePipelineBody = z.object({
  name: z.string().min(1).optional(),
  triggerType: z.enum(["manual", "webhook", "pipeline_completion"]).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  steps: z.array(z.object({
    botId: z.number(),
    instruction: z.string().min(1),
  })).optional(),
});

const CreateTriggerBody = z.object({
  triggerType: z.enum(["generic", "stripe", "twilio", "form"]),
  label: z.string().optional(),
});

router.get("/pipelines", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const pipelines = await db
    .select()
    .from(pipelinesTable)
    .where(eq(pipelinesTable.clientId, clientId))
    .orderBy(desc(pipelinesTable.createdAt));

  const result = await Promise.all(
    pipelines.map(async (p) => {
      const steps = await db
        .select()
        .from(pipelineStepsTable)
        .where(eq(pipelineStepsTable.pipelineId, p.id))
        .orderBy(asc(pipelineStepsTable.stepOrder));

      const stepsWithBots = await Promise.all(
        steps.map(async (s) => {
          const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, s.botId));
          return { ...s, bot: bot || null };
        })
      );

      const runs = await db
        .select()
        .from(pipelineRunsTable)
        .where(eq(pipelineRunsTable.pipelineId, p.id))
        .orderBy(desc(pipelineRunsTable.createdAt))
        .limit(5);

      const triggers = await db
        .select()
        .from(pipelineTriggersTable)
        .where(eq(pipelineTriggersTable.pipelineId, p.id))
        .orderBy(desc(pipelineTriggersTable.createdAt));

      return { ...p, steps: stepsWithBots, recentRuns: runs, triggers };
    })
  );

  res.json(result);
});

router.post("/pipelines", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const body = CreatePipelineBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .insert(pipelinesTable)
    .values({
      clientId,
      name: body.data.name,
      triggerType: body.data.triggerType,
      triggerConfig: body.data.triggerConfig,
      active: body.data.active,
    })
    .returning();

  if (body.data.steps.length > 0) {
    await db.insert(pipelineStepsTable).values(
      body.data.steps.map((step, index) => ({
        pipelineId: pipeline.id,
        stepOrder: index + 1,
        botId: step.botId,
        instruction: step.instruction,
      }))
    );
  }

  const steps = await db
    .select()
    .from(pipelineStepsTable)
    .where(eq(pipelineStepsTable.pipelineId, pipeline.id))
    .orderBy(asc(pipelineStepsTable.stepOrder));

  res.status(201).json({ ...pipeline, steps, recentRuns: [], triggers: [] });
});

router.put("/pipelines/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const body = UpdatePipelineBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const clientId = req.user!.clientId;

  const [existing] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!existing) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.triggerType !== undefined) updates.triggerType = body.data.triggerType;
  if (body.data.triggerConfig !== undefined) updates.triggerConfig = body.data.triggerConfig;
  if (body.data.active !== undefined) updates.active = body.data.active;

  if (Object.keys(updates).length > 0) {
    await db.update(pipelinesTable).set(updates).where(eq(pipelinesTable.id, pipelineId));
  }

  if (body.data.steps !== undefined) {
    await db.delete(pipelineStepsTable).where(eq(pipelineStepsTable.pipelineId, pipelineId));
    if (body.data.steps.length > 0) {
      await db.insert(pipelineStepsTable).values(
        body.data.steps.map((step, index) => ({
          pipelineId,
          stepOrder: index + 1,
          botId: step.botId,
          instruction: step.instruction,
        }))
      );
    }
  }

  const [updated] = await db
    .select()
    .from(pipelinesTable)
    .where(eq(pipelinesTable.id, pipelineId));

  const steps = await db
    .select()
    .from(pipelineStepsTable)
    .where(eq(pipelineStepsTable.pipelineId, pipelineId))
    .orderBy(asc(pipelineStepsTable.stepOrder));

  res.json({ ...updated, steps });
});

router.delete("/pipelines/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [existing] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!existing) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  await db.delete(pipelinesTable).where(eq(pipelinesTable.id, pipelineId));
  res.json({ success: true });
});

router.post("/pipelines/:id/run", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  try {
    const run = await executePipelineRun(pipelineId, "manual", req.body || {});
    res.status(201).json(run);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start pipeline run" });
  }
});

router.get("/pipelines/:id/runs", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const runs = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.pipelineId, pipelineId))
    .orderBy(desc(pipelineRunsTable.createdAt));

  res.json(runs);
});

router.get("/pipelines/runs/:runId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const runId = Number(req.params.runId);
  if (isNaN(runId)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }

  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.id, runId));

  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, run.pipelineId), eq(pipelinesTable.clientId, req.user!.clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const runSteps = await db
    .select()
    .from(pipelineRunStepsTable)
    .where(eq(pipelineRunStepsTable.runId, runId))
    .orderBy(asc(pipelineRunStepsTable.stepOrder));

  const stepsWithBots = await Promise.all(
    runSteps.map(async (rs) => {
      const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, rs.botId));
      return { ...rs, bot: bot || null };
    })
  );

  res.json({ ...run, pipeline, steps: stepsWithBots });
});

router.patch("/pipelines/:id/toggle", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [existing] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!existing) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const [updated] = await db
    .update(pipelinesTable)
    .set({ active: !existing.active })
    .where(eq(pipelinesTable.id, pipelineId))
    .returning();

  res.json(updated);
});

router.get("/pipelines/:id/triggers", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const triggers = await db
    .select()
    .from(pipelineTriggersTable)
    .where(eq(pipelineTriggersTable.pipelineId, pipelineId))
    .orderBy(desc(pipelineTriggersTable.createdAt));

  res.json(triggers);
});

router.post("/pipelines/:id/triggers", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const body = CreateTriggerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const [trigger] = await db
    .insert(pipelineTriggersTable)
    .values({
      pipelineId,
      triggerType: body.data.triggerType,
      endpointSlug: generateSlug(),
      signingSecret: generateSecret(),
      label: body.data.label || `${body.data.triggerType} trigger`,
    })
    .returning();

  res.status(201).json(trigger);
});

router.patch("/pipelines/:id/triggers/:triggerId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  const triggerId = Number(req.params.triggerId);
  if (isNaN(pipelineId) || isNaN(triggerId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const updateBody = z.object({
    label: z.string().optional(),
    active: z.boolean().optional(),
  }).safeParse(req.body);

  if (!updateBody.success) {
    res.status(400).json({ error: updateBody.error.message });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const [trigger] = await db
    .select()
    .from(pipelineTriggersTable)
    .where(and(
      eq(pipelineTriggersTable.id, triggerId),
      eq(pipelineTriggersTable.pipelineId, pipelineId)
    ));

  if (!trigger) {
    res.status(404).json({ error: "Trigger not found" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (updateBody.data.label !== undefined) updates.label = updateBody.data.label;
  if (updateBody.data.active !== undefined) updates.active = updateBody.data.active;

  if (Object.keys(updates).length === 0) {
    res.json(trigger);
    return;
  }

  const [updated] = await db
    .update(pipelineTriggersTable)
    .set(updates)
    .where(eq(pipelineTriggersTable.id, triggerId))
    .returning();

  res.json(updated);
});

router.delete("/pipelines/:id/triggers/:triggerId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  const triggerId = Number(req.params.triggerId);
  if (isNaN(pipelineId) || isNaN(triggerId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const [trigger] = await db
    .select()
    .from(pipelineTriggersTable)
    .where(and(
      eq(pipelineTriggersTable.id, triggerId),
      eq(pipelineTriggersTable.pipelineId, pipelineId)
    ));

  if (!trigger) {
    res.status(404).json({ error: "Trigger not found" });
    return;
  }

  await db.delete(pipelineTriggersTable).where(eq(pipelineTriggersTable.id, triggerId));
  res.json({ success: true });
});

router.post("/pipelines/:id/triggers/:triggerId/rotate-secret", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  const triggerId = Number(req.params.triggerId);
  if (isNaN(pipelineId) || isNaN(triggerId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const [trigger] = await db
    .select()
    .from(pipelineTriggersTable)
    .where(and(
      eq(pipelineTriggersTable.id, triggerId),
      eq(pipelineTriggersTable.pipelineId, pipelineId)
    ));

  if (!trigger) {
    res.status(404).json({ error: "Trigger not found" });
    return;
  }

  const [updated] = await db
    .update(pipelineTriggersTable)
    .set({ signingSecret: generateSecret() })
    .where(eq(pipelineTriggersTable.id, triggerId))
    .returning();

  res.json(updated);
});

router.get("/pipelines/:id/trigger-events", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.id);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const clientId = req.user!.clientId;

  const [pipeline] = await db
    .select()
    .from(pipelinesTable)
    .where(and(eq(pipelinesTable.id, pipelineId), eq(pipelinesTable.clientId, clientId)));

  if (!pipeline) {
    res.status(404).json({ error: "Pipeline not found" });
    return;
  }

  const events = await db
    .select()
    .from(triggerEventsTable)
    .where(eq(triggerEventsTable.pipelineId, pipelineId))
    .orderBy(desc(triggerEventsTable.receivedAt))
    .limit(50);

  res.json(events);
});

router.post("/webhooks/pipeline/:pipelineId", async (req, res): Promise<void> => {
  const pipelineId = Number(req.params.pipelineId);
  if (isNaN(pipelineId)) {
    res.status(400).json({ error: "Invalid pipeline ID" });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = authHeader.slice(7);

  // withBypassRLS: public webhook endpoint (no auth user). Look up both the
  // pipeline and its associated per-trigger signing secret in one bypass context.
  await withBypassRLS(pool, async (bypassDb) => {
    const [pipeline] = await bypassDb
      .select()
      .from(pipelinesTable)
      .where(eq(pipelinesTable.id, pipelineId));

    if (!pipeline) {
      res.status(404).json({ error: "Pipeline not found" });
      return;
    }

    if (!pipeline.active) {
      res.status(400).json({ error: "Pipeline is not active" });
      return;
    }

    if (pipeline.triggerType !== "webhook") {
      res.status(400).json({ error: "Pipeline is not configured for webhook triggers" });
      return;
    }

    // Authorise against the per-pipeline trigger's signingSecret, not the
    // client-wide webhookSecret. Using the client-wide secret would allow any
    // party that legitimately holds it for one purpose (e.g. a lead webhook)
    // to invoke arbitrary pipelines for the same tenant.
    const [trigger] = await bypassDb
      .select()
      .from(pipelineTriggersTable)
      .where(
        and(
          eq(pipelineTriggersTable.pipelineId, pipelineId),
          eq(pipelineTriggersTable.active, true),
        ),
      );

    if (!trigger) {
      res.status(403).json({ error: "Webhook trigger not configured for this pipeline" });
      return;
    }

    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(trigger.signingSecret);
    if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
      res.status(403).json({ error: "Invalid webhook token" });
      return;
    }

    try {
      const run = await executePipelineRun(pipelineId, "webhook", req.body || {});
      res.status(201).json({ runId: run.id, status: run.status, message: "Pipeline run started" });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start pipeline run" });
    }
  });
});

export default router;
