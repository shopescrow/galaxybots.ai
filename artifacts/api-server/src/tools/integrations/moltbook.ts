/**
 * Governed Moltbook agent tools (Task #207, Phase 1 — steps 4–6).
 *
 * Registers Moltbook actions as governed tools the agentic loop can call. Every
 * tool:
 *  - resolves the calling agent's Moltbook identity from storage and refuses if
 *    the agent is not eligible (first-party Sales & Marketing allowlist + the
 *    explicit `moltbook_post` permission) or the account is not active;
 *  - runs inbound Moltbook content through the adversarial sanitizer +
 *    prompt-injection screen before returning it (feed reads);
 *  - runs outbound posts/comments through governance + the consequence gate +
 *    a credential-exfiltration refusal, and (by default) writes them to the
 *    approval queue instead of sending — autonomous-mode accounts send directly.
 *    Upvotes and feed reads bypass the queue.
 */

import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import {
  checkMoltbookToolEligibility,
  resolveActiveMoltbookAccount,
  getAccountApiKey,
  runOutboundGovernance,
  queueMoltbookDraft,
  sendMoltbookAction,
  recordMoltbookAction,
} from "../../services/platform/moltbook-service";
import { sanitizeExternalContent } from "../../services/ai-safety/adversarial-sanitizer";
import { screenForInjection } from "../../services/ai-safety/prompt-injection";
import * as moltbook from "./moltbook-client";

async function ensureActiveEligible(context: ToolContext) {
  const eligibility = await checkMoltbookToolEligibility(context.clientId, context.botId);
  if (!eligibility.eligible) {
    return { error: eligibility.reason ?? "Agent is not eligible for Moltbook." };
  }
  const resolved = await resolveActiveMoltbookAccount(context.botId);
  if (resolved.error || !resolved.account) {
    return { error: resolved.error ?? "No active Moltbook account." };
  }
  return { account: resolved.account };
}

registerTool({
  name: "moltbook_read_feed",
  description:
    "Read the connected agent's Moltbook feed (optionally scoped to a submolt). Inbound content is sanitized for safety before being returned. Read-only — bypasses the approval queue.",
  inputSchema: z.object({
    submolt: z.string().optional().describe("Limit the feed to a specific submolt"),
    limit: z.number().optional().describe("Max number of items (default 20)"),
  }),
  execute: async (input: { submolt?: string; limit?: number }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };

    const apiKey = getAccountApiKey(gate.account);
    if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

    const feed = await moltbook.getFeed(apiKey, { submolt: input.submolt, limit: input.limit ?? 20 });
    if (!feed.success) return { success: false, error: feed.error };

    const items = await Promise.all(
      feed.data.items.map(async (item) => {
        const raw = `${item.title ?? ""}\n${item.body ?? ""}`.trim();
        let safeBody = item.body ?? "";
        let safeTitle = item.title ?? "";
        let quarantined = false;
        if (raw) {
          const injection = screenForInjection(raw);
          const sanitized = await sanitizeExternalContent(raw, "moltbook_feed", {
            botId: context.botId,
            clientId: context.clientId,
            sessionId: context.sessionId,
          });
          if (!sanitized.safe || injection.action === "reject") {
            quarantined = true;
            safeBody = "[CONTENT QUARANTINED: flagged as potentially adversarial]";
            safeTitle = item.title ? "[quarantined]" : "";
          } else if (sanitized.disposition === "sanitized" || injection.action === "wrap") {
            // Untrusted content was modified/flagged. Sanitize BOTH fields so a
            // raw, unsanitized title can never slip past the screen.
            safeBody = sanitized.sanitizedContent;
            safeTitle = item.title
              ? (
                  await sanitizeExternalContent(item.title, "moltbook_feed", {
                    botId: context.botId,
                    clientId: context.clientId,
                    sessionId: context.sessionId,
                  })
                ).sanitizedContent
              : "";
          }
        }
        return {
          id: item.id,
          submolt: item.submolt,
          authorHandle: item.authorHandle ?? item.authorAgent,
          title: safeTitle,
          body: safeBody,
          score: item.score,
          commentCount: item.commentCount,
          url: item.url,
          quarantined,
        };
      }),
    );

    return { success: true, items, nextCursor: feed.data.nextCursor };
  },
});

registerTool({
  name: "moltbook_create_post",
  description:
    "Create a post in a Moltbook submolt as the connected agent. By default the draft is written to the owner approval queue and only sent after approval; autonomous-mode agents post directly. Passes brand-voice + consequence gates.",
  inputSchema: z.object({
    submolt: z.string().describe("The submolt to post in"),
    title: z.string().describe("Post title"),
    body: z.string().describe("Post body"),
  }),
  execute: async (input: { submolt: string; title: string; body: string }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };
    const account = gate.account;

    const governance = await runOutboundGovernance(context.clientId, "moltbook_create_post", `${input.title}\n${input.body}`);
    if (governance.blocked) return { success: false, error: governance.reason };

    if (account.autonomousMode) {
      const sent = await sendMoltbookAction({
        account,
        clientId: context.clientId,
        actionType: "post",
        targetSubmolt: input.submolt,
        targetThread: input.title,
        body: input.body,
      });
      if (!sent.success) return { success: false, error: sent.error };
      return { success: true, sent: true, url: sent.url, id: sent.externalId, message: "Post published to Moltbook (autonomous mode)." };
    }

    const draft = await queueMoltbookDraft({
      account,
      botId: context.botId!,
      actionType: "post",
      targetSubmolt: input.submolt,
      targetThread: input.title,
      body: input.body,
    });
    return {
      success: true,
      queued: true,
      draftId: draft.id,
      message: `Post draft #${draft.id} queued for owner approval.`,
    };
  },
});

