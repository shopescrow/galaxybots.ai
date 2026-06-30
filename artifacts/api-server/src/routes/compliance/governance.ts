import { Router, type IRouter } from "express";
import {
  db,
  botToolPermissionsTable,
  pendingApprovalsTable,
  brandVoiceConfigsTable,
  permissionProfileTemplatesTable,
  botsTable,
  messages,
  taskSessionMessagesTable,
  clientsTable,
  coordinatorClientSettingsTable,
  botModelPoliciesTable,
} from "@workspace/db";
import { eq, and, sql, gte, or, isNull } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import { requireTenantAccess } from "../../middleware/tenant";
import {
  getModelOptimizerSettings,
  setModelOptimizerSetting,
  MODEL_OPTIMIZER_SETTING_KEYS,
  FRONTIER_CANDIDATE_MODELS,
  EFFICIENT_CANDIDATE_MODELS,
} from "../../services/ai-safety/model-router";
import { getAllTools, getTool, type ToolContext } from "../../tools";
import { SENSITIVE_TOOLS, SAFE_READ_TOOLS, DEPARTMENT_TOOL_DEFAULTS, READ_ONLY_ANALYST_TOOLS, applyBrandVoiceGuardrails } from "../../services/platform/governance";
import { resumeAgenticLoop, resumeAgenticLoopWithRejection } from "../../tools/agentic-loop";
import { execute as executeJointPlan, type JointPlanExecutorInput } from "../../services/coordinator/joint-plan-executor";
import { sendPushToClient } from "../../services/admin/push-sender";
import { checkWorkflowTriggers } from "../../services/missions/workflow-engine";
import { emitActivityEvent } from "../../services/analytics/activity-events";
import { createNotification } from "../../services/admin/notifications";
import { getAuditHealth, writeAuditEntry } from "../../services/audit/audit-ledger";

async function persistResumedOutput(
  approval: { conversationId: number | null; sessionId: number | null; botId: number; botName: string | null },
  content: string,
) {
  if (approval.conversationId) {
    await db.insert(messages).values({
      conversationId: approval.conversationId,
      role: "bot",
      content,
    });
  } else if (approval.sessionId) {
    await db.insert(taskSessionMessagesTable).values({
      sessionId: approval.sessionId!,
      botId: approval.botId,
      botName: approval.botName,
      role: "bot",
      content,
      messageType: "text",
    });
  }
}

type PendingApprovalRow = typeof pendingApprovalsTable.$inferSelect;

/**
 * Execute an approved tool call and resume its paused agentic loop / pipeline.
 * Shared by the single-approval route and the batch-approval route so both
 * paths behave identically.
 */
