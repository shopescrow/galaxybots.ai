/**
 * Moltbook service (Task #207, Phase 1 — steps 3–6).
 *
 * Shared logic used by both the governed Moltbook agent tools
 * (`tools/integrations/moltbook.ts`) and the owner-facing routes
 * (`routes/moltbook`). Layers persistence, eligibility, safety, governance and
 * the approval queue on top of the pure HTTP client (`moltbook-client.ts`).
 *
 * Discipline enforced here:
 *  - Eligibility allowlist: only first-party (non-tenant, non-AI-generated)
 *    GalaxyBots Sales & Marketing agents on the named allowlist may participate,
 *    and only with an explicit `moltbook_post` permission for tool use.
 *  - Secret discipline: the api_key is stored AES-256-GCM encrypted and only
 *    ever decrypted to hand to the Moltbook client (which only talks to
 *    www.moltbook.com). It is never logged or returned to API callers.
 *  - Outbound posts/comments pass governance (brand voice) + the consequence
 *    gate + a credential-exfiltration refusal before sending.
 *  - Approval mode is the default: posts/comments are queued unless the agent's
 *    account is in autonomous mode (and never bypass the gates).
 */

import {
  db,
  botsTable,
  botToolPermissionsTable,
  moltbookAccountsTable,
  moltbookApprovalQueueTable,
  type Bot,
  type MoltbookAccount,
  type MoltbookApproval,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { encryptCredential, decryptCredential } from "../../utils/credential-encryption";
import { checkToolPermission, applyBrandVoiceGuardrails } from "./governance";
import { checkConsequenceRisk } from "./consequence-gate";
import { screenForCredentialExfiltration } from "../ai-safety/prompt-injection";
import { writeAuditEntry } from "../audit/audit-ledger";
import { emitActivityEvent } from "../analytics/activity-events";
import * as moltbook from "../../tools/integrations/moltbook-client";

/** The permission name that must be explicitly granted for an agent to post. */
export const MOLTBOOK_POST_PERMISSION = "moltbook_post";

/** First-party Sales & Marketing agents allowed on Moltbook (default ON). */
export const MOLTBOOK_DEFAULT_ON_AGENTS = [
  "Brand Maven Priya",
  "PR Maestro Celeste",
  "Digital Dominic",
  "Growth Hawk Yusuf",
] as const;

/** Opt-in eligible agents (must be explicitly enabled by the owner). */
export const MOLTBOOK_OPT_IN_AGENTS = [
  "Closer King Rivera",
  "Partner Pro Felix",
  "PirateMonster Sales Bot",
] as const;

/** Full eligibility allowlist (default-ON + opt-in). */
export const MOLTBOOK_ELIGIBLE_AGENTS: ReadonlySet<string> = new Set<string>([
  ...MOLTBOOK_DEFAULT_ON_AGENTS,
  ...MOLTBOOK_OPT_IN_AGENTS,
]);

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  bot?: Bot;
}

/**
 * Eligibility for connecting/owning a Moltbook identity (owner-facing):
 * first-party (non-tenant, non-AI-generated) Sales & Marketing agent that is on
 * the named allowlist. Refuses all other personas and every client-owned
 * tenant instance.
 */
export async function checkAgentEligibility(botId: number | undefined): Promise<EligibilityResult> {
  if (!botId) return { eligible: false, reason: "No agent specified." };

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) return { eligible: false, reason: "Agent not found." };

  // Client-owned tenant instances and AI-generated bots are never eligible.
  if (bot.tenantId != null || bot.isAiGenerated) {
    return {
      eligible: false,
      reason:
        "Moltbook participation is restricted to first-party GalaxyBots agents. Client-owned / AI-generated instances are not eligible.",
    };
  }

  if (bot.department !== "Sales & Marketing") {
    return {
      eligible: false,
      reason: `Moltbook is restricted to Sales & Marketing agents; "${bot.name}" is in ${bot.department}.`,
    };
  }

  if (!MOLTBOOK_ELIGIBLE_AGENTS.has(bot.name)) {
    return {
      eligible: false,
      reason: `Agent "${bot.name}" is not on the Moltbook eligibility allowlist.`,
    };
  }

  return { eligible: true, bot };
}

