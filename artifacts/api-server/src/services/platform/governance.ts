import {
  db,
  botToolPermissionsTable,
  pendingApprovalsTable,
  brandVoiceConfigsTable,
  clientBotsTable,
  botsTable,
  approvalSlaConfigsTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createNotification } from "../admin/notifications";
import { emitActivityEvent } from "../analytics/activity-events";

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
    const [slaConfig] = await db
      .select()
      .from(approvalSlaConfigsTable)
      .where(eq(approvalSlaConfigsTable.clientId, clientId));

    const trustedCategories: string[] = slaConfig?.trustedCategories ?? ["web_search", "read_email"];
    if (trustedCategories.includes(toolName)) {
      return { allowed: true, requiresApproval: false, reason: `Tool "${toolName}" is trusted — approval bypassed` };
    }

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
  const timeSensitiveTools = [
    "send_email",
    "create_invoice",
    "send_notification",
    "post_to_slack",
    "send_sms",
    "schedule_meeting",
  ];
  const isTimeSensitive = timeSensitiveTools.includes(params.toolName);

  const [slaConfig] = await db
    .select()
    .from(approvalSlaConfigsTable)
    .where(eq(approvalSlaConfigsTable.clientId, params.clientId));

  const slaMinutes = isTimeSensitive
    ? (slaConfig?.timeSensitiveSlaMinutes ?? 60)
    : (slaConfig?.defaultSlaMinutes ?? 240);
  const slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);

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
      slaDeadline,
      isTimeSensitive,
    })
    .returning();

  const pendingCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pendingApprovalsTable)
    .where(
      and(
        eq(pendingApprovalsTable.clientId, params.clientId),
        eq(pendingApprovalsTable.status, "pending"),
      ),
    );
  const badge = pendingCount[0]?.count ?? 1;

  createNotification({
    clientId: params.clientId,
    category: "bot",
    severity: "warning",
    title: "Approval Required",
    body: `${params.botName ?? "A bot"} wants to use ${params.toolName} and needs your approval.`,
    link: `/approval/${approval.id}`,
    metadata: { approvalId: approval.id, badge },
    isApproval: true,
  }).catch(() => {});

  emitActivityEvent({
    clientId: params.clientId,
    type: "approval_created",
    title: "Approval Request Created",
    description: `${params.botName ?? "A bot"} requested permission to use "${params.toolName}"`,
    severity: "warning",
    source: "galaxybots",
    metadata: { approvalId: approval.id, toolName: params.toolName, botId: params.botId },
    link: `/command-center`,
  });

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
      model: "gpt-5-mini",
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
  "Asset Studio": {
    // Asset Studio bots produce digital assets and structured specs. None of
    // these tools take external/on-chain/financial action — the web3 tools only
    // write draft specs, and publishing is gated by an explicit human approval
    // on the asset lifecycle (see assets route /status), not at tool-call time.
    allowed: [
      ...SAFE_READ_TOOLS,
      "write_world_state",
      "create_document",
      "read_document",
      "create_asset",
      "attach_asset_file",
      "submit_asset_for_review",
      "mark_asset_published",
      "log_asset_revenue",
      "list_portfolio",
      "generate_visual_asset",
      "generate_pod_design",
      "generate_logo_brand_kit",
      "generate_stock_media_batch",
      "draft_web3_asset_spec",
      "generate_virtual_influencer_persona",
      "catalog_lora_model",
    ],
    approvalRequired: [],
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

export const ROUTINE_TOOLS = [
  "web_search",
  "scrape_url",
  "read_platform_data",
  "read_world_state",
  "write_world_state",
  "read_email",
  "read_slack_channel",
  "list_calendar_events",
  "read_document",
  "delegate_to_bot",
  "delegate_task",
  "report_results",
];

export async function getClientGovernanceMode(clientId: number): Promise<string> {
  const [client] = await db
    .select({ governanceMode: clientsTable.governanceMode })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return (client as { governanceMode?: string } | undefined)?.governanceMode ?? "approval_all";
}
