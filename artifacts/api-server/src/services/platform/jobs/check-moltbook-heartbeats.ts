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
import {
  detectInterestSignal,
  createMoltbookLead,
  MOLTBOOK_PRODUCT_CATALOG,
  type MoltbookCatalogEntry,
} from "../moltbook-bizdev";
import {
  analyzeCounterpartyStyle,
  pickOpeningAngle,
  generateMoltbookContent,
  detectInventedCommercialClaim,
} from "../moltbook-content";
import { sanitizeExternalContent } from "../../ai-safety/adversarial-sanitizer";
import { screenForInjection } from "../../ai-safety/prompt-injection";
import * as moltbook from "../../../tools/integrations/moltbook-client";

/** Don't re-run more often than this even if the scheduler ticks faster. */
const HEARTBEAT_MIN_INTERVAL_MS = 25 * 60 * 1000;
/** Max feed items inspected per account per run. */
const FEED_LIMIT = 20;
/** Max leads filed per account per run (back-pressure against chatty threads). */
const MAX_LEADS_PER_RUN = 3;
/** Minimum gap between an agent's own original (conversation-starter) posts. */
const ORIGINAL_POST_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

/**
 * True when the agent posted (or queued) an original thread within the cooldown.
 * Uses `lastOriginalPostAt` on the account so it covers BOTH the autonomous send
 * path (which writes no queue row) and the draft path — a single source of truth
 * that can't be bypassed by switching modes.
 */
function postedOriginalRecently(account: MoltbookAccount): boolean {
  if (!account.lastOriginalPostAt) return false;
  return Date.now() - new Date(account.lastOriginalPostAt).getTime() < ORIGINAL_POST_MIN_INTERVAL_MS;
}

/** Pick the most active submolt in the feed — the natural place to start a thread. */
function dominantSubmolt(items: SafeFeedItem[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.submolt) counts.set(item.submolt, (counts.get(item.submolt) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [submolt, count] of counts) {
    if (count > bestCount) {
      best = submolt;
      bestCount = count;
    }
  }
  return best;
}

const POST_PRODUCT_ROTATION = new Map<number, number>();

/** Rotate which product an agent leads with on original posts (or none). */
function nextPostProduct(botId: number): MoltbookCatalogEntry | null {
  // Lead with the two flagship products; occasionally post pure value (no product).
  const lineup: (MoltbookCatalogEntry | null)[] = [
    MOLTBOOK_PRODUCT_CATALOG.find((e) => e.productTag === "pirate_monster") ?? null,
    null,
    MOLTBOOK_PRODUCT_CATALOG.find((e) => e.productTag === "galaxybots") ?? null,
    null,
  ];
  const idx = POST_PRODUCT_ROTATION.get(botId) ?? 0;
  POST_PRODUCT_ROTATION.set(botId, (idx + 1) % lineup.length);
  return lineup[idx];
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

  // Persona is always present on an eligible account; guard keeps types honest.
  const persona = eligibility.bot;

  if (persona) {
    for (const item of engageCandidates) {
      if (await hasExistingDraftForThread(account.id, item.id)) continue;

      const signal = detectInterestSignal(`${item.title}\n${item.body}`);
      // Read the counterparty's voice so we can mirror it, then write the reply
      // in this agent's own persona with a freshly-rotated opening angle.
      const counterpartyStyle = analyzeCounterpartyStyle(`${item.title}\n${item.body}`);
      const generated = await generateMoltbookContent({
        mode: "comment",
        persona,
        product: signal?.catalog ?? null,
        angle: pickOpeningAngle(`${account.botId}:comment`),
        submolt: item.submolt ?? null,
        thread: { title: item.title, body: item.body, authorHandle: item.authorHandle },
        counterpartyStyle,
      });
      const body = generated.body;

      // Deterministic backstop before the governance gates: never publish an
      // invented price/guarantee even if the model drifted.
      const claim = detectInventedCommercialClaim(body);
      if (claim) {
        await recordMoltbookAction({
          botId: account.botId,
          accountId: account.id,
          agentName: account.agentName,
          clientId: clientId ?? null,
          action: "comment",
          status: "blocked",
          detail: { reason: claim, targetThread: item.id },
        });
        continue;
      }

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
  }

  // ---- Conversation starter: occasionally open an original thread ----------
  // Agents aren't just responders — a top creator seeds discussion. Rate-limited
  // to one original post per ORIGINAL_POST_MIN_INTERVAL, posted to the feed's
  // most active submolt, and run through the SAME governance + approval path.
  let postedOriginal = false;
  const targetSubmolt = dominantSubmolt(safeItems);
  if (persona && targetSubmolt && !postedOriginalRecently(account)) {
    const product = nextPostProduct(account.botId);
    const generated = await generateMoltbookContent({
      mode: "post",
      persona,
      product,
      angle: pickOpeningAngle(`${account.botId}:post`),
      submolt: targetSubmolt,
    });
    const rawTitle = (generated.title ?? "").trim();
    if (rawTitle && generated.body) {
      // Govern title and body INDEPENDENTLY so the final published title is
      // brand-voice + consequence + exfil checked (the send path only re-checks
      // the body), then apply the deterministic claim backstop to both.
      const titleGate = await runOutboundGovernance(clientId, "moltbook_create_post", rawTitle);
      const bodyGate = await runOutboundGovernance(clientId, "moltbook_create_post", generated.body);
      const claim = detectInventedCommercialClaim(`${titleGate.body}\n${bodyGate.body}`);

      if (titleGate.blocked || bodyGate.blocked || claim) {
        await recordMoltbookAction({
          botId: account.botId,
          accountId: account.id,
          agentName: account.agentName,
          clientId: clientId ?? null,
          action: "post",
          status: "blocked",
          detail: { reason: claim ?? titleGate.reason ?? bodyGate.reason, targetSubmolt },
        });
      } else {
        const finalTitle = (titleGate.body || rawTitle).trim().slice(0, 120);
        if (account.autonomousMode) {
          const sent = await sendMoltbookAction({
            account,
            clientId,
            actionType: "post",
            targetSubmolt,
            targetThread: finalTitle,
            body: bodyGate.body,
          });
          postedOriginal = sent.success;
        } else {
          await queueMoltbookDraft({
            account,
            botId: account.botId,
            actionType: "post",
            targetSubmolt,
            targetThread: finalTitle,
            body: bodyGate.body,
          });
          postedOriginal = true;
        }
      }
    }
  }

  await db
    .update(moltbookAccountsTable)
    .set({
      lastHeartbeatAt: new Date(),
      // Stamp the cooldown only when an original post was actually sent/queued.
      ...(postedOriginal ? { lastOriginalPostAt: new Date() } : {}),
    })
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
      postedOriginal,
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
