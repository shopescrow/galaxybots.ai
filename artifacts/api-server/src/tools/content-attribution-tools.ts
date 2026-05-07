import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, bingolingoContentTable, bingolingoClientsTable, aeoScoresTable } from "@workspace/db";
import { eq, and, desc, isNotNull } from "drizzle-orm";

const CONTENT_TYPES = ["blog", "linkedin", "twitter", "email", "press_release", "case_study"] as const;

interface EngineScoreEntry {
  score: number;
  cited: boolean;
}

interface ContentAttributionResult {
  contentId: number;
  title: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  baselineScore: number | null;
  currentScore: number | null;
  delta: number | null;
  enginesGained: string[];
  enginesLost: string[];
  status: "tracked" | "awaiting_scan";
}

function computeEngineDelta(
  baselineEngines: Record<string, EngineScoreEntry>,
  latestEngines: Record<string, EngineScoreEntry>
): { enginesGained: string[]; enginesLost: string[] } {
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
  return { enginesGained, enginesLost };
}

async function resolveClientId(input: { clientId?: number; galaxybotsClientId?: number }): Promise<number | null> {
  if (input.clientId) return input.clientId;

  if (input.galaxybotsClientId) {
    const blClients = await db
      .select({ id: bingolingoClientsTable.id })
      .from(bingolingoClientsTable)
      .where(eq(bingolingoClientsTable.galaxybotsClientId, input.galaxybotsClientId));
    if (blClients.length > 0) return blClients[0].id;
  }
  return null;
}

registerTool({
  name: "generate_content",
  description: "Generate AEO-optimized content for a BingoLingo client via the internal content generation endpoint. Optionally enhances the prompt for AI citation optimization when aeoPurpose is set. Saves the result to the content database and returns content id + preview. Accepts either a BingoLingo clientId or a galaxybotsClientId (resolved to the linked BingoLingo client).",
  inputSchema: z.object({
    clientId: z.number().optional().describe("The BingoLingo client ID to generate content for (provide this or galaxybotsClientId)"),
    galaxybotsClientId: z.number().optional().describe("The GalaxyBots client ID; the linked BingoLingo client will be resolved automatically"),
    contentType: z.enum(CONTENT_TYPES).describe("The type of content to generate"),
    topic: z.string().describe("The topic to write about"),
    tone: z.string().optional().describe("Writing tone: professional, conversational, thought_leadership, educational, bold"),
    targetKeywords: z.array(z.string()).optional().describe("Optional keywords to incorporate"),
    aeoPurpose: z.string().optional().describe("Free text describing AEO purpose, e.g. 'earn ChatGPT citations for X topic'. When set, enhances the prompt for AI citation optimization."),
  }),
  execute: async (input, _context: ToolContext) => {
    const resolvedClientId = await resolveClientId(input);
    if (!resolvedClientId) {
      return { success: false, error: input.galaxybotsClientId
        ? "No linked BingoLingo client found for this GalaxyBots client"
        : "BingoLingo client ID is required" };
    }

    let topicWithAeo = input.topic;
    if (input.aeoPurpose) {
      topicWithAeo += `\n\nAEO PURPOSE: ${input.aeoPurpose}. Structure this content to maximize AI engine citation potential — use concise direct answers, clear entity definitions, structured headings mirroring natural language queries, specific data points, authoritative declarative statements, and include a FAQ section.`;
    }

    const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    try {
      const response = await fetch(`${apiBase}/api/bingolingo/generate-internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || "internal"}` },
        body: JSON.stringify({
          clientId: resolvedClientId,
          contentType: input.contentType,
          topic: topicWithAeo,
          tone: input.tone,
          keywords: input.targetKeywords,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        return { success: false, error: `Content generation failed: ${errBody}` };
      }

      const generated = await response.json() as {
        title: string;
        slug: string;
        body: string;
        metaDescription: string;
        contentType: string;
        topic: string;
        tone: string;
        keywords: string[];
      };

      const [content] = await db
        .insert(bingolingoContentTable)
        .values({
          clientId: resolvedClientId,
          type: input.contentType,
          title: generated.title,
          slug: generated.slug,
          body: generated.body,
          metaDescription: generated.metaDescription,
          status: "draft",
          topic: input.topic,
          tone: generated.tone,
          keywords: generated.keywords ?? null,
        })
        .returning();

      return {
        success: true,
        contentId: content.id,
        title: content.title,
        contentType: content.type,
        status: content.status,
        preview: generated.body.slice(0, 300) + "...",
        aeoPurpose: input.aeoPurpose || null,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Content generation failed" };
    }
  },
});

registerTool({
  name: "get_content_aeo_impact",
  description: "Get AEO attribution summary for published BingoLingo content. Returns which content pieces drove score improvements, which engines cited them, and score deltas from baseline (publish-time) to latest scan.",
  inputSchema: z.object({
    clientId: z.number().optional().describe("Optional GalaxyBots client ID to filter results"),
    bingolingoClientId: z.number().optional().describe("Optional BingoLingo client ID to filter results"),
  }),
  execute: async (input, _context: ToolContext) => {
    const conditions = [
      eq(bingolingoContentTable.status, "published"),
      isNotNull(bingolingoContentTable.publishedUrl),
    ];

    if (input.bingolingoClientId) {
      conditions.push(eq(bingolingoContentTable.clientId, input.bingolingoClientId));
    }

    let publishedContent: (typeof bingolingoContentTable.$inferSelect)[];
    if (input.clientId) {
      const blClients = await db
        .select()
        .from(bingolingoClientsTable)
        .where(eq(bingolingoClientsTable.galaxybotsClientId, input.clientId));

      if (blClients.length === 0) {
        return { success: true, contentPieces: [], message: "No linked BingoLingo clients found for this GalaxyBots client" };
      }

      const clientIds = blClients.map(c => c.id);
      publishedContent = await db
        .select()
        .from(bingolingoContentTable)
        .where(and(...conditions))
        .orderBy(desc(bingolingoContentTable.publishedAt));

      publishedContent = publishedContent.filter(c => clientIds.includes(c.clientId));
    } else {
      publishedContent = await db
        .select()
        .from(bingolingoContentTable)
        .where(and(...conditions))
        .orderBy(desc(bingolingoContentTable.publishedAt));
    }

    const results: ContentAttributionResult[] = [];
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
          publishedAt: content.publishedAt?.toISOString() ?? null,
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
      const baselineEngines = baseline.engineScores as Record<string, EngineScoreEntry>;
      const latestEngines = latest.engineScores as Record<string, EngineScoreEntry>;
      const { enginesGained, enginesLost } = computeEngineDelta(baselineEngines, latestEngines);

      results.push({
        contentId: content.id,
        title: content.title,
        publishedUrl: content.publishedUrl,
        publishedAt: content.publishedAt?.toISOString() ?? null,
        baselineScore: baseline.overallScore,
        currentScore: latest.overallScore,
        delta: latest.overallScore - baseline.overallScore,
        enginesGained,
        enginesLost,
        status: "tracked",
      });
    }

    return {
      success: true,
      contentPieces: results,
      summary: {
        total: results.length,
        tracked: results.filter(r => r.status === "tracked").length,
        awaitingScan: results.filter(r => r.status === "awaiting_scan").length,
        improved: results.filter(r => r.delta !== null && r.delta > 0).length,
        declined: results.filter(r => r.delta !== null && r.delta < 0).length,
      },
    };
  },
});
