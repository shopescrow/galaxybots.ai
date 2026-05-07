import { Router, type IRouter } from "express";
import { db, aeoScoresTable, botsTable, partnerRegistrationsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { runAgenticLoop } from "../../../tools/agentic-loop";
import { requireRole } from "../../../middleware/auth";
import { requireInboundSecret } from "./_shared";

const router: IRouter = Router();

router.get("/integrations/piratemonster/scores/:clientId", async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  if (clientId !== req.user!.clientId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const scores = await db
      .select()
      .from(aeoScoresTable)
      .where(and(eq(aeoScoresTable.clientId, clientId), eq(aeoScoresTable.scanType, "client")))
      .orderBy(desc(aeoScoresTable.scannedAt));

    res.json(scores);
  } catch (err) {
    console.error("Error fetching AEO scores:", err);
    res.status(500).json({ error: "Failed to fetch AEO scores" });
  }
});

router.post("/integrations/piratemonster/recommend", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const { url, context } = req.body;
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

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
  const PIRATEMONSTER_INBOUND_SECRET = process.env["PIRATEMONSTER_INBOUND_SECRET"] || "";
  const PIRATEMONSTER_API_KEY = process.env["PIRATEMONSTER_API_KEY"] || "";
  const PIRATEMONSTER_API_BASE_URL = process.env["PIRATEMONSTER_API_BASE_URL"] || "";

  const inboundSecretMasked = PIRATEMONSTER_INBOUND_SECRET
    ? "••••••••" + PIRATEMONSTER_INBOUND_SECRET.slice(-4)
    : null;
  const apiBaseUrlMasked = PIRATEMONSTER_API_BASE_URL
    ? PIRATEMONSTER_API_BASE_URL.replace(/^(https?:\/\/[^/]{4}).*/, "$1••••")
    : null;

  res.json({
    webhookUrl: "/api/integrations/piratemonster/webhook",
    recommendUrl: "/api/integrations/piratemonster/recommend",
    method: "POST",
    apiKeyHeader: "x-piratemonster-signature",
    inboundSecretConfigured: !!PIRATEMONSTER_INBOUND_SECRET,
    inboundSecretMasked,
    outboundKeyConfigured: !!PIRATEMONSTER_API_KEY,
    apiBaseUrlConfigured: !!PIRATEMONSTER_API_BASE_URL,
    apiBaseUrlMasked,
    allCredentialsConfigured: !!PIRATEMONSTER_INBOUND_SECRET && !!PIRATEMONSTER_API_KEY && !!PIRATEMONSTER_API_BASE_URL,
    engines: ["chatgpt", "gemini", "perplexity", "bing_copilot", "meta_ai", "deepseek", "grok", "claude", "google_ai"],
  });
});

router.post("/integrations/piratemonster/register-partner", (req, res, next) => requireInboundSecret(req, res, next), async (_req, res): Promise<void> => {
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
