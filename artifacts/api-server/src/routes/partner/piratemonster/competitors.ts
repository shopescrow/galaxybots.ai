import { Router, type IRouter } from "express";
import { db, aeoScoresTable, competitorUrlsTable, platformApiKeysTable, aeoScanRequestsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";

const router: IRouter = Router();

router.get("/integrations/piratemonster/competitors/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  if (!req.user?.bypassPayment && clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    const competitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    const [clientScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    if (competitors.length === 0) {
      res.json({ clientScore: clientScore ? clientScore.overallScore : null, competitors: [] });
      return;
    }

    const competitorUrls = competitors.map(c => c.url);
    const allScores = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        inArray(aeoScoresTable.sourceUrl, competitorUrls),
        eq(aeoScoresTable.scanType, "competitor")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt));

    const latestScoreByUrl = new Map<string, typeof allScores[0]>();
    for (const score of allScores) {
      if (!latestScoreByUrl.has(score.sourceUrl)) {
        latestScoreByUrl.set(score.sourceUrl, score);
      }
    }

    const results = competitors.map(comp => {
      const latestScore = latestScoreByUrl.get(comp.url);
      return {
        id: comp.id,
        companyName: comp.companyName,
        url: comp.url,
        addedBy: comp.addedBy,
        active: comp.active,
        createdAt: comp.createdAt.toISOString(),
        latestScore: latestScore ? {
          overallScore: latestScore.overallScore,
          citationCount: latestScore.citationCount,
          engineScores: latestScore.engineScores,
          scannedAt: latestScore.scannedAt.toISOString(),
        } : null,
        delta: latestScore && clientScore
          ? clientScore.overallScore - latestScore.overallScore
          : null,
      };
    });

    res.json({
      clientScore: clientScore ? clientScore.overallScore : null,
      competitors: results,
    });
  } catch (err) {
    console.error("Error fetching competitors:", err);
    res.status(500).json({ error: "Failed to fetch competitors" });
  }
});

router.post("/integrations/piratemonster/competitors/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }
  if (!req.user?.bypassPayment && clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { url: rawUrl, companyName } = req.body || {};
  if (!rawUrl || !companyName) {
    res.status(400).json({ error: "url and companyName are required" });
    return;
  }

  const trimmed = String(rawUrl).trim();
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    new URL(url);
  } catch {
    res.status(400).json({ error: "Invalid URL format" });
    return;
  }

  try {
    const activeCount = await db
      .select({ id: competitorUrlsTable.id })
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (activeCount.length >= 10) {
      res.status(400).json({ error: "Maximum of 10 active competitors per client" });
      return;
    }

    const existingUrl = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.url, url),
        eq(competitorUrlsTable.active, true)
      ));

    if (existingUrl.length > 0) {
      res.status(400).json({ error: "This URL is already being tracked" });
      return;
    }

    const [record] = await db.insert(competitorUrlsTable).values({
      clientId,
      url,
      companyName,
      addedBy: "dashboard",
    }).returning();

    const [partnerKey] = await db
      .select({ id: platformApiKeysTable.id })
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.clientId, clientId)
        )
      )
      .limit(1);

    if (partnerKey) {
      await db.insert(aeoScanRequestsTable).values({
        partnerKeyId: partnerKey.id,
        url,
        status: "queued",
      });
    }

    res.status(201).json(record);
  } catch (err) {
    console.error("Error tracking competitor:", err);
    res.status(500).json({ error: "Failed to track competitor" });
  }
});

router.post("/integrations/piratemonster/competitors/:clientId/:competitorId/untrack", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  const competitorId = Number(req.params.competitorId);

  if (isNaN(clientId) || isNaN(competitorId)) {
    res.status(400).json({ error: "Invalid IDs" });
    return;
  }

  try {
    const [updated] = await db
      .update(competitorUrlsTable)
      .set({ active: false })
      .where(and(
        eq(competitorUrlsTable.id, competitorId),
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Competitor not found or already inactive" });
      return;
    }

    res.json({ success: true, competitor: updated });
  } catch (err) {
    console.error("Error untracking competitor:", err);
    res.status(500).json({ error: "Failed to untrack competitor" });
  }
});

export default router;
