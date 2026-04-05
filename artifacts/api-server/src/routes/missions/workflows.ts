import { Router, type IRouter } from "express";
import {
  db,
  workflowsTable,
  workflowRunsTable,
  approvalSlaConfigsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "../../middleware/auth";
import { executeWorkflow, seedBuiltInWorkflows } from "../../services/missions/workflow-engine";

const router: IRouter = Router();

const WorkflowBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.string().default("manual"),
  triggerConfig: z.record(z.unknown()).optional().default({}),
  nodes: z.array(z.record(z.unknown())).default([]),
  edges: z.array(z.record(z.unknown())).default([]),
  enabled: z.boolean().optional().default(true),
});

const UpdateWorkflowBody = WorkflowBody.partial();

router.get("/workflows", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  await seedBuiltInWorkflows(clientId).catch(() => {});
  const workflows = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.clientId, clientId))
    .orderBy(desc(workflowsTable.createdAt));
  res.json(workflows);
});

router.post("/workflows", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const body = WorkflowBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const clientId = req.user!.clientId;
  const [workflow] = await db
    .insert(workflowsTable)
    .values({
      clientId,
      name: body.data.name,
      description: body.data.description,
      triggerType: body.data.triggerType,
      triggerConfig: body.data.triggerConfig,
      nodes: body.data.nodes,
      edges: body.data.edges,
      enabled: body.data.enabled,
      isBuiltIn: false,
    })
    .returning();
  res.status(201).json(workflow);
});

router.get("/workflows/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!workflow) { res.status(404).json({ error: "Workflow not found" }); return; }
  res.json(workflow);
});

router.put("/workflows/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const body = UpdateWorkflowBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const clientId = req.user!.clientId;
  const [existing] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!existing) { res.status(404).json({ error: "Workflow not found" }); return; }
  if (existing.isBuiltIn) { res.status(403).json({ error: "Built-in workflows cannot be edited. Clone it first." }); return; }
  const [updated] = await db
    .update(workflowsTable)
    .set({ ...body.data })
    .where(eq(workflowsTable.id, id))
    .returning();
  res.json(updated);
});

router.delete("/workflows/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [existing] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!existing) { res.status(404).json({ error: "Workflow not found" }); return; }
  if (existing.isBuiltIn) { res.status(403).json({ error: "Built-in workflows cannot be deleted." }); return; }
  await db.delete(workflowsTable).where(eq(workflowsTable.id, id));
  res.json({ success: true });
});

router.post("/workflows/:id/enable", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [updated] = await db
    .update(workflowsTable)
    .set({ enabled: true })
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Workflow not found" }); return; }
  res.json(updated);
});

router.post("/workflows/:id/disable", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [updated] = await db
    .update(workflowsTable)
    .set({ enabled: false })
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Workflow not found" }); return; }
  res.json(updated);
});

router.post("/workflows/:id/clone", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [existing] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!existing) { res.status(404).json({ error: "Workflow not found" }); return; }
  const [cloned] = await db
    .insert(workflowsTable)
    .values({
      clientId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      triggerType: existing.triggerType,
      triggerConfig: existing.triggerConfig ?? {},
      nodes: (existing.nodes ?? []) as unknown[],
      edges: (existing.edges ?? []) as unknown[],
      enabled: false,
      isBuiltIn: false,
    })
    .returning();
  res.status(201).json(cloned);
});

router.post("/workflows/:id/run", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!workflow) { res.status(404).json({ error: "Workflow not found" }); return; }
  try {
    const result = await executeWorkflow(id, "manual", req.body ?? {});
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to run workflow" });
  }
});

router.get("/workflows/:id/runs", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const clientId = req.user!.clientId;
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(and(eq(workflowsTable.id, id), eq(workflowsTable.clientId, clientId)));
  if (!workflow) { res.status(404).json({ error: "Workflow not found" }); return; }
  const runs = await db
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.workflowId, id))
    .orderBy(desc(workflowRunsTable.createdAt))
    .limit(50);
  res.json(runs);
});

router.get("/approval-sla-config", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const [config] = await db
    .select()
    .from(approvalSlaConfigsTable)
    .where(eq(approvalSlaConfigsTable.clientId, clientId));
  res.json(config ?? null);
});

router.put("/approval-sla-config", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { defaultSlaMinutes, timeSensitiveSlaMinutes, secondaryApproverEmail, trustedCategories } = req.body as {
    defaultSlaMinutes?: number;
    timeSensitiveSlaMinutes?: number;
    secondaryApproverEmail?: string;
    trustedCategories?: string[];
  };
  const [existing] = await db
    .select()
    .from(approvalSlaConfigsTable)
    .where(eq(approvalSlaConfigsTable.clientId, clientId));
  if (existing) {
    const [updated] = await db
      .update(approvalSlaConfigsTable)
      .set({
        defaultSlaMinutes: defaultSlaMinutes ?? existing.defaultSlaMinutes,
        timeSensitiveSlaMinutes: timeSensitiveSlaMinutes ?? existing.timeSensitiveSlaMinutes,
        secondaryApproverEmail: secondaryApproverEmail ?? existing.secondaryApproverEmail,
        trustedCategories: trustedCategories ?? existing.trustedCategories,
      })
      .where(eq(approvalSlaConfigsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(approvalSlaConfigsTable)
      .values({
        clientId,
        defaultSlaMinutes: defaultSlaMinutes ?? 240,
        timeSensitiveSlaMinutes: timeSensitiveSlaMinutes ?? 60,
        secondaryApproverEmail: secondaryApproverEmail ?? null,
        trustedCategories: trustedCategories ?? ["web_search", "read_email"],
      })
      .returning();
    res.status(201).json(created);
  }
});

export default router;
