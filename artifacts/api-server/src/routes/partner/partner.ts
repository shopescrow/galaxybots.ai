import { Router } from "express";
import { db } from "@workspace/db";
import { partnerRegistrationsTable, clientsTable, partnersTable, partnerApplicationsTable, partnerTierReviewLogTable } from "@workspace/db/schema";
import { eq, desc, and, count, gte } from "drizzle-orm";
import { requireRole } from "../../middleware/auth";
import bcrypt from "bcryptjs";

const router = Router();

router.post("/partner", requireRole("owner", "admin"), async (req, res) => {
  try {
    const { ref, partnerName, partnerLogo, primaryColor, welcomeMessage, offer, adminPassword } = req.body;
    if (!ref || !partnerName || !welcomeMessage || !adminPassword) {
      return res.status(400).json({ error: "ref, partnerName, welcomeMessage, and adminPassword are required" });
    }
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const [partner] = await db.insert(partnersTable).values({
      ref: ref.toLowerCase().trim(),
      partnerName,
      partnerLogo: partnerLogo || null,
      primaryColor: primaryColor || null,
      welcomeMessage,
      offer: offer || null,
      adminPasswordHash: passwordHash,
      isActive: true,
    }).returning();
    res.status(201).json({
      ref: partner.ref,
      partnerName: partner.partnerName,
      partnerLogo: partner.partnerLogo,
      primaryColor: partner.primaryColor,
      welcomeMessage: partner.welcomeMessage,
      offer: partner.offer,
      isActive: partner.isActive,
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "A partner with this ref already exists" });
    }
    console.error("Error creating partner:", error);
    res.status(500).json({ error: "Failed to create partner" });
  }
});

router.get("/partner/link", async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref || typeof ref !== "string") {
      return res.status(400).json({ error: "Partner ref is required" });
    }
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(and(eq(partnersTable.ref, ref.toLowerCase()), eq(partnersTable.isActive, true)));

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }
    res.json({
      ref: partner.ref,
      partnerName: partner.partnerName,
      partnerLogo: partner.partnerLogo,
      primaryColor: partner.primaryColor,
      welcomeMessage: partner.welcomeMessage,
      offer: partner.offer,
      isActive: partner.isActive,
    });
  } catch (error) {
    console.error("Error resolving partner link:", error);
    res.status(500).json({ error: "Failed to resolve partner link" });
  }
});

router.post("/partner/register", async (req, res) => {
  try {
    const { partnerRef, companyName, contactName, contactEmail, plan, source } = req.body;

    if (!partnerRef || !companyName || !contactName || !contactEmail || !plan) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(and(eq(partnersTable.ref, partnerRef.toLowerCase()), eq(partnersTable.isActive, true)));

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const [client] = await db.insert(clientsTable).values({
      companyName,
      contactName,
      contactEmail,
      plan,
      status: "trial",
    }).returning();

    const [registration] = await db.insert(partnerRegistrationsTable).values({
      partnerRef: partnerRef.toLowerCase(),
      clientId: client.id,
      companyName,
      contactName,
      contactEmail,
      plan,
      source: source || partnerRef,
      status: "active",
    }).returning();

    res.status(201).json(registration);
  } catch (error) {
    console.error("Error registering partner user:", error);
    res.status(500).json({ error: "Failed to register partner user" });
  }
});

router.get("/partner/referrals", requireRole("owner", "admin"), async (req, res) => {
  try {
    const referrals = await db.select().from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.clientId, req.user!.clientId))
      .orderBy(desc(partnerRegistrationsTable.registeredAt));
    res.json(referrals);
  } catch (error) {
    console.error("Error fetching partner referrals:", error);
    res.status(500).json({ error: "Failed to fetch partner referrals" });
  }
});

router.post("/partner/admin/login", async (req, res) => {
  try {
    const { ref, password } = req.body;
    if (!ref || !password) {
      return res.status(400).json({ error: "Partner ref and password are required" });
    }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.ref, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    if (!partner.adminPasswordHash) {
      return res.status(401).json({ error: "Partner admin not configured" });
    }
    const valid = await bcrypt.compare(password, partner.adminPasswordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({
      ref: partner.ref,
      partnerName: partner.partnerName,
      partnerLogo: partner.partnerLogo,
      primaryColor: partner.primaryColor,
      welcomeMessage: partner.welcomeMessage,
      offer: partner.offer,
    });
  } catch (error) {
    console.error("Error authenticating partner admin:", error);
    res.status(500).json({ error: "Failed to authenticate" });
  }
});

router.post("/partner/:ref/clients", async (req, res) => {
  try {
    const { ref } = req.params;
    const { adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(401).json({ error: "Admin password required" });
    }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.ref, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    if (!partner.adminPasswordHash) {
      return res.status(401).json({ error: "Partner admin not configured" });
    }
    const clientsValid = await bcrypt.compare(adminPassword, partner.adminPasswordHash);
    if (!clientsValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const clients = await db.select().from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.partnerRef, ref.toLowerCase()))
      .orderBy(desc(partnerRegistrationsTable.registeredAt));
    res.json(clients);
  } catch (error) {
    console.error("Error fetching partner clients:", error);
    res.status(500).json({ error: "Failed to fetch partner clients" });
  }
});

