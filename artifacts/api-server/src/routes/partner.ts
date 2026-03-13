import { Router } from "express";
import { db } from "@workspace/db";
import { partnerRegistrationsTable, clientsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

const PARTNERS: Record<string, { partnerName: string; partnerLogo: string | null; welcomeMessage: string; offer: string | null; isActive: boolean }> = {
  bingolingo: {
    partnerName: "BingoLingo.ai",
    partnerLogo: null,
    welcomeMessage: "Welcome from BingoLingo.ai! As a BingoLingo user, you get exclusive access to GalaxyBots.ai — your Fortune 500 AI executive team. Deploy the same intelligence layer that powers billion-dollar decisions.",
    offer: "BingoLingo partners receive 30 days free on any plan. Your first month is on us.",
    isActive: true,
  },
};

router.get("/partner/link", async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref || typeof ref !== "string") {
      return res.status(400).json({ error: "Partner ref is required" });
    }
    const partner = PARTNERS[ref.toLowerCase()];
    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }
    res.json({ ref: ref.toLowerCase(), ...partner });
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

    const partner = PARTNERS[partnerRef.toLowerCase()];
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

router.get("/partner/referrals", async (req, res) => {
  try {
    const { partnerRef } = req.query;
    let referrals;
    if (partnerRef && typeof partnerRef === "string") {
      referrals = await db.select().from(partnerRegistrationsTable)
        .where(eq(partnerRegistrationsTable.partnerRef, partnerRef.toLowerCase()))
        .orderBy(desc(partnerRegistrationsTable.registeredAt));
    } else {
      referrals = await db.select().from(partnerRegistrationsTable)
        .orderBy(desc(partnerRegistrationsTable.registeredAt));
    }
    res.json(referrals);
  } catch (error) {
    console.error("Error fetching partner referrals:", error);
    res.status(500).json({ error: "Failed to fetch partner referrals" });
  }
});

export default router;
