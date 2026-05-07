import { Router, type IRouter } from "express";
import { db, bingolingoClientsTable, bingolingoContentTable, aeoScoresTable } from "@workspace/db";
import { eq, and, desc, sql, count, isNotNull, inArray } from "drizzle-orm";
import { authenticate } from "../../middleware/auth";

const router: IRouter = Router();

router.get("/bingolingo/hub/:clientSlug", async (req, res): Promise<void> => {
  const { clientSlug } = req.params;
  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.slug, clientSlug));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const posts = await db
    .select()
    .from(bingolingoContentTable)
    .where(and(eq(bingolingoContentTable.clientId, client.id), eq(bingolingoContentTable.status, "published"), eq(bingolingoContentTable.type, "blog")))
    .orderBy(desc(bingolingoContentTable.publishedAt));

  res.json({ client, posts });
});

router.get("/bingolingo/hub/:clientSlug/:contentSlug", async (req, res): Promise<void> => {
  const { clientSlug, contentSlug } = req.params;
  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.slug, clientSlug));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [post] = await db
    .select()
    .from(bingolingoContentTable)
    .where(and(eq(bingolingoContentTable.clientId, client.id), eq(bingolingoContentTable.slug, contentSlug), eq(bingolingoContentTable.status, "published")));

  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  await db
    .update(bingolingoContentTable)
    .set({ viewCount: sql`${bingolingoContentTable.viewCount} + 1` })
    .where(eq(bingolingoContentTable.id, post.id));

  res.json({ client, post: { ...post, viewCount: post.viewCount + 1 } });
});

router.get("/bingolingo/content/:id/aeo-impact", authenticate, async (req, res): Promise<void> => {
  const contentId = Number(req.params.id);
  const [content] = await db.select().from(bingolingoContentTable).where(eq(bingolingoContentTable.id, contentId));
  if (!content) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  if (!content.publishedUrl) {
    res.json({ contentId, status: "no_url", baselineScore: null, currentScore: null, delta: null, engineBreakdown: null });
    return;
  }

  let scores = await db
    .select()
    .from(aeoScoresTable)
    .where(eq(aeoScoresTable.bingolingoContentId, contentId))
    .orderBy(desc(aeoScoresTable.scannedAt));

  if (scores.length === 0) {
    scores = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.sourceUrl, content.publishedUrl))
      .orderBy(desc(aeoScoresTable.scannedAt));
  }

  if (scores.length === 0) {
    res.json({ contentId, status: "awaiting_scan", baselineScore: null, currentScore: null, delta: null, engineBreakdown: null });
    return;
  }

  const latest = scores[0];
  const baseline = scores[scores.length - 1];
  const baselineEngines = baseline.engineScores as Record<string, { score: number; cited: boolean }>;
  const latestEngines = latest.engineScores as Record<string, { score: number; cited: boolean }>;

  const engineBreakdown: Record<string, { baselineCited: boolean; currentCited: boolean; baselineScore: number; currentScore: number }> = {};
  for (const [engine, data] of Object.entries(latestEngines)) {
    const prev = baselineEngines[engine];
    engineBreakdown[engine] = {
      baselineCited: prev?.cited ?? false,
      currentCited: data.cited,
      baselineScore: prev?.score ?? 0,
      currentScore: data.score,
    };
  }

  res.json({
    contentId,
    status: "tracked",
    baselineScore: baseline.overallScore,
    currentScore: latest.overallScore,
    delta: latest.overallScore - baseline.overallScore,
    engineBreakdown,
    scansCount: scores.length,
    lastScannedAt: latest.scannedAt,
  });
});

