import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, aeoScoresTable, clientsTable, botsTable, partnerRegistrationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { runAgenticLoop } from "../tools/agentic-loop";

const router: IRouter = Router();

const PIRATEMONSTER_INBOUND_SECRET = process.env["PIRATEMONSTER_INBOUND_SECRET"] || "";
const PIRATEMONSTER_API_KEY = process.env["PIRATEMONSTER_API_KEY"] || "";

const EngineScoreSchema = z.object({
  score: z.number().min(0).max(100),
  cited: z.boolean(),
});

const WebhookPayloadSchema = z.object({
  sourceUrl: z.string().url(),
  overallScore: z.number().int().min(0).max(100),
  engineScores: z.object({
    chatgpt: EngineScoreSchema,
    gemini: EngineScoreSchema,
    perplexity: EngineScoreSchema,
    bing_copilot: EngineScoreSchema,
    meta_ai: EngineScoreSchema,
    deepseek: EngineScoreSchema,
    grok: EngineScoreSchema,
    claude: EngineScoreSchema,
    google_ai: EngineScoreSchema,
  }),
  citationCount: z.number().int().min(0),
  recommendations: z.array(z.string()),
  scannedAt: z.string().refine(
    (val) => !isNaN(new Date(val).getTime()),
    { message: "scannedAt must be a valid ISO 8601 date string" }
  ),
});

const RecommendPayloadSchema = z.object({
  url: z.string().url(),
  context: z.string().optional(),
});

function requireInboundSecret(req: Request, res: Response, next: NextFunction) {
  if (!PIRATEMONSTER_INBOUND_SECRET) {
    res.status(503).json({ error: "PirateMonster inbound secret not configured" });
    return;
  }
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== PIRATEMONSTER_INBOUND_SECRET) {
    res.status(401).json({ error: "Invalid or missing API key" });
    return;
  }
  next();
}

async function matchClientByUrl(sourceUrl: string): Promise<number | null> {
  try {
    const urlObj = new URL(sourceUrl);
    const domain = urlObj.hostname.replace(/^www\./, "").toLowerCase();

    const clients = await db.select().from(clientsTable);
    for (const client of clients) {
      const emailDomain = client.contactEmail.split("@")[1]?.toLowerCase();
      if (emailDomain && domain === emailDomain) {
        return client.id;
      }
    }
  } catch {
    // ignore URL parsing errors
  }
  return null;
}

router.post("/integrations/piratemonster/webhook", requireInboundSecret, async (req, res): Promise<void> => {
  try {
    const parsed = WebhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { sourceUrl, overallScore, engineScores, citationCount, recommendations, scannedAt } = parsed.data;

    const clientId = await matchClientByUrl(sourceUrl);

    const [record] = await db.insert(aeoScoresTable).values({
      clientId,
      sourceUrl,
      overallScore,
      engineScores,
      citationCount,
      recommendations,
      scannedAt: new Date(scannedAt),
    }).onConflictDoUpdate({
      target: [aeoScoresTable.sourceUrl, aeoScoresTable.scannedAt],
      set: {
        overallScore,
        engineScores,
        citationCount,
        recommendations,
        clientId,
      },
    }).returning();

    res.status(200).json(record);
  } catch (err) {
    console.error("Error processing PirateMonster webhook:", err);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

router.get("/integrations/piratemonster/scores/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  try {
    const scores = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.clientId, clientId))
      .orderBy(desc(aeoScoresTable.scannedAt));

    res.json(scores);
  } catch (err) {
    console.error("Error fetching AEO scores:", err);
    res.status(500).json({ error: "Failed to fetch AEO scores" });
  }
});

