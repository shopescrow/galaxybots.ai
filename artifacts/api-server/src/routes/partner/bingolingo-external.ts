import { Router, type IRouter } from "express";
import { db, bingolingoClientsTable, bingolingoContentTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticateApiKey, type BingoLingoApiKeyRequest } from "../../middleware/bingolingo-api-key";
import { generateContent, CONTENT_TYPES, TONES } from "../../services/partner/bingolingo-content";

const router: IRouter = Router();

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

  try {
    const result = await generateContent({
      contentType,
      topic,
      tone: tone || client.defaultTone || "professional",
      keywords,
      clientName: client.name,
      clientIndustry: client.industry,
    });

    const [content] = await db
      .insert(bingolingoContentTable)
      .values({
        clientId,
        type: contentType,
        title: result.title,
        slug: result.slug,
        body: result.body,
        metaDescription: result.metaDescription,
        status: "draft",
        topic,
        tone: result.tone,
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