async function executeApprovalAndResume(
  approval: PendingApprovalRow,
): Promise<{ toolResult: unknown; resumeResult: { finalContent?: string; error?: string } | null }> {
  let toolResult: unknown = null;
  let resumeResult: { finalContent?: string; error?: string } | null = null;

  if (approval.toolName === "galaxy_mind_strategy") {
    const resumeCtx = approval.pausedLoopContext as Omit<JointPlanExecutorInput, "onProgress"> | null;
    if (resumeCtx) {
      try {
        const planResult = await executeJointPlan({ ...resumeCtx });
        const finalContent = planResult.content || "(No response generated)";
        const guardedContent = await applyBrandVoiceGuardrails(approval.clientId, finalContent).catch(() => finalContent);
        await persistResumedOutput(approval, guardedContent);
        toolResult = { strategy: planResult.plan.communicationStrategy, agentsUsed: planResult.agentsUsed };
        resumeResult = { finalContent: guardedContent };
      } catch (err) {
        console.error("[governance] Failed to resume GalaxyMind pipeline after approval:", err);
        toolResult = { error: err instanceof Error ? err.message : "Pipeline resume failed" };
        resumeResult = { error: "Pipeline resume failed" };
      }
    } else {
      toolResult = { error: "No execution context stored — cannot resume pipeline" };
      resumeResult = { error: "Missing pausedLoopContext" };
    }
    return { toolResult, resumeResult };
  }

  const tool = getTool(approval.toolName);
  if (tool) {
    try {
      const validated = tool.inputSchema.safeParse(approval.toolInput);
      if (validated.success) {
        toolResult = await tool.execute(validated.data, {
          clientId: approval.clientId,
          botId: approval.botId,
          botName: approval.botName ?? undefined,
          sessionId: approval.sessionId ?? undefined,
          conversationId: approval.conversationId ?? undefined,
        });
      } else {
        toolResult = { error: `Invalid input: ${validated.error.message}` };
      }
    } catch (err) {
      toolResult = { error: err instanceof Error ? err.message : "Tool execution failed" };
    }
  }

  const pausedCtx = approval.pausedLoopContext as {
    model: string;
    maxIterations: number;
    maxTokens: number;
    systemPrompt: string;
    messages: unknown[];
    remainingIterations: number;
    toolCallId: string;
    allToolCallIds?: string[];
  } | null;

  if (pausedCtx) {
    try {
      const toolContext: ToolContext = {
        clientId: approval.clientId,
        botId: approval.botId,
        botName: approval.botName ?? undefined,
        sessionId: approval.sessionId ?? undefined,
        conversationId: approval.conversationId ?? undefined,
      };
      const agenticResult = await resumeAgenticLoop({
        pausedLoopContext: pausedCtx,
        toolResult,
        context: toolContext,
      });
      resumeResult = agenticResult;

      if (agenticResult.finalContent) {
        const guardedContent = await applyBrandVoiceGuardrails(approval.clientId, agenticResult.finalContent);
        resumeResult.finalContent = guardedContent;
        await persistResumedOutput(approval, guardedContent);
      }
    } catch (err) {
      console.error("[governance] Failed to resume agentic loop after approval:", err);
      resumeResult = { error: "Loop resume failed" };
    }
  }

  return { toolResult, resumeResult };
}

const router: IRouter = Router();

router.get("/governance/tools", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  const tools = getAllTools();
  const toolList = tools.map((t) => ({
    name: t.name,
    description: t.description,
    isSensitive: SENSITIVE_TOOLS.includes(t.name),
  }));
  res.json(toolList);
});

router.get("/governance/bots/:botId/permissions", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const botId = Number(req.params.botId);
  const clientId = req.user!.clientId;

  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const permissions = await db
    .select()
    .from(botToolPermissionsTable)
    .where(
      and(
        eq(botToolPermissionsTable.clientId, clientId),
        eq(botToolPermissionsTable.botId, botId)
      )
    );

  res.json(permissions);
});

router.put("/governance/bots/:botId/permissions", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const botId = Number(req.params.botId);
  const clientId = req.user!.clientId;

  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const { permissions } = req.body as {
    permissions: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }>;
  };

  if (!Array.isArray(permissions)) {
    res.status(400).json({ error: "permissions must be an array" });
    return;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .delete(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );

    if (permissions.length > 0) {
      await tx.insert(botToolPermissionsTable).values(
        permissions.map((p) => ({
          clientId,
          botId,
          toolName: p.toolName,
          allowed: p.allowed,
          requiresApproval: p.requiresApproval,
        }))
      );
    }

    return tx
      .select()
      .from(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );
  });

  res.json(updated);
});

router.post("/governance/bots/:botId/permissions/seed", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const botId = Number(req.params.botId);
  const clientId = req.user!.clientId;

  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid bot ID" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const allTools = getAllTools();
  const allToolNames = allTools.map((t) => t.name);
  const defaults = DEPARTMENT_TOOL_DEFAULTS[bot.department];

  const permissionValues = allToolNames.map((toolName) => {
    const allowed = defaults ? defaults.allowed.includes(toolName) : SAFE_READ_TOOLS.includes(toolName);
    const requiresApproval = defaults ? defaults.approvalRequired.includes(toolName) : false;
    return {
      clientId,
      botId,
      toolName,
      allowed,
      requiresApproval: allowed ? requiresApproval : false,
    };
  });

  const seeded = await db.transaction(async (tx) => {
    await tx
      .delete(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );

    await tx.insert(botToolPermissionsTable).values(permissionValues);

    return tx
      .select()
      .from(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );
  });

  res.json(seeded);
});

