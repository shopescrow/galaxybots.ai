import {
  db,
  assetsTable,
  opportunitySignalsTable,
  botsTable,
} from "@workspace/db";
import { eq, and, inArray, lt, or, isNull } from "drizzle-orm";
import { createNotification } from "../../admin/notifications";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_DRAFT_MS = 14 * 24 * 60 * 60 * 1000;
const REVIEW_WAIT_MS = 3 * 24 * 60 * 60 * 1000;
const UNDERPERFORMER_MS = 30 * 24 * 60 * 60 * 1000;
const REVIEW_INTERVAL_MS = ONE_WEEK_MS;

let lastRun = 0;

type Candidate = {
  kind: "stale_draft" | "awaiting_review" | "underperformer";
  title: string;
  description: string;
  suggestedAction: string;
};

function classify(asset: typeof assetsTable.$inferSelect, now: number): Candidate | null {
  const updatedAge = now - new Date(asset.updatedAt).getTime();
  const revenue = Number(asset.revenueToDate) || 0;

  if ((asset.status === "idea" || asset.status === "draft") && updatedAge > STALE_DRAFT_MS) {
    return {
      kind: "stale_draft",
      title: `Stale draft: "${asset.title}"`,
      description: `This ${asset.type} asset has sat in "${asset.status}" for over two weeks with no progress.`,
      suggestedAction: "Resume production with the creator bot or archive it to keep the portfolio focused.",
    };
  }

  if (asset.status === "in_review" && updatedAge > REVIEW_WAIT_MS) {
    return {
      kind: "awaiting_review",
      title: `Awaiting approval: "${asset.title}"`,
      description: `This ${asset.type} asset has been waiting for review/approval for more than three days.`,
      suggestedAction: "Review and approve for publishing, or send it back to draft with feedback.",
    };
  }

  if (
    (asset.status === "published" || asset.status === "tracking") &&
    asset.publishedAt &&
    now - new Date(asset.publishedAt).getTime() > UNDERPERFORMER_MS &&
    revenue <= 0
  ) {
    return {
      kind: "underperformer",
      title: `Underperformer: "${asset.title}"`,
      description: `This ${asset.type} asset has been published for over a month with no recorded revenue.`,
      suggestedAction: "Iterate on the listing/niche, refresh the asset, or retire it and reallocate effort.",
    };
  }

  return null;
}

/**
 * Asset management cycle: manager bots periodically review the portfolio and
 * raise opportunity signals + pending approvals for stale drafts, items
 * awaiting review, and underperformers. Runs weekly. Per-asset dedup via
 * lastReviewedAt so the same asset isn't flagged repeatedly within the window.
 */
export async function runAssetManagementCycle(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < ONE_WEEK_MS) return;
  lastRun = now;

  const reviewCutoff = new Date(now - REVIEW_INTERVAL_MS);

  const candidates = await db
    .select()
    .from(assetsTable)
    .where(
      and(
        inArray(assetsTable.status, ["idea", "draft", "in_review", "published", "tracking"]),
        or(isNull(assetsTable.lastReviewedAt), lt(assetsTable.lastReviewedAt, reviewCutoff)),
      ),
    )
    .limit(500);

  if (candidates.length === 0) return;

  // Resolve a manager bot to attribute signals to (optional).
  const [managerBot] = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(eq(botsTable.name, "Asset Manager"))
    .limit(1);

  let raised = 0;

  for (const asset of candidates) {
    const candidate = classify(asset, now);
    if (!candidate) continue;

    try {
      const [signal] = await db
        .insert(opportunitySignalsTable)
        .values({
          clientId: asset.clientId,
          botId: managerBot?.id ?? asset.managerBotId ?? null,
          signalType: "optimization",
          title: candidate.title,
          description: candidate.description,
          suggestedAction: candidate.suggestedAction,
          evidenceChain: [
            `asset:${asset.id}`,
            `type:${asset.type}`,
            `status:${asset.status}`,
            `kind:${candidate.kind}`,
          ],
          status: "pending",
          expiresAt: new Date(now + 14 * 24 * 60 * 60 * 1000),
        })
        .returning();

      await db
        .update(assetsTable)
        .set({ lastReviewedAt: new Date(now) })
        .where(eq(assetsTable.id, asset.id));

      createNotification({
        clientId: asset.clientId,
        category: "bot",
        severity: candidate.kind === "underperformer" ? "warning" : "info",
        title: candidate.title,
        body: candidate.suggestedAction,
        link: `/asset-studio/${asset.id}`,
        metadata: { signalId: signal.id, assetId: asset.id, kind: candidate.kind },
        isScheduled: true,
      }).catch(() => {});

      raised++;
    } catch (err) {
      console.error(`[asset-lifecycle] Failed to flag asset ${asset.id}:`, err);
    }
  }

  if (raised > 0) {
    console.log(`[asset-lifecycle] Asset management cycle raised ${raised} signal(s).`);
  }
}