router.get("/bingolingo/clients/:id/content-attribution", authenticate, async (req, res): Promise<void> => {
  const bingolingoClientId = Number(req.params.id);
  const publishedContent = await db
    .select()
    .from(bingolingoContentTable)
    .where(and(
      eq(bingolingoContentTable.clientId, bingolingoClientId),
      eq(bingolingoContentTable.status, "published"),
      isNotNull(bingolingoContentTable.publishedUrl)
    ))
    .orderBy(desc(bingolingoContentTable.publishedAt));

  if (publishedContent.length === 0) {
    res.json([]);
    return;
  }

  const contentIds = publishedContent.map(c => c.id);
  const publishedUrls = publishedContent.map(c => c.publishedUrl).filter(Boolean) as string[];

  const allScoresByContentId = contentIds.length > 0
    ? await db
        .select()
        .from(aeoScoresTable)
        .where(inArray(aeoScoresTable.bingolingoContentId, contentIds))
        .orderBy(desc(aeoScoresTable.scannedAt))
    : [];

  const allScoresByUrl = publishedUrls.length > 0
    ? await db
        .select()
        .from(aeoScoresTable)
        .where(inArray(aeoScoresTable.sourceUrl, publishedUrls))
        .orderBy(desc(aeoScoresTable.scannedAt))
    : [];

  const scoresByContentId = new Map<number, typeof allScoresByContentId>();
  for (const score of allScoresByContentId) {
    if (score.bingolingoContentId != null) {
      const existing = scoresByContentId.get(score.bingolingoContentId) || [];
      existing.push(score);
      scoresByContentId.set(score.bingolingoContentId, existing);
    }
  }

  const scoresByUrl = new Map<string, typeof allScoresByUrl>();
  for (const score of allScoresByUrl) {
    const existing = scoresByUrl.get(score.sourceUrl) || [];
    existing.push(score);
    scoresByUrl.set(score.sourceUrl, existing);
  }

  for (const content of publishedContent) {
    if (!scoresByContentId.has(content.id) && content.publishedUrl) {
      const urlScores = scoresByUrl.get(content.publishedUrl);
      if (urlScores && urlScores.length > 0) {
        scoresByContentId.set(content.id, urlScores);
      }
    }
  }

  const results = publishedContent.map(content => {
    const scores = scoresByContentId.get(content.id) || [];

    if (scores.length === 0) {
      return {
        contentId: content.id,
        title: content.title,
        publishedUrl: content.publishedUrl,
        publishedAt: content.publishedAt,
        baselineScore: null,
        currentScore: null,
        delta: null,
        enginesGained: [],
        enginesLost: [],
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
      baselineScore: baseline.overallScore,
      currentScore: latest.overallScore,
      delta: latest.overallScore - baseline.overallScore,
      enginesGained,
      enginesLost,
      status: "tracked",
    };
  });

  res.json(results);
});

router.get("/bingolingo/dashboard-stats", authenticate, async (_req, res): Promise<void> => {
  try {
    const [clientCount] = await db.select({ value: count() }).from(bingolingoClientsTable);
    const [contentCount] = await db.select({ value: count() }).from(bingolingoContentTable);
    const [publishedCount] = await db.select({ value: count() }).from(bingolingoContentTable).where(eq(bingolingoContentTable.status, "published"));
    const [draftCount] = await db.select({ value: count() }).from(bingolingoContentTable).where(eq(bingolingoContentTable.status, "draft"));

    const [totalViews] = await db
      .select({ value: sql<number>`COALESCE(SUM(${bingolingoContentTable.viewCount}), 0)` })
      .from(bingolingoContentTable);

    const recentContent = await db
      .select()
      .from(bingolingoContentTable)
      .orderBy(desc(bingolingoContentTable.createdAt))
      .limit(5);

    res.json({
      clients: Number(clientCount.value),
      totalContent: Number(contentCount.value),
      published: Number(publishedCount.value),
      drafts: Number(draftCount.value),
      totalViews: Number(totalViews.value),
      recentContent,
    });
  } catch (error) {
    res.json({
      clients: 0,
      totalContent: 0,
      published: 0,
      drafts: 0,
      totalViews: 0,
      recentContent: [],
    });
  }
});

export default router;