router.get("/governance/approvals", requireRole("owner", "admin"), requireTenantAccess("subClientId"), async (req, res): Promise<void> => {
  const rawSub = req.query.subClientId;
  const sub = rawSub ? Number(rawSub) : NaN;
  const effectiveClientId = (!isNaN(sub) && sub > 0) ? sub : req.user!.clientId;
  const status = (req.query.status as string) || "pending";

  const conditions = [eq(pendingApprovalsTable.clientId, effectiveClientId)];
  if (status !== "all") {
    conditions.push(eq(pendingApprovalsTable.status, status));
  }

  const approvals = await db
    .select()
    .from(pendingApprovalsTable)
    .where(and(...conditions));

  res.json(approvals);
});

router.post("/governance/approvals/:id/approve", requireRole("owner", "admin"), requireTenantAccess("subClientId"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rawSub = (req.body as Record<string, unknown>)?.subClientId;
  const sub = rawSub ? Number(rawSub) : NaN;
  const clientId = (!isNaN(sub) && sub > 0) ? sub : req.user!.clientId;

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid approval ID" });
    return;
  }

  const [claimed] = await db
    .update(pendingApprovalsTable)
    .set({
      status: "approved",
      resolvedBy: req.user!.userId,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(pendingApprovalsTable.id, id),
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending")
      )
    )
    .returning();

  if (!claimed) {
    const [existing] = await db.select().from(pendingApprovalsTable).where(eq(pendingApprovalsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
    } else {
      res.status(409).json({ error: `Approval already ${existing.status}` });
    }
    return;
  }

  const approval = claimed;

  const { toolResult, resumeResult } = await executeApprovalAndResume(approval);

  const [updated] = await db
    .update(pendingApprovalsTable)
    .set({ toolResult })
    .where(eq(pendingApprovalsTable.id, id))
    .returning();

  // Audit the actual human approval action — this is what compliance reports count
  // as a human oversight intervention (Article 13).
  writeAuditEntry({
    clientId: approval.clientId,
    sessionId: approval.sessionId ? String(approval.sessionId) : null,
    engine: "coordinator",
    decisionType: "human_approval_outcome",
    payload: {
      outcome: "approved",
      approvalId: approval.id,
      toolName: approval.toolName,
      botId: approval.botId,
      botName: approval.botName,
      resolvedBy: req.user!.userId,
      resolvedAt: new Date().toISOString(),
    },
  }).catch(() => {});

  emitActivityEvent({
    clientId: approval.clientId,
    eventType: "approval",
    source: "system",
    severity: "info",
    title: `Tool approved: ${approval.toolName}`,
    description: `${approval.botName ?? "Bot"} was approved to use "${approval.toolName}"`,
    metadata: { approvalId: approval.id, toolName: approval.toolName, resolvedBy: req.user!.userId },
  });
  createNotification({
    clientId: approval.clientId,
    category: "approval",
    severity: "info",
    title: `Tool approved: ${approval.toolName}`,
    body: `${approval.botName ?? "Bot"} was approved to use "${approval.toolName}"`,
    link: "/command-center",
    metadata: { approvalId: approval.id, toolName: approval.toolName, resolvedBy: req.user!.userId, eventType: "approval_resolution" },
  }).catch(() => {});

  res.json({ ...updated, toolResult, resumeResult });

  checkWorkflowTriggers("approval_completed", {
    approvalId: id,
    toolName: approval.toolName,
    status: "approved",
    clientId,
  }, clientId).catch((e) => console.error("[workflow-trigger] approval_completed:", e));

  const pendingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending"),
      ),
    );
  const badge = pendingCount[0]?.count ?? 0;
  sendPushToClient(clientId, {
    title: "",
    body: "",
    badge,
    isApproval: true,
  }).catch(() => {});
});

