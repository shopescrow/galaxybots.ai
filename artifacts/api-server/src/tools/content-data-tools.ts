import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { scrapePageText } from "./integrations/scraper";
import {
  generateSeoArticleAsset,
  generateNewsletterAsset,
  assembleDatasetAsset,
} from "../services/content/content-assets";

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Content & Data tools require a client context");
  }
  return context.clientId;
}

registerTool({
  name: "generate_seo_article",
  description:
    "Generate a programmatic-SEO blog article (review, comparison, or niche guide) targeting a keyword, and store it as an Asset Studio asset in draft. The article goes through human review before it can be published to the blog. Returns the asset id and slug. Does NOT publish — a human must approve.",
  inputSchema: z.object({
    topic: z.string().describe("The article topic / working title"),
    targetKeyword: z.string().describe("Primary SEO keyword to target"),
    format: z.enum(["review", "comparison", "guide"]).optional().describe("Article format; defaults to 'guide'"),
    niche: z.string().optional().describe("Niche / audience the article targets"),
    secondaryKeywords: z.array(z.string()).optional().describe("Optional secondary keywords"),
    author: z.string().optional().describe("Byline author; defaults to 'GalaxyBots'"),
    category: z.string().optional().describe("Blog category; defaults to 'Insights'"),
    submitForReview: z.boolean().optional().describe("If true, submit straight to review instead of leaving as draft"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const { asset, title, slug, wordCount } = await generateSeoArticleAsset({
      clientId,
      botId: context.botId,
      botName: context.botName,
      topic: input.topic,
      targetKeyword: input.targetKeyword,
      format: input.format,
      niche: input.niche,
      secondaryKeywords: input.secondaryKeywords,
      author: input.author,
      category: input.category,
      submitForReview: input.submitForReview,
    });
    return {
      assetId: asset.id,
      status: asset.status,
      title,
      slug,
      wordCount,
      message: `SEO article "${title}" stored as asset ${asset.id} (${asset.status}). It will appear on the blog only after human approval & publish.`,
    };
  },
});

registerTool({
  name: "generate_newsletter_issue",
  description:
    "Generate a single newsletter issue (industry/tech digest) and store it as an Asset Studio asset with a downloadable markdown export attached. Goes through human review before export. Returns the asset id. Does NOT send anything.",
  inputSchema: z.object({
    industry: z.string().describe("Industry / topic area for the digest"),
    audience: z.string().optional().describe("Who the newsletter is for"),
    focus: z.string().optional().describe("Optional focus/theme for this issue"),
    tone: z.string().optional().describe("Editorial tone; defaults to professional/insightful"),
    edition: z.string().optional().describe("Edition label, e.g. 'June 2026'; defaults to current month"),
    submitForReview: z.boolean().optional().describe("If true, submit straight to review instead of leaving as draft"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const { asset, title, edition } = await generateNewsletterAsset({
      clientId,
      botId: context.botId,
      botName: context.botName,
      industry: input.industry,
      audience: input.audience,
      focus: input.focus,
      tone: input.tone,
      edition: input.edition,
      submitForReview: input.submitForReview,
    });
    return {
      assetId: asset.id,
      status: asset.status,
      title,
      edition,
      message: `Newsletter issue "${title}" (${edition}) stored as asset ${asset.id} (${asset.status}) with a markdown export. Awaiting human review before export.`,
    };
  },
});

registerTool({
  name: "assemble_dataset_report",
  description:
    "Assemble and clean a curated dataset/trend report for an industry from a list of source URLs. Scrapes each source, extracts and de-duplicates structured rows, and packages the result as a downloadable CSV (or JSON) attached to an Asset Studio 'data' asset. Goes through human review before export. Returns the asset id and row count.",
  inputSchema: z.object({
    industry: z.string().describe("Industry the dataset covers"),
    topic: z.string().describe("What the dataset is about, e.g. 'top AI coding tools 2026'"),
    sourceUrls: z.array(z.string()).min(1).describe("Source URLs to scrape and synthesize (1-8)"),
    columns: z.array(z.string()).optional().describe("Optional explicit column names for the dataset"),
    format: z.enum(["csv", "json"]).optional().describe("Output file format; defaults to csv"),
    submitForReview: z.boolean().optional().describe("If true, submit straight to review instead of leaving as draft"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const urls = input.sourceUrls.slice(0, 8);

    const sources: Array<{ url: string; title?: string; content: string }> = [];
    const failed: Array<{ url: string; error: string }> = [];
    for (const url of urls) {
      const r = await scrapePageText(url, 6000);
      if (r.success && r.content) {
        sources.push({ url, title: r.title, content: r.content });
      } else {
        failed.push({ url, error: r.error ?? "scrape failed" });
      }
    }
    if (sources.length === 0) {
      return { success: false, error: "Could not scrape any of the provided sources.", failed };
    }

    const { asset, fileId, rowCount, columns } = await assembleDatasetAsset({
      clientId,
      botId: context.botId,
      botName: context.botName,
      industry: input.industry,
      topic: input.topic,
      sources,
      columns: input.columns,
      format: input.format,
      submitForReview: input.submitForReview,
    });
    return {
      success: true,
      assetId: asset.id,
      status: asset.status,
      fileId,
      rowCount,
      columns,
      scrapedSources: sources.length,
      failedSources: failed,
      message: `Dataset "${asset.title}" assembled with ${rowCount} rows from ${sources.length} source(s), stored as asset ${asset.id} (${asset.status}). Awaiting human review before export.`,
    };
  },
});
