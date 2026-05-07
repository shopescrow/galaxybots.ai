import {
  db,
  partnersTable,
  partnerRegistrationsTable,
  partnerTierReviewLogTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const PARTNER_TIER_THRESHOLDS = {
  authorized: { minClients: 5, minMonthlySpend: 200 },
  certified: { minClients: 15, minMonthlySpend: 500 },
  elite: { minClients: 50, minMonthlySpend: 2000 },
};

let lastPartnerTierReview: Date | null = null;

export async function checkPartnerTierCompliance() {
  const now = new Date();
  if (lastPartnerTierReview) {
    const daysSince = (now.getTime() - lastPartnerTierReview.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 28) return;
  }

  const partners = await db.select().from(partnersTable).where(eq(partnersTable.isActive, true));

  for (const partner of partners) {
    try {
      const referrals = await db
        .select()
        .from(partnerRegistrationsTable)
        .where(and(eq(partnerRegistrationsTable.partnerRef, partner.ref), eq(partnerRegistrationsTable.status, "active")));

      const activeCount = referrals.length;
      const tierKey = partner.tier as keyof typeof PARTNER_TIER_THRESHOLDS;
      const thresholds = PARTNER_TIER_THRESHOLDS[tierKey] ?? PARTNER_TIER_THRESHOLDS.authorized;

      const isBelowThreshold = activeCount < thresholds.minClients;
      const newConsecutive = isBelowThreshold ? partner.consecutiveMonthsBelowThreshold + 1 : 0;

      let action = "no_change";
      let newTier = partner.tier;

      if (isBelowThreshold && newConsecutive >= 2) {
        const tiers = ["elite", "certified", "authorized"];
        const currentIdx = tiers.indexOf(partner.tier);
        if (currentIdx < tiers.length - 1) {
          newTier = tiers[currentIdx + 1];
          action = "downgraded";
        }
      } else if (!isBelowThreshold) {
        action = "no_change";
      } else {
        action = "below_threshold_warning";
      }

      await db.insert(partnerTierReviewLogTable).values({
        partnerId: partner.id,
        partnerRef: partner.ref,
        activeClientCount: activeCount,
        monthlySpend: "0",
        tierAtReview: partner.tier,
        action,
        notes: isBelowThreshold
          ? `Active clients (${activeCount}) below minimum (${thresholds.minClients}) for ${newConsecutive} month(s)`
          : `Thresholds met with ${activeCount} active clients`,
      });

      await db
        .update(partnersTable)
        .set({
          tier: newTier,
          consecutiveMonthsBelowThreshold: newConsecutive,
          lastTierReviewAt: now,
        })
        .where(eq(partnersTable.id, partner.id));

      if (action === "downgraded") {
        console.log(`[scheduler] Partner ${partner.ref} downgraded from ${partner.tier} to ${newTier}`);
      }
    } catch (err) {
      console.error(`[scheduler] Error reviewing partner ${partner.ref}:`, err);
    }
  }

  lastPartnerTierReview = now;
  console.log(`[scheduler] Partner tier review complete for ${partners.length} partner(s)`);
}