// ── Batch approval (governance at scale) ──────────────────────────────────────
// Approve many pending requests in one call. Accepts either an explicit list of
// approvalIds, or { all: true } to approve every currently-pending request for
// the client. Each request is claimed atomically, executed and resumed via the
// same path as single approval. High-risk gating already happened upstream when
// the approval was created, so this only resolves human review in bulk.
router.post("/governance/approvals/batch-approve", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const body = (req.body ?? {}) as { approvalIds?: unknown; all?: unknown };

  let targetIds: number[];
  if (body.all === true) {
    const pending = await db
      .select({ id: pendingApprovalsTable.id })
      .from(pendingApprovalsTable)
      .where(
        and(
          eq(pendingApprovalsTable.clientId, clientId),
          eq(pendingApprovalsTable.status, "pending"),
        ),
      );
    targetIds = pending.map((p) => p.id);
  } else if (Array.isArray(body.approvalIds)) {
    targetIds = body.approvalIds
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
  } else {
    res.status(400).json({ error: "Provide approvalIds: number[] or all: true" });
    return;
  }

  if (targetIds.length === 0) {
    res.json({ approved: [], failed: [], total: 0 });
    return;
  }

  const approved: Array<{ id: number; toolName: string }> = [];
  const failed: Array<{ id: number; reason: string }> = [];

  for (const id of targetIds) {
    const [claimed] = await db
      .update(pendingApprovalsTable)
      .set({ status: "approved", resolvedBy: req.user!.userId, resolvedAt: new Date() })
      .where(
        and(
          eq(pendingApprovalsTable.id, id),
          eq(pendingApprovalsTable.clientId, clientId),
          eq(pendingApprovalsTable.status, "pending"),
        ),
      )
      .returning();

    if (!claimed) {
      failed.push({ id, reason: "not found or already resolved" });
      continue;
    }

    try {
      const { toolResult } = await executeApprovalAndResume(claimed);
      await db
        .update(pendingApprovalsTable)
        .set({ toolResult })
        .where(eq(pendingApprovalsTable.id, id));

      writeAuditEntry({
        clientId: claimed.clientId,
        sessionId: claimed.sessionId ? String(claimed.sessionId) : null,
        engine: "coordinator",
        decisionType: "human_approval_outcome",
        payload: {
          outcome: "approved",
          batch: true,
          approvalId: claimed.id,
          toolName: claimed.toolName,
          botId: claimed.botId,
          botName: claimed.botName,
          resolvedBy: req.user!.userId,
          resolvedAt: new Date().toISOString(),
        },
      }).catch(() => {});

      emitActivityEvent({
        clientId: claimed.clientId,
        eventType: "approval",
        source: "system",
        severity: "info",
        title: `Tool approved (batch): ${claimed.toolName}`,
        description: `${claimed.botName ?? "Bot"} was approved to use "${claimed.toolName}" via batch approval`,
        metadata: { approvalId: claimed.id, toolName: claimed.toolName, resolvedBy: req.user!.userId, batch: true },
      });

      approved.push({ id, toolName: claimed.toolName });
    } catch (err) {
      console.error(`[governance] Batch approval failed to resume approval ${id}:`, err);
      failed.push({ id, reason: err instanceof Error ? err.message : "resume failed" });
    }
  }

  const pendingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending"),
      ),
    );
  const badge = pendingCount[0]?.count ?? 0;
  sendPushToClient(clientId, { title: "", body: "", badge, isApproval: true }).catch(() => {});

  res.json({ approved, failed, total: targetIds.length });
});

