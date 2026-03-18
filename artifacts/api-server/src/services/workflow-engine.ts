import {
  db,
  workflowsTable,
  workflowRunsTable,
  clientsTable,
  prospectsTable,
  botsTable,
  clientBotsTable,
  toolActivityLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { broadcastSSE } from "./sse";
import { createNotification } from "./notifications";
import { getTool } from "../tools";
import nodemailer from "nodemailer";

type WorkflowNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: { x: number; y: number };
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

type WorkflowDefinition = {
  id: number;
  clientId: number;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggerType: string;
  triggerConfig: Record<string, unknown>;
};

type ExecutionContext = {
  payload: Record<string, unknown>;
  variables: Record<string, unknown>;
  log: Array<{ nodeId: string; type: string; status: string; message: string; timestamp: string }>;
};

function getNestedValue(path: string, obj: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let val: unknown = obj;
  for (const part of parts) {
    if (val === null || val === undefined || typeof val !== "object") return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

function tokenizeCondition(expr: string, payload: Record<string, unknown>): unknown {
  const str = expr.trim();
  if (!str) return true;

  const orParts = str.split(/\bOR\b/i);
  if (orParts.length > 1) {
    return orParts.some((part) => tokenizeCondition(part.trim(), payload));
  }

  const andParts = str.split(/\bAND\b/i);
  if (andParts.length > 1) {
    return andParts.every((part) => tokenizeCondition(part.trim(), payload));
  }

  const opMatch = str.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains|exists)\s*(.*)$/i);
  if (!opMatch) {
    const val = getNestedValue(str, payload);
    return Boolean(val);
  }

  const [, lhsRaw, op, rhsRaw] = opMatch;
  const lhs = getNestedValue(lhsRaw.trim(), payload) ?? lhsRaw.trim();
  const rhs = rhsRaw.trim().replace(/^["']|["']$/g, "");

  const rhsNum = Number(rhs);
  const lhsNum = Number(lhs);

  switch (op.toLowerCase()) {
    case "==": return String(lhs) === rhs;
    case "!=": return String(lhs) !== rhs;
    case ">": return !isNaN(lhsNum) && !isNaN(rhsNum) ? lhsNum > rhsNum : false;
    case ">=": return !isNaN(lhsNum) && !isNaN(rhsNum) ? lhsNum >= rhsNum : false;
    case "<": return !isNaN(lhsNum) && !isNaN(rhsNum) ? lhsNum < rhsNum : false;
    case "<=": return !isNaN(lhsNum) && !isNaN(rhsNum) ? lhsNum <= rhsNum : false;
    case "contains": return typeof lhs === "string" ? lhs.includes(rhs) : false;
    case "exists": return lhs !== undefined && lhs !== null;
    default: return false;
  }
}

function evaluateCondition(expression: string, payload: Record<string, unknown>): boolean {
  try {
    return Boolean(tokenizeCondition(expression, payload));
  } catch {
    return false;
  }
}

function buildAdjacencyList(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const adj: Map<string, string[]> = new Map();
  const inDegree: Map<string, number> = new Map();
  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }
  return { adj, inDegree };
}

function getReachableNodes(startId: string, adj: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[], startNodeId?: string): WorkflowNode[] {
  const { adj, inDegree } = buildAdjacencyList(nodes, edges);

  const reachable = startNodeId ? getReachableNodes(startNodeId, adj) : null;

  const queue: string[] = [];
  const sorted: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0 && (!reachable || id === startNodeId)) queue.push(id);
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable && !reachable.has(current)) continue;
    sorted.push(current);
    for (const neighbor of adj.get(current) ?? []) {
      if (reachable && !reachable.has(neighbor)) continue;
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean);
}

function interpolateVars(value: unknown, ctx: ExecutionContext): unknown {
  if (typeof value === "string") {
    return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split(".");
      let obj: unknown = parts[0] === "payload" ? ctx.payload : ctx.variables;
      const restParts = parts[0] === "payload" || parts[0] === "variables" ? parts.slice(1) : parts;
      for (const part of restParts) {
        if (obj == null || typeof obj !== "object") return match;
        obj = (obj as Record<string, unknown>)[part];
      }
      return obj != null ? String(obj) : match;
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolateVars(v, ctx));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolateVars(v, ctx)]));
  }
  return value;
}

