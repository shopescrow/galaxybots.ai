import { Router, type IRouter } from "express";
import { db, bingolingoClientsTable, bingolingoContentTable, bingolingoApiKeysTable, aeoScanRequestsTable, platformApiKeysTable } from "@workspace/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { randomBytes, createHash } from "node:crypto";
import { authenticate, requireRole } from "../../middleware/auth";
import { authenticateApiKey, type BingoLingoApiKeyRequest } from "../../middleware/bingolingo-api-key";
import { generateContent, slugify, CONTENT_TYPES, TONES } from "../../services/partner/bingolingo-content";

const router: IRouter = Router();

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateApiKey(): string {
  return `blk_${randomBytes(24).toString("base64url")}`;
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
  const clientsWithCount = await db
    .select({
      client: bingolingoClientsTable,
      contentCount: count(bingolingoContentTable.id),
      lastPublishedAt: sql<string | null>`MAX(CASE WHEN ${bingolingoContentTable.status} = 'published' THEN ${bingolingoContentTable.publishedAt} END)`,
    })
    .from(bingolingoClientsTable)
    .leftJoin(bingolingoContentTable, eq(bingolingoClientsTable.id, bingolingoContentTable.clientId))
    .groupBy(bingolingoClientsTable.id)
    .orderBy(desc(bingolingoClientsTable.createdAt));

  const result = clientsWithCount.map(c => ({
    ...c.client,
    contentCount: Number(c.contentCount),
    lastPublishedAt: c.lastPublishedAt ?? null,
  }));

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

  try {
    const result = await generateContent({
      contentType,
      topic,
      tone: tone || client.defaultTone || "professional",
      keywords,
      clientName: client.name,
      clientIndustry: client.industry,
    });
    res.json(result);
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

  try {
    const result = await generateContent({
      contentType,
      topic,
      tone: tone || client.defaultTone || "professional",
      keywords,
      clientName: client.name,
      clientIndustry: client.industry,
    });
    res.json(result);
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
    queueAeoScanForContent(updated.id, updated.publishedUrl, updated.clientId).catch((err) =>
      console.error(`[bingolingo/content] job=aeo-scan contentId=${updated.id} error=${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : err)
    );
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
    queueAeoScanForContent(updated.id, updated.publishedUrl, updated.clientId).catch((err) =>
      console.error(`[bingolingo/publish] job=aeo-scan contentId=${updated.id} error=${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : err)
    );
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

export default router;