router.post("/governance/approvals/:id/reject", requireRole("owner", "admin"), requireTenantAccess("subClientId"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rawSub = (req.body as Record<string, unknown>)?.subClientId;
  const sub = rawSub ? Number(rawSub) : NaN;
  const clientId = (!isNaN(sub) && sub > 0) ? sub : req.user!.clientId;

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid approval ID" });
    return;
  }

  const rejectionReason = (req.body as { reason?: string })?.reason || "Owner declined this action.";

  const [claimed] = await db
    .update(pendingApprovalsTable)
    .set({
      status: "rejected",
      resolvedBy: req.user!.userId,
      resolvedAt: new Date(),
      rejectionReason,
    })
    .where(
      and(
        eq(pendingApprovalsTable.id, id),
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending")
      )
    )
    .returning();

  if (!claimed) {
    const [existing] = await db.select().from(pendingApprovalsTable).where(eq(pendingApprovalsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
    } else {
      res.status(409).json({ error: `Approval already ${existing.status}` });
    }
    return;
  }

  const approval = claimed;
  const updated = claimed;

  let resumeResult = null;
  const pausedCtx = approval.pausedLoopContext as {
    model: string;
    maxIterations: number;
    maxTokens: number;
    systemPrompt: string;
    messages: unknown[];
    remainingIterations: number;
    toolCallId: string;
    allToolCallIds?: string[];
  } | null;

  if (pausedCtx) {
    try {
      const toolContext: ToolContext = {
        clientId: approval.clientId,
        botId: approval.botId,
        botName: approval.botName ?? undefined,
        sessionId: approval.sessionId ?? undefined,
        conversationId: approval.conversationId ?? undefined,
      };
      resumeResult = await resumeAgenticLoopWithRejection({
        pausedLoopContext: pausedCtx,
        toolName: approval.toolName,
        rejectionReason,
        context: toolContext,
      });

      if (resumeResult.finalContent) {
        const guardedContent = await applyBrandVoiceGuardrails(approval.clientId, resumeResult.finalContent);
        resumeResult.finalContent = guardedContent;
        await persistResumedOutput(approval, guardedContent);
      }
    } catch (err) {
      console.error("[governance] Failed to resume agentic loop after rejection:", err);
      resumeResult = { error: "Loop resume failed" };
    }
  }

  // Audit the actual human rejection action — counted in compliance reports.
  writeAuditEntry({
    clientId: approval.clientId,
    sessionId: approval.sessionId ? String(approval.sessionId) : null,
    engine: "coordinator",
    decisionType: "human_approval_outcome",
    payload: {
      outcome: "rejected",
      approvalId: approval.id,
      toolName: approval.toolName,
      botId: approval.botId,
      botName: approval.botName,
      rejectionReason,
      resolvedBy: req.user!.userId,
      resolvedAt: new Date().toISOString(),
    },
  }).catch(() => {});

  emitActivityEvent({
    clientId: approval.clientId,
    eventType: "approval",
    source: "system",
    severity: "warning",
    title: `Tool rejected: ${approval.toolName}`,
    description: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" was rejected — ${rejectionReason}`,
    metadata: { approvalId: approval.id, toolName: approval.toolName, rejectionReason, resolvedBy: req.user!.userId },
  });
  createNotification({
    clientId: approval.clientId,
    category: "approval",
    severity: "warning",
    title: `Tool rejected: ${approval.toolName}`,
    body: `${approval.botName ?? "Bot"}'s request to use "${approval.toolName}" was rejected — ${rejectionReason.substring(0, 200)}`,
    link: "/command-center",
    metadata: { approvalId: approval.id, toolName: approval.toolName, rejectionReason, resolvedBy: req.user!.userId, eventType: "approval_resolution" },
  }).catch(() => {});

  res.json({ ...updated, resumeResult });

  checkWorkflowTriggers("approval_completed", {
    approvalId: id,
    toolName: approval.toolName,
    status: "rejected",
    clientId,
  }, clientId).catch((e) => console.error("[workflow-trigger] approval_rejected:", e));

  const pendingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending"),
      ),
    );
  const badge = pendingCount[0]?.count ?? 0;
  sendPushToClient(clientId, {
    title: "",
    body: "",
    badge,
    isApproval: true,
  }).catch(() => {});
});

router.get("/governance/brand-voice", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const [config] = await db
    .select()
    .from(brandVoiceConfigsTable)
    .where(eq(brandVoiceConfigsTable.clientId, clientId));

  res.json(config || null);
});

