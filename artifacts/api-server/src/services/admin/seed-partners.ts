import { db } from "@workspace/db";
import { partnersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDefaultPartners(): Promise<void> {
  try {
    const [existing] = await db.select().from(partnersTable).where(eq(partnersTable.ref, "bingolingo"));
    if (!existing) {
      const rawPassword = process.env.BINGOLINGO_PARTNER_ADMIN_PASSWORD;
      if (!rawPassword) {
        console.warn(
          "[seed] BINGOLINGO_PARTNER_ADMIN_PASSWORD is not set — " +
          "seeding 'bingolingo' partner without an admin password. " +
          "Set the env var and restart to enable the partner admin portal.",
        );
      }
      const adminPasswordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
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
        adminPasswordHash,
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

      // Detect and rotate the known-default credential.  If the stored hash
      // matches "bingolingo2026" (the old hardcoded password), it is a
      // publicly-known secret that must not remain valid.  Replace it with a
      // hash of the operator-supplied env var, or nullify it so the admin
      // portal is disabled until a real password is configured.
      if (existing.adminPasswordHash) {
        const isKnownDefault = await bcrypt.compare("bingolingo2026", existing.adminPasswordHash);
        if (isKnownDefault) {
          const rawPassword = process.env.BINGOLINGO_PARTNER_ADMIN_PASSWORD;
          const newHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
          await db
            .update(partnersTable)
            .set({ adminPasswordHash: newHash })
            .where(eq(partnersTable.ref, "bingolingo"));
          if (newHash) {
            console.log("[seed] Rotated bingolingo partner admin password from known default to env-supplied value.");
          } else {
            console.warn(
              "[seed] Removed known-default bingolingo partner admin credential. " +
              "Set BINGOLINGO_PARTNER_ADMIN_PASSWORD and restart to re-enable the partner admin portal.",
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[seed] Partner seeding failed:", err);
  }
}
