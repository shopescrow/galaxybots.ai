import { db } from "@workspace/db";
import { partnersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDefaultPartners(): Promise<void> {
  try {
    const [existing] = await db.select().from(partnersTable).where(eq(partnersTable.slug, "bingolingo"));
    if (!existing) {
      const passwordHash = await bcrypt.hash("bingolingo2026", 10);
      await db.insert(partnersTable).values({
        slug: "bingolingo",
        platformName: "BingoLingo.ai",
        logoUrl: null,
        primaryColor: null,
        welcomeMessage:
          "Welcome from BingoLingo.ai! As a BingoLingo user, you get exclusive access to GalaxyBots.ai — your Fortune 500 AI executive team. Deploy the same intelligence layer that powers billion-dollar decisions.",
        offer: "BingoLingo partners receive 30 days free on any plan. Your first month is on us.",
        adminPassword: passwordHash,
        isActive: true,
      });
      console.log("[seed] Default partner 'bingolingo' seeded.");
    } else {
      const isPlaintext = !existing.adminPassword.startsWith("$2");
      if (isPlaintext) {
        const passwordHash = await bcrypt.hash(existing.adminPassword, 10);
        await db.update(partnersTable).set({ adminPassword: passwordHash }).where(eq(partnersTable.slug, "bingolingo"));
        console.log("[seed] Migrated bingolingo partner password to hashed format.");
      }
    }
  } catch (err) {
    console.error("[seed] Partner seeding failed:", err);
  }
}