router.put("/governance/brand-voice", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { toneDescription, prohibitedPhrases, requiredDisclaimers } = req.body as {
    toneDescription?: string;
    prohibitedPhrases?: string[];
    requiredDisclaimers?: string[];
  };

  const [existing] = await db
    .select()
    .from(brandVoiceConfigsTable)
    .where(eq(brandVoiceConfigsTable.clientId, clientId));

  if (existing) {
    const [updated] = await db
      .update(brandVoiceConfigsTable)
      .set({
        toneDescription: toneDescription ?? existing.toneDescription,
        prohibitedPhrases: prohibitedPhrases ?? existing.prohibitedPhrases,
        requiredDisclaimers: requiredDisclaimers ?? existing.requiredDisclaimers,
        updatedAt: new Date(),
      })
      .where(eq(brandVoiceConfigsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(brandVoiceConfigsTable)
      .values({
        clientId,
        toneDescription: toneDescription ?? null,
        prohibitedPhrases: prohibitedPhrases ?? [],
        requiredDisclaimers: requiredDisclaimers ?? [],
      })
      .returning();
    res.status(201).json(created);
  }
});

router.get("/governance/templates", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const templates = await db
    .select()
    .from(permissionProfileTemplatesTable)
    .where(eq(permissionProfileTemplatesTable.clientId, clientId));

  res.json(templates);
});

router.post("/governance/templates", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { name, description, permissions } = req.body as {
    name: string;
    description?: string;
    permissions: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }>;
  };

  if (!name || !Array.isArray(permissions)) {
    res.status(400).json({ error: "name and permissions are required" });
    return;
  }

  const [template] = await db
    .insert(permissionProfileTemplatesTable)
    .values({
      clientId,
      name,
      description: description ?? null,
      permissions,
    })
    .returning();

  res.status(201).json(template);
});

router.put("/governance/templates/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const clientId = req.user!.clientId;

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const { name, description, permissions } = req.body as {
    name?: string;
    description?: string;
    permissions?: Array<{ toolName: string; allowed: boolean; requiresApproval: boolean }>;
  };

  const [existing] = await db
    .select()
    .from(permissionProfileTemplatesTable)
    .where(
      and(
        eq(permissionProfileTemplatesTable.id, id),
        eq(permissionProfileTemplatesTable.clientId, clientId)
      )
    );

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [updated] = await db
    .update(permissionProfileTemplatesTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(permissions !== undefined ? { permissions } : {}),
      updatedAt: new Date(),
    })
    .where(eq(permissionProfileTemplatesTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/governance/templates/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const clientId = req.user!.clientId;

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid template ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(permissionProfileTemplatesTable)
    .where(
      and(
        eq(permissionProfileTemplatesTable.id, id),
        eq(permissionProfileTemplatesTable.clientId, clientId)
      )
    );

  if (!existing) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  await db
    .delete(permissionProfileTemplatesTable)
    .where(eq(permissionProfileTemplatesTable.id, id));

  res.json({ success: true });
});

router.post("/governance/templates/:id/apply/:botId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const templateId = Number(req.params.id);
  const botId = Number(req.params.botId);
  const clientId = req.user!.clientId;

  if (isNaN(templateId) || isNaN(botId)) {
    res.status(400).json({ error: "Invalid template or bot ID" });
    return;
  }

  const [template] = await db
    .select()
    .from(permissionProfileTemplatesTable)
    .where(
      and(
        eq(permissionProfileTemplatesTable.id, templateId),
        eq(permissionProfileTemplatesTable.clientId, clientId)
      )
    );

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const permissions = template.permissions as Array<{
    toolName: string;
    allowed: boolean;
    requiresApproval: boolean;
  }>;

  const applied = await db.transaction(async (tx) => {
    await tx
      .delete(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );

    if (permissions.length > 0) {
      await tx.insert(botToolPermissionsTable).values(
        permissions.map((p) => ({
          clientId,
          botId,
          toolName: p.toolName,
          allowed: p.allowed,
          requiresApproval: p.requiresApproval,
        }))
      );
    }

    return tx
      .select()
      .from(botToolPermissionsTable)
      .where(
        and(
          eq(botToolPermissionsTable.clientId, clientId),
          eq(botToolPermissionsTable.botId, botId)
        )
      );
  });

  res.json(applied);
});

