/**
 * Moltbook heartbeat scheduler job (Task #207, Phase 1 step 9 + Phase 2 step 11).
 *
 * Runs on a ~30-minute cadence. For each ACTIVE Moltbook agent it:
 *   1. Honours the owner kill-switch — only `status = "active"` accounts run
 *      (disabling an account via the owner routes immediately halts activity).
 *   2. Reads the agent's feed and sanitizes inbound content (adversarial /
 *      prompt-injection screening) before reasoning over it.
 *   3. Uses the stored last-check state (`lastHeartbeatAt`) to only consider
 *      items newer than the previous run, avoiding duplicate engagement.
 *   4. Decides whether to engage. In approval mode (the default) it produces a
 *      DRAFT in the owner approval queue — it never posts directly. Autonomous
 *      agents may publish through the same governed send path.
 *   5. Phase 2: when a genuine interest signal is detected it files a
 *      product-tagged lead in the existing prospecting Review Queue. It NEVER
 *      closes a deal or takes payment autonomously.
 *
 * Every action is recorded in the audit ledger and surfaced on the activity
 * stream via `recordMoltbookAction`.
 */

import { db, moltbookAccountsTable, moltbookApprovalQueueTable, type MoltbookAccount } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  checkMoltbookToolEligibility,
  resolveMoltbookClientId,
  getAccountApiKey,
  runOutboundGovernance,
  queueMoltbookDraft,
  sendMoltbookAction,
  recordMoltbookAction,
} from "../moltbook-service";
import { detectInterestSignal, createMoltbookLead } from "../moltbook-bizdev";
import { sanitizeExternalContent } from "../../ai-safety/adversarial-sanitizer";
import { screenForInjection } from "../../ai-safety/prompt-injection";
import * as moltbook from "../../../tools/integrations/moltbook-client";

/** Don't re-run more often than this even if the scheduler ticks faster. */
const HEARTBEAT_MIN_INTERVAL_MS = 25 * 60 * 1000;
/** Max feed items inspected per account per run. */
const FEED_LIMIT = 20;
/** Max leads filed per account per run (back-pressure against chatty threads). */
const MAX_LEADS_PER_RUN = 3;

let lastRunAt = 0;
let running = false;

interface SafeFeedItem {
  id: string;
  submolt?: string;
  authorHandle?: string;
  title: string;
  body: string;
  url?: string;
  score?: number;
  createdAt?: string;
  quarantined: boolean;
}

/** Sanitize a single feed item the same way the read-feed tool does. */
async function sanitizeItem(item: moltbook.MoltbookFeedItem): Promise<SafeFeedItem> {
  const raw = `${item.title ?? ""}\n${item.body ?? ""}`.trim();
  let safeBody = item.body ?? "";
  let safeTitle = item.title ?? "";
  let quarantined = false;
  if (raw) {
    const injection = screenForInjection(raw);
    const sanitized = await sanitizeExternalContent(raw, "moltbook_feed", {});
    if (!sanitized.safe || injection.action === "reject") {
      quarantined = true;
      safeBody = "";
      safeTitle = "";
    } else if (sanitized.disposition === "sanitized" || injection.action === "wrap") {
      // Untrusted content was modified/flagged. Sanitize BOTH fields so a raw,
      // unsanitized title can never slip into downstream reasoning.
      safeBody = sanitized.sanitizedContent;
      safeTitle = item.title
        ? (await sanitizeExternalContent(item.title, "moltbook_feed", {})).sanitizedContent
        : "";
    }
  }
  return {
    id: item.id,
    submolt: item.submolt,
    authorHandle: item.authorHandle ?? item.authorAgent,
    title: safeTitle,
    body: safeBody,
    url: item.url,
    score: item.score,
    createdAt: item.createdAt,
    quarantined,
  };
}

/** Build a brand-safe, value-first engagement comment for a feed item. */
function buildEngagementBody(item: SafeFeedItem, pitch?: string): string {
  const topic = item.title ? `"${item.title.slice(0, 120)}"` : "this";
  const opener = `Great thread on ${topic} — we've run into the same thing.`;
  const value = pitch
    ? ` ${pitch} Happy to share what's worked for us if it's useful.`
    : " Happy to share what's worked for us if it's useful.";
  return `${opener}${value}`.slice(0, 1000);
}

/** Returns true when a draft/post for this thread already exists for the account. */
async function hasExistingDraftForThread(accountId: number, targetThread: string): Promise<boolean> {
  const existing = await db
    .select({ id: moltbookApprovalQueueTable.id })
    .from(moltbookApprovalQueueTable)
    .where(
      and(
        eq(moltbookApprovalQueueTable.accountId, accountId),
        eq(moltbookApprovalQueueTable.targetThread, targetThread),
      ),
    )
    .limit(1);
  return existing.length > 0;
}

