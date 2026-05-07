import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, aeoScoresTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

registerTool({
  name: "analyze_aeo_score",
  description: "Retrieve the latest AEO (Answer Engine Optimization) score for a given URL. Returns the Cloud 9 overall score, per-engine breakdown across 9 AI engines (ChatGPT, Gemini, Perplexity, Bing Copilot, Meta AI, DeepSeek, Grok, Claude, Google AI), citation count, and recommendations.",
  inputSchema: z.object({
    url: z.string().describe("The URL to look up AEO score data for"),
  }),
  execute: async (input, context: ToolContext) => {
    const conditions = [eq(aeoScoresTable.sourceUrl, input.url)];
    if (context.clientId) {
      conditions.push(eq(aeoScoresTable.clientId, context.clientId));
    }

    const [latest] = await db
      .select()
      .from(aeoScoresTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    if (!latest) {
      return {
        found: false,
        url: input.url,
        message: "No AEO score data found for this URL. The URL may not have been scanned yet by PirateMonster.",
      };
    }

    const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
    const citedEngines = Object.entries(engines).filter(([, v]) => v.cited).map(([k]) => k);
    const missingEngines = Object.entries(engines).filter(([, v]) => !v.cited).map(([k]) => k);

    return {
      found: true,
      url: input.url,
      overallScore: latest.overallScore,
      citationCount: latest.citationCount,
      citedEngines,
      missingEngines,
      engineScores: latest.engineScores,
      recommendations: latest.recommendations,
      scannedAt: latest.scannedAt.toISOString(),
    };
  },
});

registerTool({
  name: "aeo_recommend",
  description: "Generate a structured 5-point AEO improvement plan based on stored scores and engine-specific gaps for a URL. Analyzes which AI engines are missing citations and provides actionable steps to improve visibility.",
  inputSchema: z.object({
    url: z.string().describe("The URL to generate AEO recommendations for"),
    focus: z.string().optional().describe("Optional focus area for recommendations (e.g., 'content strategy', 'technical SEO', 'citation building')"),
  }),
  execute: async (input, context: ToolContext) => {
    const conditions = [eq(aeoScoresTable.sourceUrl, input.url)];
    if (context.clientId) {
      conditions.push(eq(aeoScoresTable.clientId, context.clientId));
    }

    const [latest] = await db
      .select()
      .from(aeoScoresTable)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(aeoScoresTable.scannedAt))
      .limit(1);

    if (!latest) {
      return {
        success: false,
        url: input.url,
        error: "No AEO score data found for this URL. Cannot generate improvement plan without baseline data.",
      };
    }

    const engines = latest.engineScores as Record<string, { score: number; cited: boolean }>;
    const missingEngines = Object.entries(engines).filter(([, v]) => !v.cited);
    const lowScoreEngines = Object.entries(engines).filter(([, v]) => v.score < 40).sort((a, b) => a[1].score - b[1].score);

    const plan: Array<{ priority: number; action: string; rationale: string; engines: string[] }> = [];
    let priority = 1;

    if (missingEngines.length > 0) {
      plan.push({
        priority: priority++,
        action: "Improve structured data and schema markup to increase discoverability by AI crawlers",
        rationale: `${missingEngines.length} engine(s) are not citing this URL. Structured data helps AI engines understand and reference content.`,
        engines: missingEngines.map(([k]) => k),
      });
    }

    if (lowScoreEngines.length > 0) {
      plan.push({
        priority: priority++,
        action: "Create comprehensive, authoritative FAQ content addressing common queries in your domain",
        rationale: `${lowScoreEngines.length} engine(s) have scores below 40. FAQ-style content is heavily referenced by answer engines.`,
        engines: lowScoreEngines.map(([k]) => k),
      });
    }

    plan.push({
      priority: priority++,
      action: "Build topical authority through interlinked content clusters and expert citations",
      rationale: "AI engines prioritize sources that demonstrate depth and expertise across related topics.",
      engines: Object.keys(engines),
    });

    if (latest.citationCount < 5) {
      plan.push({
        priority: priority++,
        action: "Increase third-party citations and mentions through PR, guest content, and industry partnerships",
        rationale: `Current citation count is ${latest.citationCount}. AI engines weight external validation heavily.`,
        engines: Object.keys(engines),
      });
    }

    plan.push({
      priority: priority++,
      action: "Optimize page speed, mobile experience, and Core Web Vitals to improve crawlability",
      rationale: "Technical performance impacts how frequently and deeply AI crawlers index content.",
      engines: Object.keys(engines),
    });

    return {
      success: true,
      url: input.url,
      overallScore: latest.overallScore,
      citationCount: latest.citationCount,
      focus: input.focus || "general",
      improvementPlan: plan.slice(0, 5),
      scannedAt: latest.scannedAt.toISOString(),
    };
  },
});
