import { db, clientsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seedKiloPro() {
  const passwordHash = await bcrypt.hash("GalaxyBots2026!", 12);

  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.companyName, "KiloPro"));

    let clientId: number;

    if (existing.length > 0) {
      clientId = existing[0].id;
      console.log(`KiloPro client already exists (id=${clientId}), skipping client insert.`);
    } else {
      const [inserted] = await tx
        .insert(clientsTable)
        .values({
          companyName: "KiloPro",
          contactName: "KiloPro Admin",
          contactEmail: "admin@galaxybots.ai",
          plan: "enterprise",
          status: "active",
          websiteUrl: "https://kilopro.com",
          industry: "Cybersecurity & Compliance Services",
          servicesList: [
            "Compliance Auditing",
            "Security Assessments",
            "Penetration Testing",
            "Regulatory Advisory",
            "Data Privacy Consulting",
          ],
          targetMarket: "SMB and mid-market businesses across North America",
          businessContext:
            "KiloPro is a cybersecurity and compliance firm specializing in helping businesses meet regulatory standards and harden their security posture. As a reciprocal partner of GalaxyBots.ai, KiloPro provides ongoing compliance monitoring, security assessments, and regulatory advisory services to the GalaxyBots platform — ensuring the AI-powered operations remain audit-ready, secure, and fully compliant. The partnership is mutual: GalaxyBots manages KiloPro's AI-powered task automation, while KiloPro keeps GalaxyBots protected and compliant.",
        })
        .returning();
      clientId = inserted.id;
      console.log(`Inserted KiloPro client (id=${clientId}).`);
    }

    const existingUser = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, "admin@galaxybots.ai"));

    if (existingUser.length > 0) {
      const user = existingUser[0];
      await tx
        .update(usersTable)
        .set({ clientId, role: "owner", passwordHash, displayName: "KiloPro Admin" })
        .where(eq(usersTable.id, user.id));
      console.log(`Updated user admin@galaxybots.ai (id=${user.id}) to KiloPro client with owner role.`);
    } else {
      const [user] = await tx
        .insert(usersTable)
        .values({
          email: "admin@galaxybots.ai",
          passwordHash,
          clientId,
          role: "owner",
          displayName: "KiloPro Admin",
        })
        .returning();
      console.log(`Created user admin@galaxybots.ai (id=${user.id}) linked to KiloPro client.`);
    }
  });

  console.log("KiloPro seed complete.");
  process.exit(0);
}

seedKiloPro().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
