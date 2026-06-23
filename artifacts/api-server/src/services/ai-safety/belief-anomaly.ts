import {
  db,
  botBeliefsTable,
  pendingBeliefUpdatesTable,
} from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { createNotification } from "../admin/notifications.js";

const ANOMALY_DELTA_THRESHOLD = 0.20;
const CORROBORATION_WINDOW_DAYS = 14;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface BeliefUpdateProposal {
  botId: number;
  clientId?: number;
  existingBeliefId?: number;
  proposedBeliefText: string;
  proposedConfidence: number;
  currentConfidence: number;
  triggerSource: string;
}

export interface BeliefUpdateResult {
  applied: boolean;
  held: boolean;
  pendingUpdateId?: number;
  reason: string;
}

export async function proposeBeliefUpdate(
  proposal: BeliefUpdateProposal,
): Promise<BeliefUpdateResult> {
  const delta = Math.abs(proposal.proposedConfidence - proposal.currentConfidence);

  if (delta > ANOMALY_DELTA_THRESHOLD) {
    const expiresAt = new Date(
      Date.now() + CORROBORATION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [pending] = await db
      .insert(pendingBeliefUpdatesTable)
      .values({
        botId: proposal.botId,
        clientId: proposal.clientId ?? null,
        existingBeliefId: proposal.existingBeliefId ?? null,
        proposedBeliefText: proposal.proposedBeliefText,
        proposedConfidence: proposal.proposedConfidence,
        currentConfidence: proposal.currentConfidence,
        confidenceDelta: delta,
        triggerSource: proposal.triggerSource,
        corroborationCount: 0,
        status: "pending",
        expiresAt,
      })
      .returning({ id: pendingBeliefUpdatesTable.id });

    if (proposal.clientId) {
      await createNotification({
        clientId: proposal.clientId,
        category: "bot",
        severity: "warning",
        title: "Belief Anomaly Detected",
        body: `A belief update for bot ${proposal.botId} would shift confidence by ${(delta * 100).toFixed(0)}% (above the 20% threshold). Awaiting corroboration before applying.`,
        metadata: {
          botId: proposal.botId,
          pendingUpdateId: pending?.id,
          delta,
          proposedBeliefText: proposal.proposedBeliefText.slice(0, 200),
        },
      }).catch(() => {});
    }

    return {
      applied: false,
      held: true,
      pendingUpdateId: pending?.id,
      reason: `Confidence delta ${(delta * 100).toFixed(0)}% exceeds 20% threshold — held for corroboration`,
    };
  }

  if (proposal.existingBeliefId) {
    await db
      .update(botBeliefsTable)
      .set({
        confidence: proposal.proposedConfidence,
        beliefText: proposal.proposedBeliefText,
        lastConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(botBeliefsTable.id, proposal.existingBeliefId));
  }

  return {
    applied: true,
    held: false,
    reason: "Delta within threshold, applied immediately",
  };
}

export async function corroboratePendingUpdate(
  pendingUpdateId: number,
): Promise<void> {
  const [update] = await db
    .select()
    .from(pendingBeliefUpdatesTable)
    .where(
      and(
        eq(pendingBeliefUpdatesTable.id, pendingUpdateId),
        eq(pendingBeliefUpdatesTable.status, "pending"),
      ),
    )
    .limit(1);

  if (!update) return;

  const newCount = update.corroborationCount + 1;

  if (newCount >= 1) {
    if (update.existingBeliefId) {
      await db
        .update(botBeliefsTable)
        .set({
          confidence: update.proposedConfidence,
          beliefText: update.proposedBeliefText,
          lastConfirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(botBeliefsTable.id, update.existingBeliefId));
    } else {
      await db.insert(botBeliefsTable).values({
        botId: update.botId,
        clientId: update.clientId ?? undefined,
        beliefText: update.proposedBeliefText,
        confidence: update.proposedConfidence,
        evidenceCount: 2,
        lastConfirmedAt: new Date(),
        category: "operational",
        halfLifeDays: 30,
        immutable: false,
      });
    }

    await db
      .update(pendingBeliefUpdatesTable)
      .set({ status: "applied", appliedAt: new Date(), corroborationCount: newCount })
      .where(eq(pendingBeliefUpdatesTable.id, pendingUpdateId));
  } else {
    await db
      .update(pendingBeliefUpdatesTable)
      .set({ corroborationCount: newCount })
      .where(eq(pendingBeliefUpdatesTable.id, pendingUpdateId));
  }
}

export async function checkStaleBeliefUpdates(): Promise<void> {
  try {
    const now = new Date();

    const stale = await db
      .select({
        id: pendingBeliefUpdatesTable.id,
        botId: pendingBeliefUpdatesTable.botId,
        clientId: pendingBeliefUpdatesTable.clientId,
      })
      .from(pendingBeliefUpdatesTable)
      .where(
        and(
          eq(pendingBeliefUpdatesTable.status, "pending"),
          lt(pendingBeliefUpdatesTable.expiresAt, now),
        ),
      );

    for (const update of stale) {
      await db
        .update(pendingBeliefUpdatesTable)
        .set({
          status: "soft_rejected",
          rejectedAt: now,
          reviewNote: "No corroboration received within 14 days",
        })
        .where(eq(pendingBeliefUpdatesTable.id, update.id));

      if (update.clientId) {
        await createNotification({
          clientId: update.clientId,
          category: "bot",
          severity: "info",
          title: "Belief Update Expired",
          body: `A held belief update for bot ${update.botId} expired without corroboration and was soft-rejected.`,
          metadata: { pendingUpdateId: update.id, botId: update.botId },
        }).catch(() => {});
      }
    }

    if (stale.length > 0) {
      console.log(`[belief-anomaly] Soft-rejected ${stale.length} stale pending belief updates`);
    }
  } catch (err) {
    console.error("[belief-anomaly] checkStaleBeliefUpdates error:", errMsg(err));
  }
}