router.get("/governance/department-defaults", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  res.json({
    defaults: DEPARTMENT_TOOL_DEFAULTS,
    readOnlyAnalystTools: READ_ONLY_ANALYST_TOOLS,
    sensitiveTools: SENSITIVE_TOOLS,
  });
});

router.get("/governance/autonomy-score", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        gte(pendingApprovalsTable.createdAt, sevenDaysAgo)
      )
    );

  const totalTasks = totalResult?.count ?? 0;

  const [resolvedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, clientId),
        eq(pendingApprovalsTable.status, "pending"),
        gte(pendingApprovalsTable.createdAt, sevenDaysAgo)
      )
    );

  const humanInterventions = resolvedResult?.count ?? 0;
  const autonomousTasks = Math.max(0, totalTasks - humanInterventions);
  const score = totalTasks === 0 ? 100 : Math.round((autonomousTasks / totalTasks) * 100);

  res.json({ score, totalTasks, autonomousTasks });
});

router.get("/governance/ai-trust-settings", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  try {
    const settings = await db
      .select()
      .from(coordinatorClientSettingsTable)
      .where(
        and(
          eq(coordinatorClientSettingsTable.clientId, clientId),
          eq(coordinatorClientSettingsTable.settingKey, "require_human_approval"),
        ),
      )
      .limit(1);

    const thresholdRow = await db
      .select()
      .from(coordinatorClientSettingsTable)
      .where(
        and(
          eq(coordinatorClientSettingsTable.clientId, clientId),
          eq(coordinatorClientSettingsTable.settingKey, "human_approval_confidence_threshold"),
        ),
      )
      .limit(1);

    res.json({
      requireHumanApproval: settings[0]?.settingValue === "true",
      humanApprovalConfidenceThreshold: thresholdRow[0]?.settingValue ? Number(thresholdRow[0].settingValue) : 30,
    });
  } catch (err) {
    console.error("[GovernanceRoutes] ai-trust-settings GET error:", err);
    res.status(500).json({ error: "Failed to fetch AI trust settings" });
  }
});

router.put("/governance/ai-trust-settings", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { requireHumanApproval, humanApprovalConfidenceThreshold } = req.body as {
    requireHumanApproval?: boolean;
    humanApprovalConfidenceThreshold?: number;
  };

  try {
    if (requireHumanApproval !== undefined) {
      await db
        .insert(coordinatorClientSettingsTable)
        .values({
          clientId,
          settingKey: "require_human_approval",
          settingValue: String(!!requireHumanApproval),
        })
        .onConflictDoUpdate({
          target: [coordinatorClientSettingsTable.clientId, coordinatorClientSettingsTable.settingKey],
          set: { settingValue: String(!!requireHumanApproval), updatedAt: new Date() },
        });
    }

    if (humanApprovalConfidenceThreshold !== undefined) {
      const threshold = Math.max(0, Math.min(100, Number(humanApprovalConfidenceThreshold)));
      await db
        .insert(coordinatorClientSettingsTable)
        .values({
          clientId,
          settingKey: "human_approval_confidence_threshold",
          settingValue: String(threshold),
        })
        .onConflictDoUpdate({
          target: [coordinatorClientSettingsTable.clientId, coordinatorClientSettingsTable.settingKey],
          set: { settingValue: String(threshold), updatedAt: new Date() },
        });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[GovernanceRoutes] ai-trust-settings PUT error:", err);
    res.status(500).json({ error: "Failed to save AI trust settings" });
  }
});

router.get("/governance/audit-health", requireRole("owner", "admin"), (_req, res): void => {
  res.json(getAuditHealth());
});

// ── Self-optimizing model routing — owner controls (task #231) ──────────────

router.get("/governance/model-optimizer", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }
  try {
    const settings = await getModelOptimizerSettings(clientId);
    const policies = await db
      .select({
        botId: botModelPoliciesTable.botId,
        model: botModelPoliciesTable.model,
        allowed: botModelPoliciesTable.allowed,
      })
      .from(botModelPoliciesTable)
      .where(eq(botModelPoliciesTable.clientId, clientId));
    res.json({
      ...settings,
      frontierCandidates: FRONTIER_CANDIDATE_MODELS,
      efficientCandidates: EFFICIENT_CANDIDATE_MODELS,
      botPolicies: policies,
    });
  } catch (err) {
    console.error("[GovernanceRoutes] model-optimizer GET error:", err);
    res.status(500).json({ error: "Failed to fetch model optimizer settings" });
  }
});

