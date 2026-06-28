import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import {
  produceDocumentAsset,
  type DocumentAssetBrief,
  type DocumentAssetKind,
} from "../services/content/document-assets";
import { logToolActivity } from "./integrations/_shared";

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Document asset tools require a client context");
  }
  return context.clientId;
}

function changedByOf(context: ToolContext): string {
  return `bot:${context.botName ?? context.botId ?? "document-creator"}`;
}

async function produce(
  kind: DocumentAssetKind,
  brief: Omit<DocumentAssetBrief, "kind">,
  context: ToolContext,
  toolName: string,
) {
  const clientId = requireClient(context);
  const result = await produceDocumentAsset(
    { ...brief, kind },
    {
      clientId,
      botId: context.botId,
      sessionId:
        context.sessionId != null ? Number(context.sessionId) : undefined,
      changedBy: changedByOf(context),
    },
  );
  await logToolActivity(toolName, context, {
    metadata: { assetId: result.assetId, title: result.title, kind },
  });
  return {
    success: true,
    assetId: result.assetId,
    title: result.title,
    fileName: result.fileName,
    status: result.status,
    listing: result.listing,
    message: `Created ${kind} "${result.title}" (asset ${result.assetId}) and submitted it for human review. It cannot be published without your approval.`,
  };
}

registerTool({
  name: "create_printable",
  description:
    "Generate a hyper-niche printable or planner (e.g. 'ADHD daily planner for remote workers') as a print-ready PDF, register it in the Asset Studio with marketplace listing copy, and submit it for human review. The asset lands at the in_review stage — it is never published without explicit human approval.",
  inputSchema: z.object({
    niche: z.string().describe("The hyper-niche brief, e.g. 'ADHD daily planner for remote workers'"),
    title: z.string().optional().describe("Optional explicit product title"),
    audience: z.string().optional().describe("Target audience"),
    tone: z.string().optional().describe("Desired tone/voice"),
    pageCount: z.number().optional().describe("Approximate number of content pages (3-20)"),
    targetPlatform: z.string().optional().describe("Where it will be listed, e.g. Etsy, Gumroad"),
    notes: z.string().optional().describe("Any extra requirements or constraints"),
  }),
  execute: (input, context: ToolContext) =>
    produce("printable", input, context, "create_printable"),
});

registerTool({
  name: "create_prompt_pack",
  description:
    "Generate a curated, de-duplicated prompt pack for a niche (e.g. '100 prompts for real estate agents') as a formatted print-ready PDF, register it in the Asset Studio with listing copy, and submit it for human review. Never publishes autonomously.",
  inputSchema: z.object({
    niche: z.string().describe("The niche/profession the prompts target, e.g. 'real estate agents'"),
    title: z.string().optional().describe("Optional explicit product title"),
    audience: z.string().optional().describe("Target audience"),
    promptCount: z.number().optional().describe("Approximate number of prompts (20-250)"),
    targetPlatform: z.string().optional().describe("Where it will be listed, e.g. Gumroad, Etsy"),
    notes: z.string().optional().describe("Any extra requirements or themes to include"),
  }),
  execute: (input, context: ToolContext) =>
    produce("prompt_pack", input, context, "create_prompt_pack"),
});

registerTool({
  name: "create_ebook",
  description:
    "Draft a short, high-value e-book/guide on a niche topic end-to-end as a print-ready PDF, register it in the Asset Studio with listing copy, and submit it for human review. Never publishes autonomously.",
  inputSchema: z.object({
    niche: z.string().describe("The e-book topic/niche brief"),
    title: z.string().optional().describe("Optional explicit book title"),
    audience: z.string().optional().describe("Target reader"),
    tone: z.string().optional().describe("Desired tone/voice"),
    pageCount: z.number().optional().describe("Approximate number of chapters (3-12)"),
    targetPlatform: z.string().optional().describe("Where it will be listed, e.g. Amazon KDP, Gumroad"),
    notes: z.string().optional().describe("Any extra requirements, angle, or outline hints"),
  }),
  execute: (input, context: ToolContext) =>
    produce("ebook", input, context, "create_ebook"),
});
