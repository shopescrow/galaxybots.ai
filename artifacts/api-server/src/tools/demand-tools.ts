import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import {
  researchDemandForCategory,
  getCreationQueue,
  linkAssetToOpportunity,
  ensureDemandResearchBot,
} from "../services/intelligence/demand-engine";

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Demand intelligence tools require a client context");
  }
  return context.clientId;
}

registerTool({
  name: "research_demand_opportunities",
  description:
    "Research market demand vs. competition for a category and produce a ranked list of niche opportunities. Each opportunity is scored (demand vs. competition), carries supporting evidence (search/trend signals, competitor examples, suggested angle), and is persisted for the creation queue. Use this to decide WHAT the creator bots should make next instead of generating blindly.",
  inputSchema: z.object({
    category: z
      .string()
      .describe("The category/market to research (e.g. 'budget planners', 'AI productivity tools')"),
    count: z
      .number()
      .optional()
      .describe("How many niche opportunities to surface (1-10, default 5)"),
    groundingContext: z
      .string()
      .optional()
      .describe("Optional scraped/competitor context to ground the research in"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const botId = context.botId ?? (await ensureDemandResearchBot());
    const result = await researchDemandForCategory(clientId, input.category, {
      botId,
      count: input.count,
      groundingContext: input.groundingContext,
    });
    return {
      success: true,
      category: result.category,
      created: result.created,
      opportunities: result.opportunities.map((o) => ({
        id: o.id,
        niche: o.niche,
        title: o.title,
        suggestedAngle: o.suggestedAngle,
        suggestedAssetType: o.suggestedAssetType,
        demandScore: o.demandScore,
        competitionScore: o.competitionScore,
        opportunityScore: o.opportunityScore,
        rank: o.rank,
        evidence: o.evidence,
      })),
    };
  },
});

registerTool({
  name: "get_creation_queue",
  description:
    "Get the prioritized creation queue of niche opportunities for the asset creator bots to pull from. Returns approved (and pinned) opportunities first, ranked by opportunity score. Each item includes the niche, suggested angle, suggested asset type, and its opportunity id (pass it to link_asset_to_opportunity after producing the asset).",
  inputSchema: z.object({
    category: z.string().optional().describe("Filter the queue to a single category"),
    limit: z.number().optional().describe("Max items to return (default 25)"),
    includePending: z
      .boolean()
      .optional()
      .describe("Include not-yet-approved (pending) opportunities (default false)"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const queue = await getCreationQueue(clientId, {
      category: input.category,
      limit: input.limit,
      includePending: input.includePending,
    });
    return {
      success: true,
      count: queue.length,
      queue: queue.map((o) => ({
        opportunityId: o.id,
        niche: o.niche,
        title: o.title,
        category: o.category,
        suggestedAngle: o.suggestedAngle,
        suggestedAssetType: o.suggestedAssetType,
        opportunityScore: o.opportunityScore,
        demandScore: o.demandScore,
        competitionScore: o.competitionScore,
        pinned: o.pinned,
        rank: o.rank,
        status: o.status,
        evidence: o.evidence,
      })),
    };
  },
});

registerTool({
  name: "link_asset_to_opportunity",
  description:
    "Link a produced asset back to the demand opportunity it was created from. Marks the opportunity as produced so operators can trace which assets came from which opportunities. Call this after creating an asset from a creation-queue item.",
  inputSchema: z.object({
    opportunityId: z.number().describe("The demand opportunity id from the creation queue"),
    assetId: z.number().describe("The asset id produced from this opportunity"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const updated = await linkAssetToOpportunity(
      clientId,
      input.opportunityId,
      input.assetId,
    );
    if (!updated) {
      return { success: false, error: "Opportunity not found for this client." };
    }
    return {
      success: true,
      opportunityId: updated.id,
      resultingAssetId: updated.resultingAssetId,
      status: updated.status,
    };
  },
});
