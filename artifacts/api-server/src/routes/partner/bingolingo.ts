import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, bingolingoClientsTable, bingolingoContentTable, bingolingoApiKeysTable, aeoScoresTable, aeoScanRequestsTable, platformApiKeysTable } from "@workspace/db";
import { eq, and, desc, sql, count, isNotNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
import { authenticate, requireRole } from "../../middleware/auth";

interface BingoLingoApiKeyRequest extends Request {
  bingolingoClientId?: number;
}

const router: IRouter = Router();

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateApiKey(): string {
  return `blk_${randomBytes(24).toString("base64url")}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers["x-bingolingo-key"] as string | undefined;
  if (!key) {
    res.status(401).json({ error: "Missing X-BingoLingo-Key header" });
    return;
  }
  const hashed = hashKey(key);
  const [apiKey] = await db
    .select()
    .from(bingolingoApiKeysTable)
    .where(and(eq(bingolingoApiKeysTable.keyHash, hashed), eq(bingolingoApiKeysTable.status, "active")));
  if (!apiKey) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }
  const blReq = req as BingoLingoApiKeyRequest;
  blReq.bingolingoClientId = apiKey.clientId;
  next();
}

const CONTENT_TYPES = ["blog", "linkedin", "twitter", "email", "press_release", "case_study"] as const;
const TONES = ["professional", "conversational", "thought_leadership", "educational", "bold"] as const;

function getSystemPrompt(contentType: string): string {
  const prompts: Record<string, string> = {
    blog: `You are an expert SEO content writer. Generate a well-structured blog post with:
- An engaging H1 title
- A compelling meta description (150-160 characters)
- Clear H2/H3 subheadings
- SEO-optimized content with natural keyword integration
- A strong conclusion with a call to action
Return the content in markdown format.`,
    linkedin: `You are a LinkedIn content strategist. Generate a professional LinkedIn article/post with:
- An attention-grabbing opening hook
- Professional but engaging tone
- Strategic use of line breaks for readability
- Relevant hashtags at the end
- A call to engagement (question or prompt)
Return the content in plain text format optimized for LinkedIn.`,
    twitter: `You are a Twitter/X thread strategist. Generate a compelling thread with:
- A hook tweet that drives curiosity
- 5-8 tweets that tell a story or share insights
- Each tweet under 280 characters
- A closing tweet with a call to action
Format each tweet on its own line, prefixed with the tweet number (1/, 2/, etc).`,
    email: `You are an email marketing expert. Generate a newsletter email with:
- A compelling subject line (marked as SUBJECT:)
- A preview text (marked as PREVIEW:)
- An engaging greeting
- Well-structured body content
- A clear call to action
- A professional sign-off
Return in markdown format with SUBJECT: and PREVIEW: headers.`,
    press_release: `You are a PR communications specialist. Generate a press release with:
- A headline in AP style
- A dateline
- A strong lead paragraph (who, what, when, where, why)
- Supporting body paragraphs with quotes
- A boilerplate company description
- Contact information placeholder
Return in standard press release format.`,
    case_study: `You are a B2B content strategist. Generate a case study with:
- Client name/industry context
- The challenge/problem faced
- The solution implemented
- Measurable results and outcomes
- Key takeaways
- A testimonial quote placeholder
Return in markdown format with clear sections.`,
  };
  return prompts[contentType] || prompts.blog;
}

router.post("/bingolingo/clients", authenticate, async (req, res): Promise<void> => {
  const { name, industry, website, logoUrl, tagline, galaxybotsClientId } = req.body;
  if (!name || !industry) {
    res.status(400).json({ error: "name and industry are required" });
    return;
  }
  const slug = slugify(name);
  const [existing] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.slug, slug));
  if (existing) {
    res.status(409).json({ error: "A client with this name already exists" });
    return;
  }
  const [client] = await db
    .insert(bingolingoClientsTable)
    .values({
      name,
      slug,
      industry,
      website: website ?? null,
      logoUrl: logoUrl ?? null,
      tagline: tagline ?? null,
      galaxybotsClientId: galaxybotsClientId ?? null,
    })
    .returning();

  const rawKey = generateApiKey();
  const keyH = hashKey(rawKey);
  await db.insert(bingolingoApiKeysTable).values({
    clientId: client.id,
    keyHash: keyH,
    label: "Default API Key",
  });

  res.status(201).json({ client, apiKey: rawKey });
});

router.get("/bingolingo/clients", authenticate, async (_req, res): Promise<void> => {
  const clients = await db
    .select({
      client: bingolingoClientsTable,
      contentCount: count(bingolingoContentTable.id),
    })
    .from(bingolingoClientsTable)
    .leftJoin(bingolingoContentTable, eq(bingolingoClientsTable.id, bingolingoContentTable.clientId))
    .groupBy(bingolingoClientsTable.id)
    .orderBy(desc(bingolingoClientsTable.createdAt));

  const result = await Promise.all(
    clients.map(async (c) => {
      const [latest] = await db
        .select({ publishedAt: bingolingoContentTable.publishedAt })
        .from(bingolingoContentTable)
        .where(and(eq(bingolingoContentTable.clientId, c.client.id), eq(bingolingoContentTable.status, "published")))
        .orderBy(desc(bingolingoContentTable.publishedAt))
        .limit(1);
      return {
        ...c.client,
        contentCount: Number(c.contentCount),
        lastPublishedAt: latest?.publishedAt ?? null,
      };
    })
  );
  res.json(result);
});

router.get("/bingolingo/clients/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

router.put("/bingolingo/clients/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { name, industry, website, logoUrl, tagline, autoContentEnabled, defaultTone } = req.body;
  const [updated] = await db
    .update(bingolingoClientsTable)
    .set({
      ...(name !== undefined && { name }),
      ...(industry !== undefined && { industry }),
      ...(website !== undefined && { website }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(tagline !== undefined && { tagline }),
      ...(autoContentEnabled !== undefined && { autoContentEnabled }),
      ...(defaultTone !== undefined && { defaultTone }),
    })
    .where(eq(bingolingoClientsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(updated);
});

router.post("/bingolingo/clients/:id/api-keys", authenticate, async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  const { label } = req.body;
  const rawKey = generateApiKey();
  const keyH = hashKey(rawKey);
  const [apiKey] = await db
    .insert(bingolingoApiKeysTable)
    .values({ clientId, keyHash: keyH, label: label ?? null })
    .returning();
  res.status(201).json({ ...apiKey, key: rawKey });
});

router.get("/bingolingo/clients/:id/api-keys", authenticate, async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  const keys = await db
    .select({ id: bingolingoApiKeysTable.id, label: bingolingoApiKeysTable.label, status: bingolingoApiKeysTable.status, createdAt: bingolingoApiKeysTable.createdAt, revokedAt: bingolingoApiKeysTable.revokedAt })
    .from(bingolingoApiKeysTable)
    .where(eq(bingolingoApiKeysTable.clientId, clientId))
    .orderBy(desc(bingolingoApiKeysTable.createdAt));
  res.json(keys);
});

router.post("/bingolingo/api-keys/:id/revoke", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [revoked] = await db
    .update(bingolingoApiKeysTable)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(bingolingoApiKeysTable.id, id))
    .returning();
  if (!revoked) {
    res.status(404).json({ error: "API key not found" });
    return;
  }
  res.json({ success: true });
});

router.post("/bingolingo/generate", authenticateApiKey, async (req, res): Promise<void> => {
  const clientId = (req as BingoLingoApiKeyRequest).bingolingoClientId as number;
  const { contentType, topic, tone, keywords } = req.body;

  if (!contentType || !topic) {
    res.status(400).json({ error: "contentType and topic are required" });
    return;
  }

  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const systemPrompt = getSystemPrompt(contentType);
  const useTone = tone || client.defaultTone || "professional";
  const keywordList = keywords && Array.isArray(keywords) ? keywords.join(", ") : "";

  const userPrompt = `Industry: ${client.industry}
Company: ${client.name}
Topic: ${topic}
Tone: ${useTone}
${keywordList ? `Keywords to incorporate: ${keywordList}` : ""}

Generate the content now.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume BingoLingo content generation, cost-efficient
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const body = completion.choices[0]?.message?.content ?? "";

    const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
    const suggestedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : topic;
    const suggestedSlug = slugify(suggestedTitle);

    const metaMatch = body.match(/meta description[:\s]*(.{50,160})/i);
    const metaDescription = metaMatch ? metaMatch[1].trim() : body.slice(0, 155).trim() + "...";

    res.json({
      title: suggestedTitle,
      slug: suggestedSlug,
      body,
      metaDescription,
      contentType,
      topic,
      tone: useTone,
      keywords: keywords ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Content generation failed" });
  }
});

router.get("/bingolingo/clients/by-galaxybots/:galaxybotsClientId", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const gbClientId = Number(req.params.galaxybotsClientId);
  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.galaxybotsClientId, gbClientId));
  if (!client) {
    res.status(404).json({ error: "No BingoLingo client linked to this GalaxyBots client" });
    return;
  }
  const [contentCount] = await db.select({ value: count() }).from(bingolingoContentTable).where(eq(bingolingoContentTable.clientId, client.id));
  const [latestContent] = await db
    .select()
    .from(bingolingoContentTable)
    .where(eq(bingolingoContentTable.clientId, client.id))
    .orderBy(desc(bingolingoContentTable.createdAt))
    .limit(1);
  res.json({
    ...client,
    contentCount: Number(contentCount.value),
    latestContent: latestContent ?? null,
  });
});