router.put("/governance/model-optimizer", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }
  const body = req.body as {
    enabled?: boolean;
    qualityWeight?: number;
    requireApproval?: boolean;
    shadowEnabled?: boolean;
    shadowSampleRate?: number;
    shadowThreshold?: number;
  };
  try {
    const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
    if (body.enabled !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.enabled, String(!!body.enabled));
    if (body.requireApproval !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.requireApproval, String(!!body.requireApproval));
    if (body.shadowEnabled !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.shadowEnabled, String(!!body.shadowEnabled));
    if (body.qualityWeight !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.qualityWeight, String(clamp01(Number(body.qualityWeight))));
    if (body.shadowSampleRate !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.shadowSampleRate, String(clamp01(Number(body.shadowSampleRate))));
    if (body.shadowThreshold !== undefined) await setModelOptimizerSetting(clientId, MODEL_OPTIMIZER_SETTING_KEYS.shadowThreshold, String(clamp01(Number(body.shadowThreshold))));

    await writeAuditEntry({
      clientId,
      engine: "model_router",
      decisionType: "model_selection",
      payload: { action: "settings_update", by: req.user!.userId ?? null, changes: body },
    }).catch(() => {});

    res.json(await getModelOptimizerSettings(clientId));
  } catch (err) {
    console.error("[GovernanceRoutes] model-optimizer PUT error:", err);
    res.status(500).json({ error: "Failed to save model optimizer settings" });
  }
});

router.get("/governance/bots/:botId/model-policy", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }
  const botId = Number(req.params.botId);
  if (!Number.isFinite(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }
  try {
    const rows = await db
      .select({ model: botModelPoliciesTable.model, allowed: botModelPoliciesTable.allowed })
      .from(botModelPoliciesTable)
      .where(and(eq(botModelPoliciesTable.clientId, clientId), eq(botModelPoliciesTable.botId, botId)));
    res.json({ botId, policies: rows });
  } catch (err) {
    console.error("[GovernanceRoutes] bot model-policy GET error:", err);
    res.status(500).json({ error: "Failed to fetch bot model policy" });
  }
});

router.put("/governance/bots/:botId/model-policy", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  if (!clientId) { res.status(400).json({ error: "No client context" }); return; }
  const botId = Number(req.params.botId);
  if (!Number.isFinite(botId)) { res.status(400).json({ error: "Invalid botId" }); return; }
  const { model, allowed } = req.body as { model?: string; allowed?: boolean };
  if (!model || typeof allowed !== "boolean") { res.status(400).json({ error: "model and allowed are required" }); return; }
  try {
    // Verify the bot is visible to this client (own tenant or shared) before writing a policy.
    const bot = await db
      .select({ id: botsTable.id })
      .from(botsTable)
      .where(and(eq(botsTable.id, botId), or(isNull(botsTable.tenantId), eq(botsTable.tenantId, clientId))))
      .limit(1);
    if (bot.length === 0) { res.status(404).json({ error: "Bot not found" }); return; }

    await db
      .insert(botModelPoliciesTable)
      .values({ clientId, botId, model, allowed })
      .onConflictDoUpdate({
        target: [botModelPoliciesTable.botId, botModelPoliciesTable.model],
        set: { allowed, updatedAt: new Date() },
      });

    await writeAuditEntry({
      clientId,
      engine: "model_router",
      decisionType: "model_selection",
      payload: { action: "bot_policy_update", botId, model, allowed, by: req.user!.userId ?? null },
    }).catch(() => {});

    res.json({ ok: true, botId, model, allowed });
  } catch (err) {
    console.error("[GovernanceRoutes] bot model-policy PUT error:", err);
    res.status(500).json({ error: "Failed to save bot model policy" });
  }
});

export default router;