registerTool({
  name: "moltbook_comment",
  description:
    "Comment on a Moltbook post as the connected agent. By default the draft is written to the owner approval queue and only sent after approval; autonomous-mode agents comment directly. Passes brand-voice + consequence gates.",
  inputSchema: z.object({
    postId: z.string().describe("The post/thread id to comment on"),
    body: z.string().describe("Comment body"),
  }),
  execute: async (input: { postId: string; body: string }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };
    const account = gate.account;

    const governance = await runOutboundGovernance(context.clientId, "moltbook_comment", input.body);
    if (governance.blocked) return { success: false, error: governance.reason };

    if (account.autonomousMode) {
      const sent = await sendMoltbookAction({
        account,
        clientId: context.clientId,
        actionType: "comment",
        targetThread: input.postId,
        body: input.body,
      });
      if (!sent.success) return { success: false, error: sent.error };
      return { success: true, sent: true, url: sent.url, id: sent.externalId, message: "Comment published to Moltbook (autonomous mode)." };
    }

    const draft = await queueMoltbookDraft({
      account,
      botId: context.botId!,
      actionType: "comment",
      targetThread: input.postId,
      body: input.body,
    });
    return {
      success: true,
      queued: true,
      draftId: draft.id,
      message: `Comment draft #${draft.id} queued for owner approval.`,
    };
  },
});

registerTool({
  name: "moltbook_upvote",
  description:
    "Upvote a Moltbook post or comment as the connected agent. Upvotes carry no public content and bypass the approval queue.",
  inputSchema: z.object({
    targetType: z.enum(["post", "comment"]).describe("Whether the target is a post or a comment"),
    targetId: z.string().describe("The id of the post or comment to upvote"),
  }),
  execute: async (input: { targetType: "post" | "comment"; targetId: string }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };

    const apiKey = getAccountApiKey(gate.account);
    if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

    const res = await moltbook.upvote(apiKey, { targetType: input.targetType, targetId: input.targetId });
    if (!res.success) return { success: false, error: res.error };
    await recordMoltbookAction({
      botId: gate.account.botId,
      accountId: gate.account.id,
      agentName: gate.account.agentName,
      clientId: context.clientId ?? null,
      action: "upvote",
      status: "sent",
      detail: { targetType: input.targetType, targetId: input.targetId, score: res.data.score },
    });
    return { success: true, score: res.data.score, message: `Upvoted ${input.targetType} ${input.targetId}.` };
  },
});

registerTool({
  name: "moltbook_create_submolt",
  description:
    "Create a new Moltbook submolt (community) as the connected agent. The description passes brand-voice + consequence gates.",
  inputSchema: z.object({
    name: z.string().describe("URL-safe submolt name (e.g. 'ai-agents')"),
    title: z.string().optional().describe("Display title"),
    description: z.string().optional().describe("Submolt description"),
  }),
  execute: async (input: { name: string; title?: string; description?: string }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };

    if (input.description) {
      const governance = await runOutboundGovernance(context.clientId, "moltbook_create_submolt", input.description);
      if (governance.blocked) return { success: false, error: governance.reason };
      input.description = governance.body;
    }

    const apiKey = getAccountApiKey(gate.account);
    if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

    const res = await moltbook.createSubmolt(apiKey, {
      name: input.name,
      title: input.title,
      description: input.description,
    });
    if (!res.success) return { success: false, error: res.error };
    await recordMoltbookAction({
      botId: gate.account.botId,
      accountId: gate.account.id,
      agentName: gate.account.agentName,
      clientId: context.clientId ?? null,
      action: "create_submolt",
      status: "sent",
      detail: { submolt: res.data.name, url: res.data.url },
    });
    return { success: true, submolt: res.data.name, url: res.data.url, message: `Created submolt "${res.data.name}".` };
  },
});

registerTool({
  name: "moltbook_join_submolt",
  description: "Join an existing Moltbook submolt (community) as the connected agent.",
  inputSchema: z.object({
    name: z.string().describe("The submolt name to join"),
  }),
  execute: async (input: { name: string }, context: ToolContext) => {
    const gate = await ensureActiveEligible(context);
    if ("error" in gate) return { success: false, error: gate.error };

    const apiKey = getAccountApiKey(gate.account);
    if (!apiKey) return { success: false, error: "Missing Moltbook credential." };

    const res = await moltbook.joinSubmolt(apiKey, { name: input.name });
    if (!res.success) return { success: false, error: res.error };
    await recordMoltbookAction({
      botId: gate.account.botId,
      accountId: gate.account.id,
      agentName: gate.account.agentName,
      clientId: context.clientId ?? null,
      action: "join_submolt",
      status: "sent",
      detail: { submolt: input.name, joined: res.data.joined },
    });
    return { success: true, joined: res.data.joined, message: `Joined submolt "${input.name}".` };
  },
});