router.post("/bingolingo/generate-internal", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { clientId, contentType, topic, tone, keywords } = req.body;

  if (!clientId || !contentType || !topic) {
    res.status(400).json({ error: "clientId, contentType, and topic are required" });
    return;
  }

  if (!CONTENT_TYPES.includes(contentType)) {
    res.status(400).json({ error: `Invalid contentType. Must be one of: ${CONTENT_TYPES.join(", ")}` });
    return;
  }

  if (tone && !TONES.includes(tone)) {
    res.status(400).json({ error: `Invalid tone. Must be one of: ${TONES.join(", ")}` });
    return;
  }

  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, Number(clientId)));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const systemPrompt = getSystemPrompt(contentType);
  const useTone = tone || client.defaultTone || "professional";
  const keywordList = keywords && Array.isArray(keywords) ? keywords.join(", ") : "";

  const userPrompt = `Industry: ${client.industry}
Company: ${client.name}
Topic: ${topic}
Tone: ${useTone}
${keywordList ? `Keywords to incorporate: ${keywordList}` : ""}

Generate the content now.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume BingoLingo content generation, cost-efficient
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const body = completion.choices[0]?.message?.content ?? "";
    const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
    const suggestedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : topic;
    const suggestedSlug = slugify(suggestedTitle);
    const metaDescription = body.slice(0, 155).trim() + "...";

    res.json({
      title: suggestedTitle,
      slug: suggestedSlug,
      body,
      metaDescription,
      contentType,
      topic,
      tone: useTone,
      keywords: keywords ?? [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Content generation failed" });
  }
});

router.post("/bingolingo/content", authenticate, async (req, res): Promise<void> => {
  const { clientId, type, title, slug: contentSlug, body, metaDescription, topic, tone, keywords, status } = req.body;
  if (!clientId || !type || !title || !body) {
    res.status(400).json({ error: "clientId, type, title, and body are required" });
    return;
  }
  const finalSlug = contentSlug || slugify(title);
  const [content] = await db
    .insert(bingolingoContentTable)
    .values({
      clientId: Number(clientId),
      type,
      title,
      slug: finalSlug,
      body,
      metaDescription: metaDescription ?? null,
      status: status ?? "draft",
      topic: topic ?? null,
      tone: tone ?? null,
      keywords: keywords ?? null,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning();
  res.status(201).json(content);
});

router.get("/bingolingo/content", authenticate, async (req, res): Promise<void> => {
  const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
  const status = req.query.status as string | undefined;

  let query = db.select().from(bingolingoContentTable).$dynamic();

  const conditions = [];
  if (clientId) conditions.push(eq(bingolingoContentTable.clientId, clientId));
  if (status) conditions.push(eq(bingolingoContentTable.status, status));

  if (conditions.length === 1) {
    query = query.where(conditions[0]) as typeof query;
  } else if (conditions.length > 1) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const content = await query.orderBy(desc(bingolingoContentTable.createdAt));
  res.json(content);
});

router.get("/bingolingo/content/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [content] = await db.select().from(bingolingoContentTable).where(eq(bingolingoContentTable.id, id));
  if (!content) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(content);
});

router.put("/bingolingo/content/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { title, body, metaDescription, status, topic, tone, keywords, publishedUrl } = req.body;

  const [existing] = await db.select().from(bingolingoContentTable).where(eq(bingolingoContentTable.id, id));

  const updateData: Partial<typeof bingolingoContentTable.$inferInsert> = {};
  if (title !== undefined) updateData.title = title;
  if (body !== undefined) updateData.body = body;
  if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
  if (topic !== undefined) updateData.topic = topic;
  if (tone !== undefined) updateData.tone = tone;
  if (keywords !== undefined) updateData.keywords = keywords;
  if (publishedUrl !== undefined) {
    if (publishedUrl !== null && publishedUrl !== "") {
      try { const u = new URL(publishedUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); } catch { res.status(400).json({ error: "publishedUrl must be a valid http/https URL" }); return; }
    }
    updateData.publishedUrl = publishedUrl || null;
  }
  if (status !== undefined) {
    updateData.status = status;
    if (status === "published") {
      updateData.publishedAt = new Date();
    }
  }

  const [updated] = await db
    .update(bingolingoContentTable)
    .set(updateData)
    .where(eq(bingolingoContentTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  const wasJustPublished = status === "published" && existing?.status !== "published";
  if (wasJustPublished && updated.publishedUrl) {
    queueAeoScanForContent(updated.id, updated.publishedUrl, updated.clientId).catch(() => {});
  }

  res.json(updated);
});

async function queueAeoScanForContent(contentId: number, publishedUrl: string, bingolingoClientId: number) {
  try {
    const [blClient] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, bingolingoClientId));
    const galaxybotsClientId = blClient?.galaxybotsClientId ?? null;

    const [partnerKey] = await db
      .select()
      .from(platformApiKeysTable)
      .where(and(eq(platformApiKeysTable.platform, "piratemonster_mcp"), eq(platformApiKeysTable.status, "active")))
      .limit(1);

    if (!partnerKey) {
      console.log("[BL] No active PirateMonster MCP key found, skipping AEO scan queue");
      return;
    }

    await db.insert(aeoScanRequestsTable).values({
      partnerKeyId: partnerKey.id,
      url: publishedUrl,
      status: "queued",
    });

    console.log(`[BL] Queued AEO scan for content #${contentId}: ${publishedUrl}`);
  } catch (err) {
    console.error("[BL] Error queuing AEO scan for content:", err);
  }
}