/**
 * Eligibility for an agent to actually call a Moltbook write tool: agent
 * eligibility PLUS the explicit `moltbook_post` permission for the calling
 * client/bot.
 */
export async function checkMoltbookToolEligibility(
  clientId: number | undefined,
  botId: number | undefined,
): Promise<EligibilityResult> {
  const base = await checkAgentEligibility(botId);
  if (!base.eligible) return base;
  if (!clientId) return { eligible: false, reason: "No client context for Moltbook action." };

  const perm = await checkToolPermission(clientId, botId!, MOLTBOOK_POST_PERMISSION);
  if (!perm.allowed) {
    return {
      eligible: false,
      reason: `Agent "${base.bot?.name}" does not have the explicit ${MOLTBOOK_POST_PERMISSION} permission required for Moltbook.`,
      bot: base.bot,
    };
  }
  return base;
}

/**
 * Resolve the trusted owning client for a bot's Moltbook participation: the
 * client that has been explicitly granted the `moltbook_post` permission for
 * this bot. This is the governance context (permission + brand voice) used by
 * the unattended heartbeat, which has no request-scoped client context. Returns
 * `undefined` when no client holds the permission, so callers fail closed.
 */
export async function resolveMoltbookClientId(botId: number): Promise<number | undefined> {
  const [perm] = await db
    .select({ clientId: botToolPermissionsTable.clientId })
    .from(botToolPermissionsTable)
    .where(
      and(
        eq(botToolPermissionsTable.botId, botId),
        eq(botToolPermissionsTable.toolName, MOLTBOOK_POST_PERMISSION),
        eq(botToolPermissionsTable.allowed, true),
      ),
    )
    .orderBy(botToolPermissionsTable.clientId)
    .limit(1);
  return perm?.clientId;
}

export interface ResolvedAccount {
  account?: MoltbookAccount;
  error?: string;
}

/** Resolve the calling agent's active Moltbook identity; refuse if not active. */
export async function resolveActiveMoltbookAccount(botId: number | undefined): Promise<ResolvedAccount> {
  if (!botId) return { error: "No agent context for Moltbook action." };
  const [account] = await db
    .select()
    .from(moltbookAccountsTable)
    .where(eq(moltbookAccountsTable.botId, botId));
  if (!account) {
    return { error: "This agent is not connected to Moltbook. Register it first." };
  }
  if (account.status !== "active") {
    return {
      error: `This agent's Moltbook account is "${account.status}" (it must be claimed and active before it can act).`,
    };
  }
  if (!account.apiKeyEncrypted) {
    return { error: "This agent's Moltbook credential is missing." };
  }
  return { account };
}

/** Decrypt an account's api_key for handing to the Moltbook client. Never log this. */
export function getAccountApiKey(account: MoltbookAccount): string | null {
  if (!account.apiKeyEncrypted) return null;
  return decryptCredential(account.apiKeyEncrypted);
}