router.post("/partner/apply", async (req, res) => {
  try {
    const { companyName, contactName, contactEmail, currentClientCount, requestedTier, resellerAgreementAccepted } = req.body;

    if (!companyName || !contactName || !contactEmail) {
      return res.status(400).json({ error: "Missing required fields: companyName, contactName, contactEmail" });
    }

    if (!resellerAgreementAccepted) {
      return res.status(400).json({ error: "You must accept the reseller agreement to apply" });
    }

    const validTiers = ["authorized", "certified", "elite"];
    const tier = validTiers.includes(requestedTier) ? requestedTier : "authorized";

    const [application] = await db.insert(partnerApplicationsTable).values({
      companyName,
      contactName,
      contactEmail,
      currentClientCount: Number(currentClientCount) || 0,
      requestedTier: tier,
      resellerAgreementAccepted: true,
      status: "pending",
    }).returning();

    res.status(201).json({ success: true, applicationId: application.id, status: application.status });
  } catch (error) {
    console.error("Error submitting partner application:", error);
    res.status(500).json({ error: "Failed to submit partner application" });
  }
});

router.get("/partner/:ref/status", async (req, res) => {
  try {
    const { ref } = req.params;
    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.ref, ref.toLowerCase()));

    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const recentLogs = await db
      .select()
      .from(partnerTierReviewLogTable)
      .where(eq(partnerTierReviewLogTable.partnerRef, ref.toLowerCase()))
      .orderBy(desc(partnerTierReviewLogTable.reviewedAt))
      .limit(3);

    const referrals = await db
      .select({
        id: partnerRegistrationsTable.id,
        companyName: partnerRegistrationsTable.companyName,
        plan: partnerRegistrationsTable.plan,
        status: partnerRegistrationsTable.status,
        registeredAt: partnerRegistrationsTable.registeredAt,
      })
      .from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.partnerRef, ref.toLowerCase()))
      .orderBy(desc(partnerRegistrationsTable.registeredAt));

    const TIER_CONFIG = {
      authorized: { minClients: 5, minMonthlySpend: 200, discount: 40 },
      certified: { minClients: 15, minMonthlySpend: 500, discount: 60 },
      elite: { minClients: 50, minMonthlySpend: 2000, discount: 70 },
    };

    const tierConfig = TIER_CONFIG[partner.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.authorized;

    res.json({
      ref: partner.ref,
      tier: partner.tier,
      partnerName: partner.partnerName,
      wholesaleDiscount: partner.wholesaleDiscount,
      minClients: tierConfig.minClients,
      minMonthlySpend: tierConfig.minMonthlySpend,
      isActive: partner.isActive,
      consecutiveMonthsBelowThreshold: partner.consecutiveMonthsBelowThreshold,
      lastTierReviewAt: partner.lastTierReviewAt,
      activeClientCount: referrals.filter(r => r.status === "active").length,
      totalClients: referrals.length,
      recentLogs,
      referrals,
    });
  } catch (error) {
    console.error("Error fetching partner status:", error);
    res.status(500).json({ error: "Failed to fetch partner status" });
  }
});

router.put("/partner/:ref", async (req, res) => {
  try {
    const { ref } = req.params;
    const { password, adminPassword, partnerName, platformName, partnerLogo, logoUrl, primaryColor, welcomeMessage, offer } = req.body;

    const [partner] = await db
      .select()
      .from(partnersTable)
      .where(eq(partnersTable.ref, ref.toLowerCase()));

    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const providedPassword = password || adminPassword;
    if (partner.adminPasswordHash) {
      if (!providedPassword) {
        return res.status(401).json({ error: "Admin password required" });
      }
      const valid = await bcrypt.compare(providedPassword, partner.adminPasswordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid admin password" });
      }
    }

    const updateData: Record<string, unknown> = {};
    const resolvedName = partnerName || platformName;
    const resolvedLogo = partnerLogo || logoUrl;
    if (resolvedName) updateData.partnerName = resolvedName;
    if (welcomeMessage !== undefined) updateData.welcomeMessage = welcomeMessage;
    if (offer !== undefined) updateData.offer = offer || null;
    if (resolvedLogo !== undefined) updateData.partnerLogo = resolvedLogo || null;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor || null;

    const [updated] = await db
      .update(partnersTable)
      .set(updateData)
      .where(eq(partnersTable.ref, ref.toLowerCase()))
      .returning();

    res.json({
      ref: updated.ref,
      partnerName: updated.partnerName,
      partnerLogo: updated.partnerLogo,
      primaryColor: updated.primaryColor,
      welcomeMessage: updated.welcomeMessage,
      offer: updated.offer,
    });
  } catch (error) {
    console.error("Error updating partner:", error);
    res.status(500).json({ error: "Failed to update partner" });
  }
});

export default router;