router.post("/bingolingo/content/:id/publish", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { publishedUrl } = req.body || {};

  const setData: Partial<typeof bingolingoContentTable.$inferInsert> = { status: "published", publishedAt: new Date() };
  if (publishedUrl) {
    try { const u = new URL(publishedUrl); if (!["http:", "https:"].includes(u.protocol)) throw new Error(); } catch { res.status(400).json({ error: "publishedUrl must be a valid http/https URL" }); return; }
    setData.publishedUrl = publishedUrl;
  }

  const [updated] = await db
    .update(bingolingoContentTable)
    .set(setData)
    .where(eq(bingolingoContentTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  if (updated.publishedUrl) {
    queueAeoScanForContent(updated.id, updated.publishedUrl, updated.clientId).catch(() => {});
  }

  res.json(updated);
});

router.post("/bingolingo/content/:id/archive", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [updated] = await db
    .update(bingolingoContentTable)
    .set({ status: "archived" })
    .where(eq(bingolingoContentTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(updated);
});

router.delete("/bingolingo/content/:id", authenticate, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(bingolingoContentTable).where(eq(bingolingoContentTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json({ success: true });
});

router.get("/bingolingo/clients/:id/calendar", authenticate, async (req, res): Promise<void> => {
  const clientId = Number(req.params.id);
  const content = await db
    .select()
    .from(bingolingoContentTable)
    .where(eq(bingolingoContentTable.clientId, clientId))
    .orderBy(desc(bingolingoContentTable.createdAt));

  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, clientId));

  const published = content.filter((c) => c.status === "published");
  const drafts = content.filter((c) => c.status === "draft");

  const typeBreakdown: Record<string, number> = {};
  for (const c of content) {
    typeBreakdown[c.type] = (typeBreakdown[c.type] || 0) + 1;
  }

  const suggestedTopics = [
    `${client?.industry || "Industry"} trends for ${new Date().getFullYear()}`,
    `How ${client?.name || "your company"} is innovating in ${client?.industry || "the market"}`,
    `Top 5 challenges in ${client?.industry || "your industry"} and how to overcome them`,
    `Client success story: ${client?.industry || "Industry"} transformation`,
    `The future of ${client?.industry || "business"}: What to expect`,
  ];

  res.json({
    content,
    published: published.length,
    drafts: drafts.length,
    typeBreakdown,
    suggestedTopics,
  });
});

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

  const results = [];
  for (const content of publishedContent) {
    let scores = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.bingolingoContentId, content.id))
      .orderBy(desc(aeoScoresTable.scannedAt));

    if (scores.length === 0 && content.publishedUrl) {
      scores = await db
        .select()
        .from(aeoScoresTable)
        .where(eq(aeoScoresTable.sourceUrl, content.publishedUrl))
        .orderBy(desc(aeoScoresTable.scannedAt));
    }

    if (scores.length === 0) {
      results.push({
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
      });
      continue;
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

    results.push({
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
    });
  }

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