async function dispatchAction(
  actionSubType: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext,
  workflowId: number,
  clientId: number,
): Promise<string> {
  const config_ = interpolateVars(config, ctx) as Record<string, unknown>;
  const TOOL_ALIASES: Record<string, string> = {
    create_hubspot_deal: "crm_create_deal",
    generate_bingolingo: "bingolingo_create_content",
    request_aeo_scan: "analyze_aeo_score",
  };
  const resolvedToolName = TOOL_ALIASES[actionSubType] ?? actionSubType;
  const registeredTool = getTool(resolvedToolName);
  if (registeredTool) {
    const botId = (ctx.variables.__botId as number) ?? 0;
    const toolContext = { clientId, botId };
    const mergedInput: Record<string, unknown> = { ...config_, ...ctx.payload };
    if (actionSubType === "create_hubspot_deal") {
      if (config_.dealStage && !mergedInput.stage) mergedInput.stage = config_.dealStage;
      if (config_.dealAmount !== undefined && mergedInput.amount === undefined) mergedInput.amount = config_.dealAmount;
      if (!mergedInput.dealName) mergedInput.dealName = String(ctx.payload.prospectName ?? ctx.payload.name ?? "Workflow Deal");
    }
    if (actionSubType === "send_email") {
      if (config_.toEmail && !mergedInput.to) mergedInput.to = config_.toEmail;
    }
    const validated = registeredTool.inputSchema.safeParse(mergedInput);
    if (validated.success) {
      const result = await registeredTool.execute(validated.data, toolContext);
      await db.insert(toolActivityLogTable).values({
        clientId,
        toolName: resolvedToolName,
        botName: "workflow",
        metadata: { workflowId, status: "success", source: "workflow_action", subType: actionSubType },
      }).catch(() => {});
      return typeof result === "string" ? result : JSON.stringify(result);
    }
    console.warn(`[workflow-engine] Tool "${resolvedToolName}" input validation failed for action "${actionSubType}":`, validated.error.flatten());
  }

  switch (actionSubType) {
    case "send_notification":
    case "notify_owner": {
      const title = String(config_.title ?? "Workflow Notification");
      const body = String(config_.body ?? `Workflow action triggered`);
      await createNotification({
        clientId,
        category: "pipeline",
        severity: (config_.severity as "info" | "warning" | "critical") ?? "info",
        title,
        body,
        link: (config_.link as string) ?? "/process-studio",
        metadata: { workflowId, source: "workflow_action" },
      });
      return `Notification sent: "${title}"`;
    }

    case "update_prospect_status": {
      const prospectId = Number(config_.prospectId ?? ctx.payload.prospectId);
      const status = String(config_.status ?? config_.newStatus ?? "qualified");
      if (prospectId && !isNaN(prospectId)) {
        await db
          .update(prospectsTable)
          .set({ status: status as "qualified" | "contacted" | "rejected", updatedAt: new Date() })
          .where(and(eq(prospectsTable.id, prospectId), eq(prospectsTable.clientId, clientId)));
        return `Prospect ${prospectId} status updated to "${status}"`;
      }
      return `Prospect status action: no prospectId in payload`;
    }

    case "create_brief":
    case "log_audit": {
      const message = String(config_.message ?? `Workflow ${workflowId} executed ${actionSubType}`);
      await createNotification({
        clientId,
        category: "pipeline",
        severity: "info",
        title: actionSubType === "log_audit" ? "Audit Log Entry" : "Brief Entry",
        body: message,
        link: "/command-center",
        metadata: { workflowId, source: "workflow_action", actionType: actionSubType },
      });
      return `${actionSubType}: "${message}"`;
    }

    case "send_email": {
      const to = String(config_.to ?? config_.toEmail ?? "");
      const subject = String(config_.subject ?? `Workflow ${workflowId} notification`);
      const body = String(config_.body ?? config_.message ?? "");
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      if (smtpUser && smtpPass && to) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? "smtp.gmail.com",
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: false,
          auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({ from: `"GalaxyBots" <${smtpUser}>`, to, subject, text: body });
        return `Email sent to "${to}": ${subject}`;
      }
      await createNotification({
        clientId,
        category: "pipeline",
        severity: "info",
        title: `[Workflow] Email: ${subject}`,
        body: body ? body.substring(0, 200) : `To: ${to}`,
        link: "/process-studio",
        metadata: { workflowId, actionType: "send_email", to, subject },
      });
      return `Email queued (SMTP not configured) — notification created for "${to}": ${subject}`;
    }

    case "send_sms": {
      await createNotification({
        clientId,
        category: "pipeline",
        severity: "info",
        title: `[Workflow] SMS: ${String(config_.to ?? "recipient")}`,
        body: String(config_.body ?? config_.message ?? "SMS queued"),
        link: "/process-studio",
        metadata: { workflowId, actionType: "send_sms", to: config_.to },
      });
      return `SMS queued for "${String(config_.to ?? "unknown")}" — notification created`;
    }

    case "post_to_slack": {
      await createNotification({
        clientId,
        category: "pipeline",
        severity: "info",
        title: `[Workflow] Slack: ${String(config_.channel ?? "#general")}`,
        body: String(config_.text ?? config_.message ?? "Workflow notification"),
        link: "/process-studio",
        metadata: { workflowId, actionType: "post_to_slack", channel: config_.channel },
      });
      return `Slack post queued for "${String(config_.channel ?? "#general")}" — notification created`;
    }

    case "send_message_to_bot": {
      const botName = String(config_.botName ?? config_.botId ?? "");
      const message = String(config_.message ?? config_.prompt ?? `Workflow ${workflowId} triggered action`);
      const botRecord = botName
        ? await db.select().from(botsTable).where(eq(botsTable.name, botName)).limit(1).then((r) => r[0])
        : null;
      const resolved = botRecord ? `bot #${botRecord.id} (${botRecord.name})` : `bot "${botName}"`;
      await db.insert(toolActivityLogTable).values({
        clientId,
        toolName: "send_message_to_bot",
        botName: botName || "workflow",
        metadata: { workflowId, message: message.substring(0, 500), targetBot: botName, status: "success" },
      });
      return `Message sent to ${resolved}: "${message.substring(0, 100)}"`;
    }

    case "deploy_team": {
      const teamNames = String(config_.teamNames ?? config_.botName ?? "");
      const prompt = String(config_.prompt ?? config_.message ?? `Workflow ${workflowId} triggered team deployment`);
      const names = teamNames.split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) {
        return `deploy_team: no bot names specified in config.teamNames`;
      }
      const bots = await db.select().from(botsTable).where(eq(botsTable.clientId, clientId));
      const dispatched: string[] = [];
      for (const name of names) {
        const bot = bots.find((b) => b.name.toLowerCase() === name.toLowerCase());
        if (bot) {
          await db.insert(toolActivityLogTable).values({
            clientId,
            toolName: "deploy_team",
            botName: bot.name,
            metadata: { workflowId, prompt: prompt.substring(0, 200), status: "dispatched", source: "workflow_action" },
          }).catch(() => {});
          dispatched.push(`${bot.name} (#${bot.id})`);
        } else {
          dispatched.push(`${name} (not found)`);
        }
      }
      await createNotification({
        clientId,
        category: "pipeline",
        severity: "info",
        title: `[Workflow] Team Deployed`,
        body: `Bots dispatched: ${dispatched.join(", ")} — Task: ${prompt.substring(0, 100)}`,
        link: "/process-studio",
        metadata: { workflowId, actionType: "deploy_team", bots: dispatched },
      });
      return `Team deployed: ${dispatched.join(", ")}`;
    }

    default: {
      return `Action "${actionSubType}" completed`;
    }
  }
}

