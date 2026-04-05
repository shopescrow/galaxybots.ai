import { Router, type IRouter } from "express";
import { db, aeoScoresTable, bingolingoClientsTable, bingolingoContentTable } from "@workspace/db";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";

const router: IRouter = Router();

router.get("/integrations/piratemonster/content-attribution/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const galaxybotsClientId = Number(req.params.clientId);
  if (isNaN(galaxybotsClientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  try {
    const blClients = await db
      .select()
      .from(bingolingoClientsTable)
      .where(eq(bingolingoClientsTable.galaxybotsClientId, galaxybotsClientId));

    if (blClients.length === 0) {
      res.json({ linked: false, content: [] });
      return;
    }

    const blClientIds = blClients.map(c => c.id);
    const publishedContent = await db
      .select()
      .from(bingolingoContentTable)
      .where(and(
        inArray(bingolingoContentTable.clientId, blClientIds),
        eq(bingolingoContentTable.status, "published"),
        isNotNull(bingolingoContentTable.publishedUrl)
      ))
      .orderBy(desc(bingolingoContentTable.publishedAt));

    if (publishedContent.length === 0) {
      res.json({
        linked: true,
        bingolingoClients: blClients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        content: [],
      });
      return;
    }

    const contentIds = publishedContent.map(c => c.id);
    const publishedUrls = publishedContent
      .map(c => c.publishedUrl)
      .filter((url): url is string => !!url);

    const [scoresByContentId, scoresByUrl] = await Promise.all([
      db
        .select()
        .from(aeoScoresTable)
        .where(inArray(aeoScoresTable.bingolingoContentId, contentIds))
        .orderBy(desc(aeoScoresTable.scannedAt)),
      publishedUrls.length > 0
        ? db
            .select()
            .from(aeoScoresTable)
            .where(inArray(aeoScoresTable.sourceUrl, publishedUrls))
            .orderBy(desc(aeoScoresTable.scannedAt))
        : Promise.resolve([]),
    ]);

    const contentIdScoresMap = new Map<number, typeof scoresByContentId>();
    for (const score of scoresByContentId) {
      if (score.bingolingoContentId != null) {
        const existing = contentIdScoresMap.get(score.bingolingoContentId) ?? [];
        existing.push(score);
        contentIdScoresMap.set(score.bingolingoContentId, existing);
      }
    }

    const urlScoresMap = new Map<string, typeof scoresByUrl>();
    for (const score of scoresByUrl) {
      const existing = urlScoresMap.get(score.sourceUrl) ?? [];
      existing.push(score);
      urlScoresMap.set(score.sourceUrl, existing);
    }

    const results = publishedContent.map(content => {
      let scores = contentIdScoresMap.get(content.id) ?? [];
      if (scores.length === 0 && content.publishedUrl) {
        scores = urlScoresMap.get(content.publishedUrl) ?? [];
      }

      if (scores.length === 0) {
        return {
          contentId: content.id,
          title: content.title,
          publishedUrl: content.publishedUrl,
          publishedAt: content.publishedAt,
          type: content.type,
          baselineScore: null,
          currentScore: null,
          delta: null,
          enginesGained: [] as string[],
          enginesLost: [] as string[],
          status: "awaiting_scan",
        };
      }

      const latest = scores[0];
      const baseline = scores[scores.length - 1];
      const baselineEngines = baseline.engineScores as Record<string, { score: number; cited: boolean }>;
      const latestEngines = latest.engineScores as Record<string, { score: number; cited: boolean }>;

      const enginesGained: string[] = [];
      const enginesLost: string[] = [];
      for (const [engine, data] of Object.entries(latestEngines)) {
        const prev = baselineEngines[engine];
        if (prev) {
          if (data.cited && !prev.cited) enginesGained.push(engine);
          if (!data.cited && prev.cited) enginesLost.push(engine);
        } else if (data.cited) {
          enginesGained.push(engine);
        }
      }

      return {
        contentId: content.id,
        title: content.title,
        publishedUrl: content.publishedUrl,
        publishedAt: content.publishedAt,
        type: content.type,
        baselineScore: baseline.overallScore,
        currentScore: latest.overallScore,
        delta: latest.overallScore - baseline.overallScore,
        enginesGained,
        enginesLost,
        status: "tracked",
      };
    });

    res.json({
      linked: true,
      bingolingoClients: blClients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
      content: results,
    });
  } catch (err) {
    console.error("Error fetching content attribution:", err);
    res.status(500).json({ error: "Failed to fetch content attribution" });
  }
});

router.get("/integrations/piratemonster/bingolingo-link/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const galaxybotsClientId = Number(req.params.clientId);
  if (isNaN(galaxybotsClientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  const blClients = await db
    .select()
    .from(bingolingoClientsTable)
    .where(eq(bingolingoClientsTable.galaxybotsClientId, galaxybotsClientId));

  res.json({
    linked: blClients.length > 0,
    bingolingoClients: blClients.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
  });
});

export default router;
