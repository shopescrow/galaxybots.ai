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
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import { getAllTools, getTool, type ToolContext } from "../tools";
import { SENSITIVE_TOOLS, SAFE_READ_TOOLS, DEPARTMENT_TOOL_DEFAULTS, READ_ONLY_ANALYST_TOOLS, applyBrandVoiceGuardrails } from "../services/governance";
import { resumeAgenticLoop, resumeAgenticLoopWithRejection } from "../tools/agentic-loop";
import { sendPushToClient } from "../services/push-sender";
import { checkWorkflowTriggers } from "../services/workflow-engine";
import { emitActivityEvent } from "../services/activity-events";
import { createNotification } from "../services/notifications";

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

router.get("/governance/approvals", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const status = (req.query.status as string) || "pending";

  const conditions = [eq(pendingApprovalsTable.clientId, clientId)];
  if (status !== "all") {
    conditions.push(eq(pendingApprovalsTable.status, status));
  }

  const approvals = await db
    .select()
    .from(pendingApprovalsTable)
    .where(and(...conditions));

  res.json(approvals);
});

router.post("/governance/approvals/:id/approve", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const clientId = req.user!.clientId;

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

  let toolResult: unknown = null;
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

  const [updated] = await db
    .update(pendingApprovalsTable)
    .set({ toolResult })
    .where(eq(pendingApprovalsTable.id, id))
    .returning();

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
      resumeResult = await resumeAgenticLoop({
        pausedLoopContext: pausedCtx,
        toolResult,
        context: toolContext,
      });

      if (resumeResult.finalContent) {
        const guardedContent = await applyBrandVoiceGuardrails(approval.clientId, resumeResult.finalContent);
        resumeResult.finalContent = guardedContent;
        await persistResumedOutput(approval, guardedContent);
      }
    } catch (err) {
      console.error("[governance] Failed to resume agentic loop after approval:", err);
      resumeResult = { error: "Loop resume failed" };
    }
  }

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

router.post("/governance/approvals/:id/reject", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const clientId = req.user!.clientId;

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

export default router;