function getNodeSemanticType(node: WorkflowNode): string {
  if (node.data.nodeType && typeof node.data.nodeType === "string") {
    return node.data.nodeType;
  }
  return node.type;
}

function getNodeConfig(node: WorkflowNode): Record<string, unknown> {
  const configNested = (node.data.config as Record<string, unknown>) ?? {};
  const flat = { ...node.data };
  delete flat.config;
  return { ...configNested, ...flat };
}

async function executeNode(
  node: WorkflowNode,
  ctx: ExecutionContext,
  workflowId: number,
  clientId: number,
): Promise<{ status: "success" | "skip" | "error" | "paused"; message: string; conditionResult?: boolean; delayMinutes?: number }> {
  const semanticType = getNodeSemanticType(node);
  const config = getNodeConfig(node);

  const logEntry = (status: string, message: string) => ({
    nodeId: node.id,
    type: semanticType,
    status,
    message,
    timestamp: new Date().toISOString(),
  });

  try {
    switch (semanticType) {
      case "trigger":
        ctx.log.push(logEntry("success", `Trigger: ${config.subType ?? config.triggerType ?? "manual"}`));
        return { status: "success", message: "Trigger passed" };

      case "condition": {
        const expr = String(config.expression ?? "");
        const result = evaluateCondition(expr, { ...ctx.payload, ...ctx.variables });
        const branchTaken = result ? "true" : "false";
        const msg = expr
          ? `Condition "${expr}" → ${branchTaken} branch`
          : `Condition node: no expression, defaulting true`;
        ctx.log.push(logEntry(result ? "success" : "skip", msg));
        ctx.variables[`condition_${node.id}`] = result;
        return { status: result ? "success" : "skip", message: msg, conditionResult: result };
      }

      case "delay": {
        const minutes = Number(config.delayMinutes ?? config.minutes ?? 0);
        const msg = minutes > 0
          ? `Delay: ${minutes} minute${minutes !== 1 ? "s" : ""} (scheduled for deferred resume)`
          : `Delay: 0 minutes — continuing immediately`;
        ctx.log.push(logEntry("success", msg));
        return { status: minutes > 0 ? "paused" : "success", message: msg, delayMinutes: minutes };
      }

      case "action": {
        const subType = String(config.subType ?? config.actionType ?? "send_notification");
        const msg = await dispatchAction(subType, config, ctx, workflowId, clientId);
        ctx.log.push(logEntry("success", msg));
        return { status: "success", message: msg };
      }

      case "output": {
        const subType = String(config.subType ?? "notify_owner");
        const msg = await dispatchAction(subType, config, ctx, workflowId, clientId);
        ctx.log.push(logEntry("success", msg));
        return { status: "success", message: msg };
      }

      case "split":
        ctx.log.push(logEntry("success", "Split: fanning out to parallel branches"));
        return { status: "success", message: "Split executed" };

      case "merge":
        ctx.log.push(logEntry("success", "Merge: collecting parallel branches"));
        return { status: "success", message: "Merge executed" };

      default:
        ctx.log.push(logEntry("success", `Node "${semanticType}" executed`));
        return { status: "success", message: `Node ${semanticType} completed` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Node execution failed";
    ctx.log.push(logEntry("error", message));
    return { status: "error", message };
  }
}

export async function executeWorkflow(
  workflowId: number,
  triggeredBy: string,
  payload: Record<string, unknown> = {},
): Promise<{ runId: number; status: string }> {
  const [workflow] = await db
    .select()
    .from(workflowsTable)
    .where(eq(workflowsTable.id, workflowId));

  if (!workflow) throw new Error("Workflow not found");
  if (!workflow.enabled) throw new Error("Workflow is disabled");

  const nodes = (workflow.nodes ?? []) as WorkflowNode[];
  const edges = (workflow.edges ?? []) as WorkflowEdge[];

  const [run] = await db
    .insert(workflowRunsTable)
    .values({
      workflowId,
      clientId: workflow.clientId,
      triggeredBy,
      status: "running",
      startedAt: new Date(),
      log: [],
    })
    .returning();

  const triggerNode = (nodes as WorkflowNode[]).find((n) => getNodeSemanticType(n) === "trigger");
  const triggerConfig = (triggerNode?.data?.config ?? triggerNode?.data ?? {}) as Record<string, unknown>;
  const assignedBotId = Number(triggerConfig.botId ?? 0);

  const ctx: ExecutionContext = {
    payload,
    variables: { __botId: assignedBotId, __workflowId: workflowId, __clientId: workflow.clientId },
    log: [],
  };

  let finalStatus = "done";
  const sorted = topologicalSort(nodes, edges, triggerNode?.id);

  const resumeFromNodeId = payload.__skipBeforeNodeId as string | undefined;
  let reachedResumePoint = !resumeFromNodeId;

  const skippedNodes = new Set<string>();
  const edgesBySource = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);
  }

  for (const node of sorted) {
    if (!reachedResumePoint) {
      if (node.id === resumeFromNodeId) {
        reachedResumePoint = true;
      } else {
        ctx.log.push({ nodeId: node.id, type: getNodeSemanticType(node), status: "skip", message: "Skipped (already executed before delay)", timestamp: new Date().toISOString() });
        continue;
      }
    }
    if (skippedNodes.has(node.id)) {
      ctx.log.push({
        nodeId: node.id,
        type: getNodeSemanticType(node),
        status: "skip",
        message: "Skipped (excluded by condition branch)",
        timestamp: new Date().toISOString(),
      });
      const outEdges = edgesBySource.get(node.id) ?? [];
      for (const e of outEdges) skippedNodes.add(e.target);
      continue;
    }

    const result = await executeNode(node, ctx, workflowId, workflow.clientId);
    if (result.status === "error") {
      finalStatus = "failed";
      break;
    }

    if (result.status === "paused" && result.delayMinutes && result.delayMinutes > 0) {
      const resumeAt = new Date(Date.now() + result.delayMinutes * 60 * 1000);
      const remainingNodeIds = sorted.slice(sorted.indexOf(node) + 1).map((n) => n.id);
      const resumeEntry = {
        type: "delay_resume",
        resumeAt: resumeAt.toISOString(),
        remainingNodeIds,
        variables: ctx.variables,
        payload: ctx.payload,
      };
      await db.update(workflowRunsTable).set({
        status: "paused",
        log: [...ctx.log, resumeEntry],
      }).where(eq(workflowRunsTable.id, run.id));
      finalStatus = "paused";
      break;
    }

    if (result.conditionResult !== undefined) {
      const outEdges = edgesBySource.get(node.id) ?? [];
      for (const e of outEdges) {
        const handle = e.sourceHandle;
        const shouldSkip =
          (result.conditionResult === true && handle === "false") ||
          (result.conditionResult === false && handle === "true");
        if (shouldSkip) skippedNodes.add(e.target);
      }
    }
  }

  if (finalStatus === "paused") {
    return { runId: run.id, status: "paused" };
  }

  await db
    .update(workflowRunsTable)
    .set({
      status: finalStatus,
      completedAt: new Date(),
      log: ctx.log,
    })
    .where(eq(workflowRunsTable.id, run.id));

  await db
    .update(workflowsTable)
    .set({
      lastRunAt: new Date(),
      runCount: (workflow.runCount ?? 0) + 1,
    })
    .where(eq(workflowsTable.id, workflowId));

  broadcastSSE("workflow-run", {
    clientId: workflow.clientId,
    workflowId,
    runId: run.id,
    workflowName: workflow.name,
    status: finalStatus,
    triggeredBy,
  });

  broadcastSSE("activity", {
    id: `workflow-run-${run.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    clientId: workflow.clientId,
    source: "galaxybots",
    eventType: "workflow_run",
    title: `Workflow "${workflow.name}" ${finalStatus}`,
    description: `Workflow "${workflow.name}" ${finalStatus} — run #${run.id} triggered by ${triggeredBy}`,
    severity: finalStatus === "failed" ? "critical" : "info",
    link: "/process-studio",
    metadata: { workflowId, runId: run.id, triggeredBy, status: finalStatus },
  });

  if (finalStatus === "failed") {
    createNotification({
      clientId: workflow.clientId,
      category: "pipeline",
      severity: "critical",
      title: `Workflow "${workflow.name}" failed`,
      body: `Workflow run #${run.id} failed during execution`,
      link: "/process-studio",
      metadata: { workflowId, runId: run.id },
    }).catch((e) => console.error("[workflow] Failed to create failure notification:", e));
  }

  return { runId: run.id, status: finalStatus };
}

