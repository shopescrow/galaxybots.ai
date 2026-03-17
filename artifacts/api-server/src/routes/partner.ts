import { Router } from "express";
import { db } from "@workspace/db";
import { partnerRegistrationsTable, clientsTable, partnersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "../middleware/auth";
import bcrypt from "bcryptjs";

const router = Router();

router.post("/partner", requireRole("owner", "admin"), async (req, res) => {
  try {
    const { slug, platformName, logoUrl, primaryColor, welcomeMessage, offer, adminPassword } = req.body;
    if (!slug || !platformName || !welcomeMessage || !adminPassword) {
      return res.status(400).json({ error: "slug, platformName, welcomeMessage, and adminPassword are required" });
    }
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const [partner] = await db.insert(partnersTable).values({
      slug: slug.toLowerCase().trim(),
      platformName,
      logoUrl: logoUrl || null,
      primaryColor: primaryColor || null,
      welcomeMessage,
      offer: offer || null,
      adminPassword: passwordHash,
      isActive: true,
    }).returning();
    res.status(201).json({
      ref: partner.slug,
      partnerName: partner.platformName,
      logoUrl: partner.logoUrl,
      primaryColor: partner.primaryColor,
      welcomeMessage: partner.welcomeMessage,
      offer: partner.offer,
      isActive: partner.isActive,
    });
  } catch (error: any) {
    if (error?.code === "23505") {
      return res.status(409).json({ error: "A partner with this slug already exists" });
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
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    res.json({
      ref: partner.slug,
      partnerName: partner.platformName,
      partnerLogo: partner.logoUrl,
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

    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, partnerRef.toLowerCase()));
    if (!partner || !partner.isActive) {
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
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    const valid = await bcrypt.compare(password, partner.adminPassword);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({
      ref: partner.slug,
      partnerName: partner.platformName,
      logoUrl: partner.logoUrl,
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
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    const clientsValid = await bcrypt.compare(adminPassword, partner.adminPassword);
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

router.put("/partner/:ref", async (req, res) => {
  try {
    const { ref } = req.params;
    const { adminPassword, platformName, logoUrl, primaryColor, welcomeMessage, offer } = req.body;
    if (!adminPassword) {
      return res.status(401).json({ error: "Admin password required" });
    }
    const [partner] = await db.select().from(partnersTable).where(eq(partnersTable.slug, ref.toLowerCase()));
    if (!partner || !partner.isActive) {
      return res.status(404).json({ error: "Partner not found" });
    }
    const updateValid = await bcrypt.compare(adminPassword, partner.adminPassword);
    if (!updateValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const updates: Partial<{ platformName: string; logoUrl: string | null; primaryColor: string | null; welcomeMessage: string; offer: string | null }> = {};
    if (platformName !== undefined) updates.platformName = platformName;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl || null;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor || null;
    if (welcomeMessage !== undefined) updates.welcomeMessage = welcomeMessage;
    if (offer !== undefined) updates.offer = offer || null;

    const [updated] = await db.update(partnersTable).set(updates).where(eq(partnersTable.slug, ref.toLowerCase())).returning();
    res.json({
      ref: updated.slug,
      partnerName: updated.platformName,
      logoUrl: updated.logoUrl,
      primaryColor: updated.primaryColor,
      welcomeMessage: updated.welcomeMessage,
      offer: updated.offer,
    });
  } catch (error) {
    console.error("Error updating partner branding:", error);
    res.status(500).json({ error: "Failed to update partner branding" });
  }
});

export default router;