async function runAccountHeartbeat(account: MoltbookAccount): Promise<void> {
  // Resolve the trusted owning client (the one explicitly granted moltbook_post)
  // so the heartbeat runs the SAME permission + brand-voice gates as the tool
  // path. No client → no permission → not eligible (fail closed).
  const clientId = await resolveMoltbookClientId(account.botId);

  // Only eligible first-party Sales & Marketing agents WITH the explicit
  // moltbook_post permission engage / capture leads.
  const eligibility = await checkMoltbookToolEligibility(clientId, account.botId);
  if (!eligibility.eligible) {
    await db
      .update(moltbookAccountsTable)
      .set({ lastHeartbeatAt: new Date() })
      .where(eq(moltbookAccountsTable.id, account.id));
    return;
  }

  const apiKey = getAccountApiKey(account);
  if (!apiKey) {
    await recordMoltbookAction({
      botId: account.botId,
      accountId: account.id,
      agentName: account.agentName,
      clientId: clientId ?? null,
      action: "heartbeat",
      status: "skipped",
      detail: { reason: "missing_credential" },
    });
    return;
  }

  const feed = await moltbook.getFeed(apiKey, { limit: FEED_LIMIT });
  if (!feed.success) {
    await recordMoltbookAction({
      botId: account.botId,
      accountId: account.id,
      agentName: account.agentName,
      clientId: clientId ?? null,
      action: "heartbeat",
      status: "skipped",
      detail: { reason: "feed_unavailable", error: feed.error },
    });
    return;
  }

  const since = account.lastHeartbeatAt ? new Date(account.lastHeartbeatAt).getTime() : 0;
  const firstRun = since === 0;

  // Only consider items newer than the last check (dedupe). On the first run we
  // limit to the most recent handful to avoid back-filling the whole feed.
  const candidates = feed.data.items.filter((item) => {
    if (!item.createdAt) return firstRun;
    const t = Date.parse(item.createdAt);
    return Number.isNaN(t) ? firstRun : t > since;
  });
  const newItems = firstRun ? candidates.slice(0, 5) : candidates;

  const safeItems = (await Promise.all(newItems.map(sanitizeItem))).filter((i) => !i.quarantined);

  // ---- Phase 2: capture product-tagged leads on interest signals -----------
  let leadsFiled = 0;
  for (const item of safeItems) {
    if (leadsFiled >= MAX_LEADS_PER_RUN) break;
    const signal = detectInterestSignal(`${item.title}\n${item.body}`);
    if (!signal || !item.authorHandle) continue;

    const lead = await createMoltbookLead({
      botId: account.botId,
      counterpartyHandle: item.authorHandle,
      contextUrl: item.url ?? null,
      expressedNeed: signal.expressedNeed,
      productTag: signal.productTag,
    });
    if (lead.created) {
      leadsFiled += 1;
      await recordMoltbookAction({
        botId: account.botId,
        accountId: account.id,
        agentName: account.agentName,
        clientId: clientId ?? null,
        action: "lead_captured",
        status: "ok",
        detail: {
          prospectId: lead.prospectId,
          productTag: signal.productTag,
          counterpartyHandle: item.authorHandle,
          contextUrl: item.url ?? null,
        },
      });
    }
  }

  // ---- Phase 1: decide whether to engage (one target per run) --------------
  let engaged = false;
  const engageCandidates = safeItems
    .filter((i) => i.id && (i.body || i.title))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const item of engageCandidates) {
    if (await hasExistingDraftForThread(account.id, item.id)) continue;

    const signal = detectInterestSignal(`${item.title}\n${item.body}`);
    const body = buildEngagementBody(item, signal?.catalog.pitch);

    const gate = await runOutboundGovernance(clientId, "moltbook_comment", body);
    if (gate.blocked) {
      await recordMoltbookAction({
        botId: account.botId,
        accountId: account.id,
        agentName: account.agentName,
        clientId: clientId ?? null,
        action: "comment",
        status: "blocked",
        detail: { reason: gate.reason, targetThread: item.id },
      });
      continue;
    }

    if (account.autonomousMode) {
      const sent = await sendMoltbookAction({
        account,
        clientId,
        actionType: "comment",
        targetThread: item.id,
        body: gate.body,
      });
      engaged = sent.success;
    } else {
      await queueMoltbookDraft({
        account,
        botId: account.botId,
        actionType: "comment",
        targetThread: item.id,
        body: gate.body,
      });
      engaged = true;
    }
    if (engaged) break;
  }

  await db
    .update(moltbookAccountsTable)
    .set({ lastHeartbeatAt: new Date() })
    .where(eq(moltbookAccountsTable.id, account.id));

  await recordMoltbookAction({
    botId: account.botId,
    accountId: account.id,
    agentName: account.agentName,
    clientId: clientId ?? null,
    action: "heartbeat",
    status: "ok",
    detail: {
      itemsConsidered: safeItems.length,
      leadsFiled,
      engaged,
      autonomousMode: account.autonomousMode,
    },
  });
}

/**
 * Scheduler entry point. Iterates every active Moltbook agent and runs its
 * heartbeat. Safe to call on every scheduler tick — it self-throttles to the
 * ~30-minute cadence and guards against overlapping runs.
 */
export async function checkMoltbookHeartbeats(): Promise<void> {
  const now = Date.now();
  if (running) return;
  if (now - lastRunAt < HEARTBEAT_MIN_INTERVAL_MS) return;
  running = true;
  lastRunAt = now;

  try {
    const accounts = await db
      .select()
      .from(moltbookAccountsTable)
      .where(eq(moltbookAccountsTable.status, "active"));

    for (const account of accounts) {
      try {
        await runAccountHeartbeat(account);
      } catch (err) {
        console.error(
          `[moltbook-heartbeat] account ${account.id} (${account.agentName}) failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } finally {
    running = false;
  }
}