router.post("/integrations/piratemonster/recommend", requireInboundSecret, async (req, res): Promise<void> => {
  try {
    const parsed = RecommendPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { url, context } = parsed.data;

    const [latestScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(eq(aeoScoresTable.sourceUrl, url))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    const [marketingBot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.department, "Marketing"));

    const botName = marketingBot?.name ?? "Digital Marketing Director";
    const botTitle = marketingBot?.title ?? "Digital Marketing Director";
    const botPersonality = marketingBot?.personality ?? "Strategic and data-driven";
    const botResponsibilities = marketingBot?.responsibilities ?? ["Digital marketing strategy"];

    let scoreContext = "No AEO score data available for this URL.";
    if (latestScore) {
      const engines = latestScore.engineScores as Record<string, { score: number; cited: boolean }>;
      const missingEngines = Object.entries(engines)
        .filter(([, v]) => !v.cited)
        .map(([k]) => k);
      scoreContext = `Cloud 9 Score: ${latestScore.overallScore}/100. Citation count: ${latestScore.citationCount}. Missing citations on: ${missingEngines.join(", ") || "none"}. Recommendations: ${(latestScore.recommendations as string[]).join("; ")}`;
    }

    const systemPrompt = `You are ${botName}, ${botTitle}.
Personality: ${botPersonality}
Your responsibilities: ${Array.isArray(botResponsibilities) ? botResponsibilities.join("; ") : botResponsibilities}

You are an expert in AEO (Answer Engine Optimization) — the practice of optimizing websites to appear as cited sources in AI answer engines like ChatGPT, Gemini, Perplexity, and others.

Provide a strategic AEO recommendation for the given URL based on the score data. Be specific, actionable, and prioritize the highest-impact improvements. You have access to tools to look up additional data if needed.`;

    const userMessage = `URL: ${url}\n\nCurrent AEO Data: ${scoreContext}${context ? `\n\nAdditional Context: ${context}` : ""}

Please provide a strategic AEO recommendation with specific, actionable steps to improve AI visibility.`;

    const loopResult = await runAgenticLoop({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      context: {
        botId: marketingBot?.id,
        botName,
        clientId: latestScore?.clientId ?? undefined,
      },
      maxIterations: 5,
      maxTokens: 800,
    });

    res.json({
      url,
      recommendation: loopResult.finalContent,
      botName,
      botTitle,
      scoreData: latestScore ? {
        overallScore: latestScore.overallScore,
        citationCount: latestScore.citationCount,
        scannedAt: latestScore.scannedAt,
      } : null,
    });
  } catch (err) {
    console.error("Error generating AEO recommendation:", err);
    res.status(500).json({ error: "Failed to generate recommendation" });
  }
});

router.get("/integrations/piratemonster/config", async (_req, res): Promise<void> => {
  const inboundSecretMasked = PIRATEMONSTER_INBOUND_SECRET
    ? "••••••••" + PIRATEMONSTER_INBOUND_SECRET.slice(-4)
    : null;

  res.json({
    webhookUrl: "/api/integrations/piratemonster/webhook",
    recommendUrl: "/api/integrations/piratemonster/recommend",
    method: "POST",
    apiKeyHeader: "x-api-key",
    inboundSecretConfigured: !!PIRATEMONSTER_INBOUND_SECRET,
    inboundSecretMasked,
    outboundKeyConfigured: !!PIRATEMONSTER_API_KEY,
    engines: ["chatgpt", "gemini", "perplexity", "bing_copilot", "meta_ai", "deepseek", "grok", "claude", "google_ai"],
  });
});

router.post("/integrations/piratemonster/register-partner", requireInboundSecret, async (_req, res): Promise<void> => {
  try {
    const existing = await db
      .select()
      .from(partnerRegistrationsTable)
      .where(eq(partnerRegistrationsTable.partnerRef, "piratemonster"));

    if (existing.length > 0) {
      res.json({ message: "PirateMonster partner already registered", partner: existing[0] });
      return;
    }

    const [partner] = await db.insert(partnerRegistrationsTable).values({
      partnerRef: "piratemonster",
      clientId: 0,
      companyName: "PirateMonster.com",
      contactName: "PirateMonster Platform",
      contactEmail: "platform@piratemonster.com",
      plan: "enterprise",
      source: "platform_integration",
      status: "active",
    }).returning();

    res.status(201).json(partner);
  } catch (err) {
    console.error("Error registering PirateMonster partner:", err);
    res.status(500).json({ error: "Failed to register partner" });
  }
});

export default router;
