import {
  db,
  botToolPermissionsTable,
  pendingApprovalsTable,
  brandVoiceConfigsTable,
  clientBotsTable,
  botsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

export interface PermissionCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export async function checkToolPermission(
  clientId: number,
  botId: number,
  toolName: string
): Promise<PermissionCheckResult> {
  const allPermissions = await db
    .select()
    .from(botToolPermissionsTable)
    .where(
      and(
        eq(botToolPermissionsTable.clientId, clientId),
        eq(botToolPermissionsTable.botId, botId)
      )
    );

  if (allPermissions.length === 0) {
    return { allowed: false, requiresApproval: false, reason: `No permission profile configured for this bot. An admin must set up tool permissions before the bot can use tools.` };
  }

  const permission = allPermissions.find((p) => p.toolName === toolName);

  if (!permission) {
    return { allowed: false, requiresApproval: false, reason: `Bot is not permitted to use tool: ${toolName} (not in allowlist)` };
  }

  if (!permission.allowed) {
    return { allowed: false, requiresApproval: false, reason: `Bot is not permitted to use tool: ${toolName}` };
  }

  if (permission.requiresApproval) {
    return { allowed: true, requiresApproval: true };
  }

  return { allowed: true, requiresApproval: false };
}

export interface PausedLoopContext {
  model: string;
  maxIterations: number;
  maxTokens: number;
  systemPrompt: string;
  messages: unknown[];
  remainingIterations: number;
  toolCallId: string;
  allToolCallIds: string[];
}

export async function createPendingApproval(params: {
  clientId: number;
  botId: number;
  botName?: string;
  toolName: string;
  toolInput: unknown;
  sessionId?: number;
  conversationId?: number;
  pausedLoopContext?: PausedLoopContext;
}): Promise<number> {
  const [approval] = await db
    .insert(pendingApprovalsTable)
    .values({
      clientId: params.clientId,
      botId: params.botId,
      botName: params.botName ?? null,
      toolName: params.toolName,
      toolInput: params.toolInput,
      status: "pending",
      sessionId: params.sessionId ?? null,
      conversationId: params.conversationId ?? null,
      pausedLoopContext: params.pausedLoopContext ?? null,
    })
    .returning();

  return approval.id;
}

export async function applyBrandVoiceGuardrails(
  clientId: number,
  content: string
): Promise<string> {
  const [config] = await db
    .select()
    .from(brandVoiceConfigsTable)
    .where(eq(brandVoiceConfigsTable.clientId, clientId));

  if (!config) return content;

  const hasRules =
    config.toneDescription ||
    (config.prohibitedPhrases && config.prohibitedPhrases.length > 0) ||
    (config.requiredDisclaimers && config.requiredDisclaimers.length > 0);

  if (!hasRules) return content;

  let violations: string[] = [];

  if (config.prohibitedPhrases && config.prohibitedPhrases.length > 0) {
    const lowerContent = content.toLowerCase();
    for (const phrase of config.prohibitedPhrases) {
      if (lowerContent.includes(phrase.toLowerCase())) {
        violations.push(`Contains prohibited phrase: "${phrase}"`);
      }
    }
  }

  const missingDisclaimers: string[] = [];
  if (config.requiredDisclaimers && config.requiredDisclaimers.length > 0) {
    for (const disclaimer of config.requiredDisclaimers) {
      if (!content.toLowerCase().includes(disclaimer.toLowerCase())) {
        missingDisclaimers.push(disclaimer);
      }
    }
  }

  if (violations.length === 0 && missingDisclaimers.length === 0 && !config.toneDescription) {
    return content;
  }

  const systemPrompt = `You are a brand voice compliance filter. Your job is to take the given text and adjust it to comply with the brand guidelines below. Return ONLY the adjusted text, nothing else. If the text already complies, return it unchanged.

Brand Voice Guidelines:
${config.toneDescription ? `Tone: ${config.toneDescription}` : ""}
${config.prohibitedPhrases && config.prohibitedPhrases.length > 0 ? `Prohibited phrases (must be removed or rephrased): ${config.prohibitedPhrases.join(", ")}` : ""}
${missingDisclaimers.length > 0 ? `Required disclaimers that must be appended if not present: ${missingDisclaimers.join("; ")}` : ""}

${violations.length > 0 ? `Current violations found: ${violations.join("; ")}` : ""}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    });
    return completion.choices[0]?.message?.content ?? content;
  } catch {
    return content;
  }
}

export async function getResolvedApprovals(
  clientId: number,
  botId: number,
  sessionId?: number,
  conversationId?: number
): Promise<Array<{ toolName: string; status: string; toolResult: unknown; rejectionReason: string | null }>> {
  const conditions = [
    eq(pendingApprovalsTable.clientId, clientId),
    eq(pendingApprovalsTable.botId, botId),
  ];

  if (sessionId) {
    conditions.push(eq(pendingApprovalsTable.sessionId, sessionId));
  }
  if (conversationId) {
    conditions.push(eq(pendingApprovalsTable.conversationId, conversationId));
  }

  const approvals = await db
    .select()
    .from(pendingApprovalsTable)
    .where(and(...conditions));

  return approvals
    .filter((a) => a.status === "approved" || a.status === "rejected")
    .map((a) => ({
      toolName: a.toolName,
      status: a.status,
      toolResult: a.toolResult,
      rejectionReason: a.rejectionReason,
    }));
}

export const SENSITIVE_TOOLS = [
  "send_email",
  "crm_create_deal",
  "post_slack_message",
  "create_calendar_event",
  "create_document",
];

export const SAFE_READ_TOOLS = ["web_search", "read_platform_data", "read_world_state", "delegate_to_bot"];

export const DEPARTMENT_TOOL_DEFAULTS: Record<string, { allowed: string[]; approvalRequired: string[] }> = {
  "Finance & Legal": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "read_email", "create_document", "read_document"],
    approvalRequired: ["create_document"],
  },
  "Human Resources": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "create_calendar_event", "list_calendar_events", "send_email", "read_email"],
    approvalRequired: ["send_email", "create_calendar_event"],
  },
  "Sales & Marketing": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "post_slack_message", "read_slack_channel", "create_document", "read_document", "crm_create_deal"],
    approvalRequired: ["post_slack_message", "crm_create_deal"],
  },
  "Technology & Product": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "post_slack_message", "read_slack_channel", "create_document", "read_document"],
    approvalRequired: ["post_slack_message"],
  },
  Operations: {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "send_email", "read_email", "create_calendar_event", "list_calendar_events", "post_slack_message", "read_slack_channel", "create_document", "read_document"],
    approvalRequired: ["send_email", "create_calendar_event"],
  },
  "Executive Leadership": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "send_email", "read_email", "create_document", "read_document", "post_slack_message", "read_slack_channel"],
    approvalRequired: ["send_email", "post_slack_message"],
  },
  "Board of Directors": {
    allowed: [...SAFE_READ_TOOLS, "read_document"],
    approvalRequired: [],
  },
  "Strategy & Innovation": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "create_document", "read_document"],
    approvalRequired: ["create_document"],
  },
  "Voice & Communications": {
    allowed: [...SAFE_READ_TOOLS, "write_world_state", "post_slack_message", "read_slack_channel", "send_email", "read_email"],
    approvalRequired: ["post_slack_message", "send_email"],
  },
};

export async function backfillExistingBotPermissions(getAllToolsFn: () => Array<{ name: string }>) {
  const allClientBots = await db.select().from(clientBotsTable);
  if (allClientBots.length === 0) return;

  const existingPerms = await db.select({
    clientId: botToolPermissionsTable.clientId,
    botId: botToolPermissionsTable.botId,
  }).from(botToolPermissionsTable);

  const hasPerms = new Set(existingPerms.map((p) => `${p.clientId}:${p.botId}`));

  const botsNeedingPerms = allClientBots.filter(
    (cb) => !hasPerms.has(`${cb.clientId}:${cb.botId}`)
  );

  if (botsNeedingPerms.length === 0) return;

  const allTools = getAllToolsFn();
  const allToolNames = allTools.map((t) => t.name);

  const botRows = await db.select().from(botsTable);
  const botMap = new Map(botRows.map((b) => [b.id, b]));

  for (const cb of botsNeedingPerms) {
    const bot = botMap.get(cb.botId);
    const defaults = bot ? DEPARTMENT_TOOL_DEFAULTS[bot.department] : undefined;

    const permissionValues = allToolNames.map((toolName) => {
      const allowed = defaults ? defaults.allowed.includes(toolName) : SAFE_READ_TOOLS.includes(toolName);
      const requiresApproval = defaults
        ? defaults.approvalRequired.includes(toolName)
        : false;
      return {
        clientId: cb.clientId,
        botId: cb.botId,
        toolName,
        allowed,
        requiresApproval: allowed ? requiresApproval : false,
      };
    });

    try {
      await db.insert(botToolPermissionsTable).values(permissionValues);
      console.log(`[governance] Backfilled permissions for bot ${cb.botId} on client ${cb.clientId}`);
    } catch {
      console.log(`[governance] Skipped backfill for bot ${cb.botId} on client ${cb.clientId} (already exists)`);
    }
  }
}

export const READ_ONLY_ANALYST_TOOLS = [
  "web_search",
  "read_platform_data",
  "read_world_state",
  "read_email",
  "read_slack_channel",
  "list_calendar_events",
  "read_document",
  "delegate_to_bot",
];