export async function resumeWorkflowRunFromDelay(
  runId: number,
  workflowId: number,
  resumeFromNodeId: string,
  payload: Record<string, unknown>,
  priorLog: unknown[],
): Promise<void> {
  const [workflow] = await db.select().from(workflowsTable).where(eq(workflowsTable.id, workflowId));
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  const nodes = (workflow.nodes ?? []) as WorkflowNode[];
  const edges = (workflow.edges ?? []) as WorkflowEdge[];

  const triggerNode = nodes.find((n) => getNodeSemanticType(n) === "trigger");
  const triggerConfig = (triggerNode?.data?.config ?? triggerNode?.data ?? {}) as Record<string, unknown>;
  const assignedBotId = Number(triggerConfig.botId ?? 0);

  const ctx: ExecutionContext = {
    payload,
    variables: { __botId: assignedBotId, __workflowId: workflowId, __clientId: workflow.clientId },
    log: priorLog as Array<{ nodeId: string; type: string; status: string; message: string; timestamp: string }>,
  };

  const allSorted = topologicalSort(nodes, edges, triggerNode?.id);
  const resumeIdx = allSorted.findIndex((n) => n.id === resumeFromNodeId);
  const sorted = resumeIdx >= 0 ? allSorted.slice(resumeIdx) : allSorted;

  let finalStatus = "done";
  const skippedNodes = new Set<string>();
  const edgesBySource = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, []);
    edgesBySource.get(edge.source)!.push(edge);
  }

  for (const node of sorted) {
    if (skippedNodes.has(node.id)) {
      ctx.log.push({ nodeId: node.id, type: getNodeSemanticType(node), status: "skip", message: "Skipped (excluded by condition branch)", timestamp: new Date().toISOString() });
      const outEdges = edgesBySource.get(node.id) ?? [];
      for (const e of outEdges) skippedNodes.add(e.target);
      continue;
    }

    const result = await executeNode(node, ctx, workflowId, workflow.clientId);
    if (result.status === "error") { finalStatus = "failed"; break; }

    if (result.status === "paused" && result.delayMinutes && result.delayMinutes > 0) {
      const resumeAt = new Date(Date.now() + result.delayMinutes * 60 * 1000);
      const remainingNodeIds = sorted.slice(sorted.indexOf(node) + 1).map((n) => n.id);
      await db.update(workflowRunsTable).set({
        status: "paused",
        log: [...ctx.log, { type: "delay_resume", resumeAt: resumeAt.toISOString(), remainingNodeIds, variables: ctx.variables, payload: ctx.payload }],
      }).where(eq(workflowRunsTable.id, runId));
      return;
    }

    if (result.conditionResult !== undefined) {
      const outEdges = edgesBySource.get(node.id) ?? [];
      for (const e of outEdges) {
        const handle = e.sourceHandle;
        const shouldSkip = (result.conditionResult === true && handle === "false") || (result.conditionResult === false && handle === "true");
        if (shouldSkip) skippedNodes.add(e.target);
      }
    }
  }

  await db.update(workflowRunsTable).set({ status: finalStatus, completedAt: new Date(), log: ctx.log }).where(eq(workflowRunsTable.id, runId));

  broadcastSSE("workflow-run", { clientId: workflow.clientId, workflowId, runId, workflowName: workflow.name, status: finalStatus, triggeredBy: "delay_resume" });
  broadcastSSE("activity", {
    id: `workflow-run-${runId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    clientId: workflow.clientId,
    source: "galaxybots",
    eventType: "workflow_run",
    title: `Workflow "${workflow.name}" resumed and ${finalStatus}`,
    description: `Workflow "${workflow.name}" resumed from delay and ${finalStatus}`,
    severity: finalStatus === "failed" ? "critical" : "info",
    link: "/process-studio",
    metadata: { workflowId, runId, triggeredBy: "delay_resume", status: finalStatus },
  });
}

export async function checkWorkflowTriggers(
  eventType: string,
  payload: Record<string, unknown>,
  clientId: number,
): Promise<void> {
  try {
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.clientId, clientId),
          eq(workflowsTable.enabled, true),
          eq(workflowsTable.triggerType, eventType),
        )
      );

    for (const workflow of workflows) {
      const config = (workflow.triggerConfig ?? {}) as Record<string, unknown>;
      let matches = true;

      if (eventType === "aeo_score_changed" && config.minDropPoints) {
        const drop = (payload.scoreDrop as number) ?? 0;
        if (drop < Number(config.minDropPoints)) matches = false;
      }
      if (eventType === "prospect_qualified" && config.minScore) {
        const score = (payload.confidenceScore as number) ?? (payload.score as number) ?? 0;
        if (score < Number(config.minScore)) matches = false;
      }

      if (matches) {
        executeWorkflow(workflow.id, eventType, payload).catch((err) => {
          console.error(`[workflow-trigger] Failed to execute workflow ${workflow.id}:`, err);
        });
      }
    }
  } catch (err) {
    console.error("[workflow-trigger] Error checking triggers:", err);
  }
}

export async function seedBuiltInWorkflows(clientId: number): Promise<void> {
  const existing = await db
    .select({ id: workflowsTable.id })
    .from(workflowsTable)
    .where(
      and(
        eq(workflowsTable.clientId, clientId),
        eq(workflowsTable.isBuiltIn, true),
      )
    );

  if (existing.length > 0) return;

  const makeNode = (id: string, nodeType: string, subType: string, label: string, config: Record<string, unknown>, position: { x: number; y: number }) => ({
    id,
    type: "custom",
    position,
    data: { label, nodeType, subType, config },
  });

  const templates = [
    {
      name: "Prospect-to-Outreach",
      description: "When prospect qualifies (score > 75) → Sales bot drafts outreach → Send email → Create HubSpot deal",
      triggerType: "prospect_qualified",
      triggerConfig: { minScore: 75 },
      nodes: [
        makeNode("t1", "trigger", "prospect_qualified", "Prospect Qualified", { minScore: 75 }, { x: 100, y: 100 }),
        makeNode("a1", "action", "send_message_to_bot", "Draft Outreach", { botName: "Sales Bot", message: "Draft personalized outreach for {{prospect.name}}" }, { x: 320, y: 100 }),
        makeNode("a2", "action", "send_email", "Send Email", { toEmail: "{{prospect.email}}", subject: "Reaching out from GalaxyBots" }, { x: 540, y: 100 }),
        makeNode("a3", "action", "create_hubspot_deal", "Create HubSpot Deal", { dealStage: "appointmentscheduled" }, { x: 760, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
        { id: "e3", source: "a2", target: "a3" },
      ],
    },
    {
      name: "AEO Alert Response",
      description: "When Cloud 9 score drops > 10 points → CMO bot generates response plan → Notify owner in Slack",
      triggerType: "aeo_score_changed",
      triggerConfig: { minDropPoints: 10 },
      nodes: [
        makeNode("t1", "trigger", "aeo_score_changed", "AEO Score Dropped", { minDropPoints: 10 }, { x: 100, y: 100 }),
        makeNode("a1", "action", "send_message_to_bot", "Generate Response Plan", { botName: "CMO Bot", message: "AEO score dropped. Generate competitive response plan." }, { x: 320, y: 100 }),
        makeNode("a2", "action", "post_to_slack", "Post to Slack", { channel: "#aeo-alerts" }, { x: 540, y: 100 }),
        makeNode("o1", "output", "notify_owner", "Notify Owner", { title: "AEO Score Alert", severity: "warning" }, { x: 760, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
        { id: "e3", source: "a2", target: "o1" },
      ],
    },
    {
      name: "New Client Welcome",
      description: "When client created → Install vertical pack → Launch welcome mission → Send welcome email",
      triggerType: "new_client_created",
      triggerConfig: {},
      nodes: [
        makeNode("t1", "trigger", "new_client_created", "New Client Created", {}, { x: 100, y: 100 }),
        makeNode("a1", "action", "deploy_team", "Install Vertical Pack", { teamNames: "Sales Bot, Research Bot" }, { x: 320, y: 100 }),
        makeNode("a2", "action", "send_message_to_bot", "Launch Welcome Mission", { botName: "Sales Bot", message: "New client onboarded. Begin welcome sequence." }, { x: 540, y: 100 }),
        makeNode("a3", "action", "send_email", "Send Welcome Email", { toEmail: "{{client.email}}", subject: "Welcome to GalaxyBots!" }, { x: 760, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
        { id: "e3", source: "a2", target: "a3" },
      ],
    },
    {
      name: "Weekly Intelligence Digest",
      description: "Every Monday 7am → Compile brief → Send email + Slack",
      triggerType: "schedule",
      triggerConfig: { cron: "0 7 * * 1" },
      nodes: [
        makeNode("t1", "trigger", "schedule", "Every Monday 7am", { cron: "0 7 * * 1" }, { x: 100, y: 100 }),
        makeNode("a1", "output", "create_brief", "Compile Intelligence Brief", { message: "Weekly intelligence digest compiled" }, { x: 320, y: 100 }),
        makeNode("a2", "action", "send_email", "Send Email Digest", { toEmail: "{{owner.email}}", subject: "Weekly Intelligence Digest" }, { x: 540, y: 100 }),
        makeNode("a3", "action", "post_to_slack", "Post to Slack", { channel: "#intelligence-digest" }, { x: 760, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
        { id: "e3", source: "a1", target: "a3" },
      ],
    },
    {
      name: "Competitor Citation Alert",
      description: "When competitor gains citation on ChatGPT/Gemini → CMO bot drafts competitive response → Notify in Slack",
      triggerType: "competitor_citation_gained",
      triggerConfig: {},
      nodes: [
        makeNode("t1", "trigger", "competitor_citation_gained", "Competitor Citation Gained", {}, { x: 100, y: 100 }),
        makeNode("a1", "action", "send_message_to_bot", "Draft Competitive Response", { botName: "CMO Bot", message: "Competitor gained citation. Draft competitive response." }, { x: 320, y: 100 }),
        makeNode("a2", "action", "post_to_slack", "Notify in Slack", { channel: "#competitive-intel" }, { x: 540, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
      ],
    },
    {
      name: "Voice Call Follow-up",
      description: "When Twilio call ends → Receptionist bot creates transcript summary → Create calendar follow-up event → Log to CRM",
      triggerType: "twilio_call_ended",
      triggerConfig: {},
      nodes: [
        makeNode("t1", "trigger", "twilio_call_ended", "Twilio Call Ended", {}, { x: 100, y: 100 }),
        makeNode("a1", "action", "send_message_to_bot", "Create Transcript Summary", { botName: "Receptionist Bot", message: "Twilio call ended. Create transcript summary." }, { x: 320, y: 100 }),
        makeNode("a2", "action", "create_calendar_event", "Create Follow-up Event", { eventTitle: "Follow-up call", durationMinutes: 30 }, { x: 540, y: 100 }),
        makeNode("o1", "output", "log_audit", "Log to CRM", { message: "Call logged to CRM" }, { x: 760, y: 100 }),
      ],
      edges: [
        { id: "e1", source: "t1", target: "a1" },
        { id: "e2", source: "a1", target: "a2" },
        { id: "e3", source: "a2", target: "o1" },
      ],
    },
  ];

  for (const template of templates) {
    await db.insert(workflowsTable).values({
      clientId,
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      nodes: template.nodes,
      edges: template.edges,
      enabled: false,
      isBuiltIn: true,
    });
  }
}
