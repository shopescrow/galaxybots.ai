import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, aeoScoresTable, competitorUrlsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const ENGINE_TRAFFIC_WEIGHTS: Record<string, number> = {
  chatgpt: 100,
  gemini: 90,
  perplexity: 70,
  bing_copilot: 60,
  meta_ai: 50,
  deepseek: 45,
  grok: 40,
  claude: 35,
  google_ai: 30,
};

registerTool({
  name: "track_competitor",
  description: "Register a competitor URL to track AEO scores against for a client. Accepts a URL and company name. Max 10 active competitors per client.",
  inputSchema: z.object({
    url: z.string().describe("The competitor's website URL to track"),
    companyName: z.string().describe("The competitor's company name"),
    clientId: z.number().optional().describe("The client ID to track this competitor for. Uses context client if not provided."),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = input.clientId ?? context.clientId;
    if (!clientId) {
      return { success: false, error: "No client ID provided or available in context." };
    }

    const rawUrl = input.url.trim();
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    try {
      new URL(normalizedUrl);
    } catch {
      return { success: false, error: "Invalid URL format. Please provide a valid URL (e.g., https://example.com)." };
    }

    const activeCompetitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (activeCompetitors.length >= 10) {
      return { success: false, error: "Maximum of 10 active competitors per client. Please remove one before adding another." };
    }

    const existing = activeCompetitors.find(c => c.url === normalizedUrl);
    if (existing) {
      return { success: false, error: `This URL is already being tracked as competitor "${existing.companyName}".` };
    }

    const [record] = await db.insert(competitorUrlsTable).values({
      clientId,
      url: normalizedUrl,
      companyName: input.companyName,
      addedBy: context.botName ?? "system",
    }).returning();

    return {
      success: true,
      competitor: record,
      message: `Now tracking ${input.companyName} (${input.url}) as a competitor.`,
    };
  },
});

registerTool({
  name: "list_competitors",
  description: "List all active competitors for a client with their latest AEO scores and delta vs. the client's own score.",
  inputSchema: z.object({
    clientId: z.number().optional().describe("The client ID. Uses context client if not provided."),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = input.clientId ?? context.clientId;
    if (!clientId) {
      return { success: false, error: "No client ID provided or available in context." };
    }

    const competitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (competitors.length === 0) {
      return { success: true, competitors: [], message: "No competitors are currently being tracked for this client." };
    }

    const [clientScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    const results = [];
    for (const comp of competitors) {
      const [latestScore] = await db
        .select()
        .from(aeoScoresTable)
        .where(and(
          eq(aeoScoresTable.sourceUrl, comp.url),
          eq(aeoScoresTable.scanType, "competitor")
        ))
        .orderBy(desc(aeoScoresTable.scannedAt))
        .limit(1);

      results.push({
        id: comp.id,
        companyName: comp.companyName,
        url: comp.url,
        addedBy: comp.addedBy,
        createdAt: comp.createdAt.toISOString(),
        latestScore: latestScore ? {
          overallScore: latestScore.overallScore,
          citationCount: latestScore.citationCount,
          scannedAt: latestScore.scannedAt.toISOString(),
        } : null,
        delta: latestScore && clientScore
          ? clientScore.overallScore - latestScore.overallScore
          : null,
      });
    }

    return {
      success: true,
      clientScore: clientScore ? clientScore.overallScore : null,
      competitors: results,
    };
  },
});

registerTool({
  name: "untrack_competitor",
  description: "Stop tracking a competitor URL by setting it to inactive.",
  inputSchema: z.object({
    competitorId: z.number().optional().describe("The competitor record ID to deactivate"),
    url: z.string().optional().describe("The competitor URL to deactivate (alternative to competitorId)"),
    clientId: z.number().optional().describe("The client ID. Uses context client if not provided."),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = input.clientId ?? context.clientId;
    if (!clientId) {
      return { success: false, error: "No client ID provided or available in context." };
    }

    const conditions = [
      eq(competitorUrlsTable.clientId, clientId),
      eq(competitorUrlsTable.active, true),
    ];

    if (input.competitorId) {
      conditions.push(eq(competitorUrlsTable.id, input.competitorId));
    } else if (input.url) {
      conditions.push(eq(competitorUrlsTable.url, input.url));
    } else {
      return { success: false, error: "Provide either competitorId or url to identify the competitor." };
    }

    const [updated] = await db
      .update(competitorUrlsTable)
      .set({ active: false })
      .where(and(...conditions))
      .returning();

    if (!updated) {
      return { success: false, error: "Competitor not found or already inactive." };
    }

    return {
      success: true,
      message: `Stopped tracking ${updated.companyName} (${updated.url}).`,
    };
  },
});

registerTool({
  name: "compare_aeo_scores",
  description: "Compare the client's latest Cloud 9 AEO score side-by-side against all tracked competitors. Shows overall score, citation count, per-engine breakdown, and delta (client minus competitor). Highlights where the client leads and lags.",
  inputSchema: z.object({
    clientId: z.number().optional().describe("The client ID. Uses context client if not provided."),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = input.clientId ?? context.clientId;
    if (!clientId) {
      return { success: false, error: "No client ID provided or available in context." };
    }

    const [clientScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    if (!clientScore) {
      return { success: false, error: "No AEO score data found for this client." };
    }

    const competitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (competitors.length === 0) {
      return { success: false, error: "No competitors are being tracked. Use track_competitor to add some." };
    }

    const clientEngines = clientScore.engineScores as Record<string, { score: number; cited: boolean }>;
    const comparisons = [];

    for (const comp of competitors) {
      const [compScore] = await db
        .select()
        .from(aeoScoresTable)
        .where(and(
          eq(aeoScoresTable.sourceUrl, comp.url),
          eq(aeoScoresTable.scanType, "competitor")
        ))
        .orderBy(desc(aeoScoresTable.scannedAt))
        .limit(1);

      if (!compScore) {
        comparisons.push({
          companyName: comp.companyName,
          url: comp.url,
          hasData: false,
          message: "No scan data available yet for this competitor.",
        });
        continue;
      }

      const compEngines = compScore.engineScores as Record<string, { score: number; cited: boolean }>;
      const engineBreakdown: Record<string, { clientScore: number; clientCited: boolean; competitorScore: number; competitorCited: boolean; delta: number }> = {};
      const leadsOn: string[] = [];
      const lagsOn: string[] = [];

      for (const [engine, clientData] of Object.entries(clientEngines)) {
        const compData = compEngines[engine];
        if (compData) {
          const delta = clientData.score - compData.score;
          engineBreakdown[engine] = {
            clientScore: clientData.score,
            clientCited: clientData.cited,
            competitorScore: compData.score,
            competitorCited: compData.cited,
            delta,
          };
          if (delta > 0) leadsOn.push(engine);
          else if (delta < 0) lagsOn.push(engine);
        }
      }

      comparisons.push({
        companyName: comp.companyName,
        url: comp.url,
        hasData: true,
        overallScore: compScore.overallScore,
        citationCount: compScore.citationCount,
        overallDelta: clientScore.overallScore - compScore.overallScore,
        citationDelta: clientScore.citationCount - compScore.citationCount,
        engineBreakdown,
        leadsOn,
        lagsOn,
        scannedAt: compScore.scannedAt.toISOString(),
      });
    }

    return {
      success: true,
      client: {
        overallScore: clientScore.overallScore,
        citationCount: clientScore.citationCount,
        scannedAt: clientScore.scannedAt.toISOString(),
      },
      comparisons,
    };
  },
});

registerTool({
  name: "get_competitive_gaps",
  description: "Returns a prioritized list of AI engines where competitors are cited but the client is not, ordered by engine traffic weight. Each gap includes a recommended action.",
  inputSchema: z.object({
    clientId: z.number().optional().describe("The client ID. Uses context client if not provided."),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = input.clientId ?? context.clientId;
    if (!clientId) {
      return { success: false, error: "No client ID provided or available in context." };
    }

    const [clientScore] = await db
      .select()
      .from(aeoScoresTable)
      .where(and(
        eq(aeoScoresTable.clientId, clientId),
        eq(aeoScoresTable.scanType, "client")
      ))
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    if (!clientScore) {
      return { success: false, error: "No AEO score data found for this client." };
    }

    const competitors = await db
      .select()
      .from(competitorUrlsTable)
      .where(and(
        eq(competitorUrlsTable.clientId, clientId),
        eq(competitorUrlsTable.active, true)
      ));

    if (competitors.length === 0) {
      return { success: false, error: "No competitors are being tracked." };
    }

    const clientEngines = clientScore.engineScores as Record<string, { score: number; cited: boolean }>;
    const gapMap: Record<string, { competitorsCited: string[]; competitorScores: number[] }> = {};

    for (const comp of competitors) {
      const [compScore] = await db
        .select()
        .from(aeoScoresTable)
        .where(and(
          eq(aeoScoresTable.sourceUrl, comp.url),
          eq(aeoScoresTable.scanType, "competitor")
        ))
        .orderBy(desc(aeoScoresTable.scannedAt))
        .limit(1);

      if (!compScore) continue;

      const compEngines = compScore.engineScores as Record<string, { score: number; cited: boolean }>;
      for (const [engine, compData] of Object.entries(compEngines)) {
        const clientData = clientEngines[engine];
        if (compData.cited && clientData && !clientData.cited) {
          if (!gapMap[engine]) {
            gapMap[engine] = { competitorsCited: [], competitorScores: [] };
          }
          gapMap[engine].competitorsCited.push(comp.companyName);
          gapMap[engine].competitorScores.push(compData.score);
        }
      }
    }

    const recommendations: Record<string, string> = {
      chatgpt: "Create comprehensive, authoritative FAQ content and ensure strong schema markup. ChatGPT favors well-structured, authoritative sources.",
      gemini: "Optimize for Google's Knowledge Graph by improving structured data and E-E-A-T signals. Gemini pulls heavily from Google Search signals.",
      perplexity: "Build topical authority with deep, well-cited content clusters. Perplexity rewards thorough, research-backed content.",
      bing_copilot: "Improve Bing SEO fundamentals — strong meta descriptions, clear headings, and Bing Webmaster Tools integration.",
      meta_ai: "Increase social proof and engagement signals. Meta AI weights content that generates discussion and sharing.",
      deepseek: "Focus on technical accuracy and depth of content. DeepSeek favors detailed, expert-level content.",
      grok: "Optimize for real-time relevance and trending topic coverage. Grok values current, frequently updated content.",
      claude: "Ensure content is well-structured, factually accurate, and thoroughly sourced. Claude values reliability and nuance.",
      google_ai: "Strengthen E-E-A-T signals and ensure content appears in featured snippets. Google AI prioritizes authoritative, well-organized content.",
    };

    const gaps = Object.entries(gapMap)
      .map(([engine, data]) => ({
        engine,
        trafficWeight: ENGINE_TRAFFIC_WEIGHTS[engine] ?? 0,
        competitorsCited: data.competitorsCited,
        avgCompetitorScore: Math.round(data.competitorScores.reduce((a, b) => a + b, 0) / data.competitorScores.length),
        clientScore: clientEngines[engine]?.score ?? 0,
        recommendedAction: recommendations[engine] ?? "Improve content quality and structured data for this engine.",
      }))
      .sort((a, b) => b.trafficWeight - a.trafficWeight);

    return {
      success: true,
      clientOverallScore: clientScore.overallScore,
      gaps,
      totalGaps: gaps.length,
      message: gaps.length === 0
        ? "No competitive gaps found — the client is cited on all engines where competitors are cited."
        : `Found ${gaps.length} engine(s) where competitors are cited but the client is not.`,
    };
  },
});
