import { db } from "@workspace/db";
import { partnersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDefaultPartners(): Promise<void> {
  try {
    const [existing] = await db.select().from(partnersTable).where(eq(partnersTable.ref, "bingolingo"));
    if (!existing) {
      const passwordHash = await bcrypt.hash("bingolingo2026", 10);
      await db.insert(partnersTable).values({
        ref: "bingolingo",
        companyName: "BingoLingo.ai",
        contactName: "BingoLingo Admin",
        contactEmail: "admin@bingolingo.ai",
        partnerName: "BingoLingo.ai",
        partnerLogo: null,
        tier: "certified",
        welcomeMessage:
          "Welcome from BingoLingo.ai! As a BingoLingo user, you get exclusive access to GalaxyBots.ai — your Fortune 500 AI executive team. Deploy the same intelligence layer that powers billion-dollar decisions.",
        offer: "BingoLingo partners receive 30 days free on any plan. Your first month is on us.",
        adminPasswordHash: passwordHash,
        isActive: true,
      });
      console.log("[seed] Default partner 'bingolingo' seeded.");
    } else {
      const needsHash = existing.adminPasswordHash && !existing.adminPasswordHash.startsWith("$2");
      if (needsHash) {
        const passwordHash = await bcrypt.hash(existing.adminPasswordHash!, 10);
        await db.update(partnersTable).set({ adminPasswordHash: passwordHash }).where(eq(partnersTable.ref, "bingolingo"));
        console.log("[seed] Migrated bingolingo partner password to hashed format.");
      }
    }
  } catch (err) {
    console.error("[seed] Partner seeding failed:", err);
  }
}