router.post("/bingolingo/ext/generate", authenticateApiKey, async (req, res): Promise<void> => {
  const clientId = (req as BingoLingoApiKeyRequest).bingolingoClientId as number;
  const { contentType, topic, tone, keywords } = req.body;

  if (!contentType || !topic) {
    res.status(400).json({ error: "contentType and topic are required" });
    return;
  }

  if (!CONTENT_TYPES.includes(contentType)) {
    res.status(400).json({ error: `Invalid contentType. Must be one of: ${CONTENT_TYPES.join(", ")}` });
    return;
  }

  if (tone && !TONES.includes(tone)) {
    res.status(400).json({ error: `Invalid tone. Must be one of: ${TONES.join(", ")}` });
    return;
  }

  const [client] = await db.select().from(bingolingoClientsTable).where(eq(bingolingoClientsTable.id, clientId));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const systemPrompt = getSystemPrompt(contentType);
  const useTone = tone || client.defaultTone || "professional";
  const keywordList = keywords && Array.isArray(keywords) ? keywords.join(", ") : "";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // high-volume BingoLingo content generation, cost-efficient
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Industry: ${client.industry}\nCompany: ${client.name}\nTopic: ${topic}\nTone: ${useTone}\n${keywordList ? `Keywords: ${keywordList}` : ""}\n\nGenerate the content now.` },
      ],
    });

    const body = completion.choices[0]?.message?.content ?? "";
    const titleMatch = body.match(/^#\s+(.+)$/m) || body.match(/^(.+)\n/);
    const suggestedTitle = titleMatch ? titleMatch[1].replace(/^#+\s*/, "").trim() : topic;
    const finalSlug = slugify(suggestedTitle);
    const metaDescription = body.slice(0, 155).trim() + "...";

    const [content] = await db
      .insert(bingolingoContentTable)
      .values({
        clientId,
        type: contentType,
        title: suggestedTitle,
        slug: finalSlug,
        body,
        metaDescription,
        status: "draft",
        topic,
        tone: useTone,
        keywords: keywords ?? null,
      })
      .returning();

    res.status(201).json(content);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Content generation failed" });
  }
});

router.post("/bingolingo/ext/publish", authenticateApiKey, async (req, res): Promise<void> => {
  const clientId = (req as BingoLingoApiKeyRequest).bingolingoClientId as number;
  const { contentId } = req.body;
  if (!contentId) {
    res.status(400).json({ error: "contentId is required" });
    return;
  }
  const [content] = await db
    .select()
    .from(bingolingoContentTable)
    .where(and(eq(bingolingoContentTable.id, Number(contentId)), eq(bingolingoContentTable.clientId, clientId)));
  if (!content) {
    res.status(404).json({ error: "Content not found for this client" });
    return;
  }
  const [updated] = await db
    .update(bingolingoContentTable)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(bingolingoContentTable.id, content.id))
    .returning();
  res.json(updated);
});

router.get("/bingolingo/ext/content", authenticateApiKey, async (req, res): Promise<void> => {
  const clientId = (req as BingoLingoApiKeyRequest).bingolingoClientId as number;
  const status = req.query.status as string | undefined;
  const type = req.query.type as string | undefined;

  const conditions = [eq(bingolingoContentTable.clientId, clientId)];
  if (status) conditions.push(eq(bingolingoContentTable.status, status));
  if (type) conditions.push(eq(bingolingoContentTable.type, type));

  const content = await db
    .select()
    .from(bingolingoContentTable)
    .where(and(...conditions))
    .orderBy(desc(bingolingoContentTable.createdAt));

  res.json(content);
});

export default router;