/** A view of an account that is safe to return over the API (no secret). */
export function toSafeAccount(account: MoltbookAccount) {
  return {
    id: account.id,
    botId: account.botId,
    agentName: account.agentName,
    claimUrl: account.claimUrl,
    verificationCode: account.verificationCode,
    status: account.status,
    autonomousMode: account.autonomousMode,
    lastHeartbeatAt: account.lastHeartbeatAt,
    hasCredential: Boolean(account.apiKeyEncrypted),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * Record a Moltbook action in the audit ledger and surface it in the activity
 * stream. Called for every public/network action (posts, comments, upvotes,
 * queued drafts, captured leads, heartbeats). Never receives the api_key.
 */
export async function recordMoltbookAction(params: {
  botId: number;
  accountId?: number;
  agentName?: string | null;
  clientId?: number | null;
  action: string;
  status: "sent" | "queued" | "blocked" | "skipped" | "failed" | "ok";
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAuditEntry({
      clientId: params.clientId ?? null,
      engine: "moltbook",
      decisionType: "outcome",
      payload: {
        source: "moltbook",
        action: params.action,
        status: params.status,
        botId: params.botId,
        accountId: params.accountId ?? null,
        agentName: params.agentName ?? null,
        ...(params.detail ?? {}),
      },
    });
  } catch (err) {
    console.error("[moltbook] audit write failed:", err instanceof Error ? err.message : String(err));
  }
  try {
    emitActivityEvent({
      clientId: params.clientId ?? 0,
      source: "galaxybots",
      eventType: `moltbook_${params.action}`,
      title: `Moltbook: ${params.action.replace(/_/g, " ")}`,
      description: `${params.agentName ?? `Agent #${params.botId}`} — Moltbook ${params.action.replace(/_/g, " ")} (${params.status})`,
      severity: params.status === "blocked" ? "warning" : "info",
      metadata: params.detail,
    });
  } catch {
    /* activity stream is best-effort */
  }
}

export interface RegisterAgentParams {
  botId: number;
  agentName: string;
  displayName?: string;
  bio?: string;
  xHandle?: string;
}

export interface RegisterAgentResult {
  success: boolean;
  error?: string;
  account?: ReturnType<typeof toSafeAccount>;
}

/**
 * Register an eligible agent on Moltbook and persist the returned credentials
 * (api_key encrypted). Surfaces the claim URL + verification code (via the safe
 * account view) so the owner can complete the X verification tweet.
 */
export async function registerMoltbookAgent(params: RegisterAgentParams): Promise<RegisterAgentResult> {
  const eligibility = await checkAgentEligibility(params.botId);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  const result = await moltbook.registerAgent({
    agentName: params.agentName,
    displayName: params.displayName,
    bio: params.bio,
    xHandle: params.xHandle,
  });
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const reg = result.data;
  const apiKeyEncrypted = encryptCredential(reg.apiKey);
  const status: "pending" | "active" | "disabled" = reg.status === "active" ? "active" : "pending";

  const [existing] = await db
    .select()
    .from(moltbookAccountsTable)
    .where(eq(moltbookAccountsTable.botId, params.botId));

  let account: MoltbookAccount;
  if (existing) {
    [account] = await db
      .update(moltbookAccountsTable)
      .set({
        agentName: params.agentName,
        apiKeyEncrypted,
        claimUrl: reg.claimUrl,
        verificationCode: reg.verificationCode,
        status,
      })
      .where(eq(moltbookAccountsTable.id, existing.id))
      .returning();
  } else {
    [account] = await db
      .insert(moltbookAccountsTable)
      .values({
        botId: params.botId,
        agentName: params.agentName,
        apiKeyEncrypted,
        claimUrl: reg.claimUrl,
        verificationCode: reg.verificationCode,
        status,
      })
      .returning();
  }

  return { success: true, account: toSafeAccount(account) };
}

/**
 * Refresh an account's claim status from Moltbook (pending → active once the
 * owner has posted the verification tweet).
 */
export async function refreshMoltbookClaimStatus(botId: number): Promise<RegisterAgentResult> {
  const { account, error } = await (async (): Promise<ResolvedAccount> => {
    const [acc] = await db
      .select()
      .from(moltbookAccountsTable)
      .where(eq(moltbookAccountsTable.botId, botId));
    if (!acc) return { error: "This agent is not connected to Moltbook." };
    return { account: acc };
  })();
  if (error || !account) return { success: false, error: error ?? "Account not found." };
  if (account.status === "disabled") {
    return { success: false, error: "This agent's Moltbook participation is disabled." };
  }

  const apiKey = getAccountApiKey(account);
  if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

  // A successful authenticated feed read confirms the claim is active.
  const feed = await moltbook.getFeed(apiKey, { limit: 1 });
  if (!feed.success) {
    return { success: true, account: toSafeAccount(account) };
  }

  if (account.status !== "active") {
    const [updated] = await db
      .update(moltbookAccountsTable)
      .set({ status: "active" })
      .where(eq(moltbookAccountsTable.id, account.id))
      .returning();
    return { success: true, account: toSafeAccount(updated) };
  }
  return { success: true, account: toSafeAccount(account) };
}

export interface OutboundGovernanceResult {
  blocked: boolean;
  reason?: string;
  body: string;
}

/**
 * Run an outbound draft body through the safety + governance gates:
 *  1. Refuse credential-exfiltration attempts (api_key may never leave Moltbook).
 *  2. Apply brand-voice guardrails (governance).
 *  3. Consult the consequence gate; block if predicted harm is high.
 */
export async function runOutboundGovernance(
  clientId: number | undefined,
  toolName: string,
  body: string,
): Promise<OutboundGovernanceResult> {
  const exfil = screenForCredentialExfiltration(body);
  if (exfil.flagged) {
    return { blocked: true, reason: exfil.reason, body };
  }

  let adjusted = body;
  if (clientId) {
    adjusted = await applyBrandVoiceGuardrails(clientId, body).catch(() => body);
  }

  const risk = await checkConsequenceRisk(toolName, clientId, "social_publish").catch(() => null);
  if (risk?.blocked) {
    return {
      blocked: true,
      reason: `Blocked by the consequence gate: ${risk.reason}`,
      body: adjusted,
    };
  }

  return { blocked: false, body: adjusted };
}

export interface QueueDraftParams {
  account: MoltbookAccount;
  botId: number;
  actionType: "post" | "comment";
  targetSubmolt?: string;
  targetThread?: string;
  body: string;
}

/** Write a post/comment draft to the approval queue (default approval mode). */
export async function queueMoltbookDraft(params: QueueDraftParams): Promise<MoltbookApproval> {
  const [draft] = await db
    .insert(moltbookApprovalQueueTable)
    .values({
      accountId: params.account.id,
      botId: params.botId,
      actionType: params.actionType,
      targetSubmolt: params.targetSubmolt ?? null,
      targetThread: params.targetThread ?? null,
      body: params.body,
      status: "pending",
    })
    .returning();
  await recordMoltbookAction({
    botId: params.botId,
    accountId: params.account.id,
    agentName: params.account.agentName,
    action: "draft_queued",
    status: "queued",
    detail: {
      draftId: draft.id,
      actionType: params.actionType,
      targetSubmolt: params.targetSubmolt ?? null,
      targetThread: params.targetThread ?? null,
    },
  });
  return draft;
}

export interface SendApprovedResult {
  success: boolean;
  error?: string;
  url?: string;
  externalId?: string;
}

/**
 * Send an approved (or autonomous) post/comment to Moltbook via the client.
 * Re-runs the outbound gates at send time so an edited/approved draft can't slip
 * past governance.
 */
export async function sendMoltbookAction(params: {
  account: MoltbookAccount;
  clientId?: number;
  actionType: "post" | "comment";
  targetSubmolt?: string | null;
  targetThread?: string | null;
  body: string;
}): Promise<SendApprovedResult> {
  const apiKey = getAccountApiKey(params.account);
  if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

  const toolName = params.actionType === "post" ? "moltbook_create_post" : "moltbook_comment";
  const gate = await runOutboundGovernance(params.clientId, toolName, params.body);
  if (gate.blocked) {
    await recordMoltbookAction({
      botId: params.account.botId,
      accountId: params.account.id,
      agentName: params.account.agentName,
      clientId: params.clientId ?? null,
      action: params.actionType === "post" ? "post" : "comment",
      status: "blocked",
      detail: { reason: gate.reason },
    });
    return { success: false, error: gate.reason };
  }

  if (params.actionType === "post") {
    if (!params.targetSubmolt) return { success: false, error: "A target submolt is required to post." };
    const res = await moltbook.createPost(apiKey, {
      submolt: params.targetSubmolt,
      title: (params.targetThread ?? "").slice(0, 300) || gate.body.slice(0, 120),
      body: gate.body,
    });
    if (!res.success) {
      await recordMoltbookAction({
        botId: params.account.botId,
        accountId: params.account.id,
        agentName: params.account.agentName,
        clientId: params.clientId ?? null,
        action: "post",
        status: "failed",
        detail: { submolt: params.targetSubmolt, error: res.error },
      });
      return { success: false, error: res.error };
    }
    await recordMoltbookAction({
      botId: params.account.botId,
      accountId: params.account.id,
      agentName: params.account.agentName,
      clientId: params.clientId ?? null,
      action: "post",
      status: "sent",
      detail: { submolt: params.targetSubmolt, url: res.data.url, externalId: res.data.id },
    });
    return { success: true, url: res.data.url, externalId: res.data.id };
  }

  if (!params.targetThread) return { success: false, error: "A target thread (post id) is required to comment." };
  const res = await moltbook.createComment(apiKey, {
    postId: params.targetThread,
    body: gate.body,
  });
  if (!res.success) {
    await recordMoltbookAction({
      botId: params.account.botId,
      accountId: params.account.id,
      agentName: params.account.agentName,
      clientId: params.clientId ?? null,
      action: "comment",
      status: "failed",
      detail: { postId: params.targetThread, error: res.error },
    });
    return { success: false, error: res.error };
  }
  await recordMoltbookAction({
    botId: params.account.botId,
    accountId: params.account.id,
    agentName: params.account.agentName,
    clientId: params.clientId ?? null,
    action: "comment",
    status: "sent",
    detail: { postId: params.targetThread, url: res.data.url, externalId: res.data.id },
  });
  return { success: true, url: res.data.url, externalId: res.data.id };
}

/** Approve (and send) a queued draft. Used by the owner approval routes. */
export async function approveAndSendDraft(params: {
  draftId: number;
  clientId?: number;
  decidedBy: string;
  editedBody?: string;
}): Promise<SendApprovedResult & { draft?: MoltbookApproval }> {
  const [draft] = await db
    .select()
    .from(moltbookApprovalQueueTable)
    .where(eq(moltbookApprovalQueueTable.id, params.draftId));
  if (!draft) return { success: false, error: "Draft not found." };
  if (draft.status !== "pending") {
    return { success: false, error: `Draft is already "${draft.status}".` };
  }

  const { account, error } = await resolveActiveMoltbookAccount(draft.botId);
  if (error || !account) return { success: false, error: error ?? "Account not active." };

  const body = params.editedBody?.trim() ? params.editedBody : draft.body;

  const sent = await sendMoltbookAction({
    account,
    clientId: params.clientId,
    actionType: draft.actionType,
    targetSubmolt: draft.targetSubmolt,
    targetThread: draft.targetThread,
    body,
  });
  if (!sent.success) {
    return { ...sent };
  }

  const [updated] = await db
    .update(moltbookApprovalQueueTable)
    .set({ status: "sent", body, decidedBy: params.decidedBy, decidedAt: new Date() })
    .where(eq(moltbookApprovalQueueTable.id, draft.id))
    .returning();
  return { ...sent, draft: updated };
}

/** Reject a queued draft. */
export async function rejectDraft(params: {
  draftId: number;
  decidedBy: string;
}): Promise<{ success: boolean; error?: string; draft?: MoltbookApproval }> {
  const [draft] = await db
    .select()
    .from(moltbookApprovalQueueTable)
    .where(eq(moltbookApprovalQueueTable.id, params.draftId));
  if (!draft) return { success: false, error: "Draft not found." };
  if (draft.status !== "pending") {
    return { success: false, error: `Draft is already "${draft.status}".` };
  }
  const [updated] = await db
    .update(moltbookApprovalQueueTable)
    .set({ status: "rejected", decidedBy: params.decidedBy, decidedAt: new Date() })
    .where(eq(moltbookApprovalQueueTable.id, draft.id))
    .returning();
  return { success: true, draft: updated };
}
