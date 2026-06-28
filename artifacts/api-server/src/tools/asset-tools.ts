import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import {
  db,
  assetsTable,
  assetFilesTable,
  assetRevenueTable,
  ASSET_TYPES,
  ASSET_FILE_KINDS,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Asset tools require a client context");
  }
  return context.clientId;
}

function appendStatus(
  history: AssetStatusEvent[] | null | undefined,
  status: AssetStatus,
  changedBy: string,
  note?: string,
): AssetStatusEvent[] {
  return [
    ...(history ?? []),
    { status, changedBy, note, at: new Date().toISOString() },
  ];
}

async function loadOwnedAsset(assetId: number, clientId: number) {
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, assetId), eq(assetsTable.clientId, clientId)));
  return asset;
}

registerTool({
  name: "create_asset",
  description:
    "Create a new digital asset record in the Asset Studio portfolio (idea stage). Use this to register an income-producing asset you intend to produce (printable, video, micro-SaaS, data product, visual, etc.). Returns the created asset id.",
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title of the asset"),
    type: z
      .enum(ASSET_TYPES)
      .optional()
      .describe("Asset category; defaults to 'other'"),
    description: z.string().optional().describe("What the asset is and the problem it solves"),
    niche: z.string().optional().describe("The specific niche/audience this targets"),
    targetPlatform: z
      .string()
      .optional()
      .describe("Where it will be distributed, e.g. Gumroad, Etsy, KDP, YouTube"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const [asset] = await db
      .insert(assetsTable)
      .values({
        clientId,
        botId: context.botId ?? null,
        title: input.title,
        type: input.type ?? "other",
        description: input.description ?? null,
        niche: input.niche ?? null,
        targetPlatform: input.targetPlatform ?? null,
        status: "idea",
        statusHistory: appendStatus(
          [],
          "idea",
          `bot:${context.botName ?? context.botId ?? "creator"}`,
          "created via tool",
        ),
      })
      .returning();
    return {
      assetId: asset.id,
      status: asset.status,
      message: `Asset "${asset.title}" created at idea stage.`,
    };
  },
});

registerTool({
  name: "attach_asset_file",
  description:
    "Attach a generated/produced file (already uploaded to object storage) to an asset. Provide the normalized object path and a human file name. Returns the file id.",
  inputSchema: z.object({
    assetId: z.number().describe("The asset to attach the file to"),
    fileName: z.string().describe("Human-readable file name, e.g. 'adhd-planner.pdf'"),
    objectPath: z
      .string()
      .describe("Object-storage path or URL returned from the upload step"),
    kind: z.enum(ASSET_FILE_KINDS).optional().describe("File kind; defaults to 'other'"),
    contentType: z.string().optional().describe("MIME type, e.g. application/pdf"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const asset = await loadOwnedAsset(input.assetId, clientId);
    if (!asset) throw new Error("Asset not found for this client");
    const [file] = await db
      .insert(assetFilesTable)
      .values({
        assetId: input.assetId,
        clientId,
        kind: input.kind ?? "other",
        fileName: input.fileName,
        objectPath: input.objectPath,
        contentType: input.contentType ?? null,
      })
      .returning();
    return { fileId: file.id, message: `Attached "${file.fileName}" to asset ${input.assetId}.` };
  },
});

registerTool({
  name: "submit_asset_for_review",
  description:
    "Submit an asset for human review (moves it to the 'in_review' stage). Use this once the asset's files are produced and ready. A human must approve before it can be published.",
  inputSchema: z.object({
    assetId: z.number().describe("The asset to submit for review"),
    note: z.string().optional().describe("Optional note for the reviewer"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const asset = await loadOwnedAsset(input.assetId, clientId);
    if (!asset) throw new Error("Asset not found for this client");
    const changedBy = `bot:${context.botName ?? context.botId ?? "creator"}`;
    const [updated] = await db
      .update(assetsTable)
      .set({
        status: "in_review",
        statusHistory: appendStatus(asset.statusHistory, "in_review", changedBy, input.note),
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, input.assetId))
      .returning();
    return {
      assetId: updated.id,
      status: updated.status,
      message: "Asset submitted for review. Awaiting human approval before publishing.",
    };
  },
});

registerTool({
  name: "mark_asset_published",
  description:
    "Request publishing of an asset. NOTE: bots cannot publish autonomously — publishing is gated behind explicit human approval. This tool ensures the asset is in review and flags it as awaiting approval; it does NOT change the asset to published.",
  inputSchema: z.object({
    assetId: z.number().describe("The asset to request publishing for"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const asset = await loadOwnedAsset(input.assetId, clientId);
    if (!asset) throw new Error("Asset not found for this client");
    if (asset.status !== "in_review") {
      const changedBy = `bot:${context.botName ?? context.botId ?? "creator"}`;
      await db
        .update(assetsTable)
        .set({
          status: "in_review",
          statusHistory: appendStatus(
            asset.statusHistory,
            "in_review",
            changedBy,
            "auto-submitted for publish request",
          ),
          updatedAt: new Date(),
        })
        .where(eq(assetsTable.id, input.assetId));
    }
    return {
      assetId: input.assetId,
      requiresApproval: true,
      message:
        "Publishing requires human approval. The asset is in review and awaiting owner sign-off.",
    };
  },
});

registerTool({
  name: "log_asset_revenue",
  description:
    "Log a revenue event for an asset (e.g. a sale, ad payout, affiliate commission). Updates the asset's revenue-to-date. Use realized earnings only.",
  inputSchema: z.object({
    assetId: z.number().describe("The asset that earned revenue"),
    source: z.string().describe("Where the revenue came from, e.g. 'Gumroad sale', 'YouTube ads'"),
    amount: z.number().describe("Revenue amount"),
    currency: z.string().optional().describe("Currency code; defaults to USD"),
    note: z.string().optional(),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const asset = await loadOwnedAsset(input.assetId, clientId);
    if (!asset) throw new Error("Asset not found for this client");
    await db.insert(assetRevenueTable).values({
      assetId: input.assetId,
      clientId,
      source: input.source,
      amount: String(input.amount),
      currency: input.currency ?? "USD",
      note: input.note ?? null,
    });
    const [updated] = await db
      .update(assetsTable)
      .set({
        revenueToDate: sql`${assetsTable.revenueToDate} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, input.assetId))
      .returning();
    return {
      assetId: input.assetId,
      revenueToDate: updated.revenueToDate,
      message: `Logged ${input.currency ?? "USD"} ${input.amount} for asset ${input.assetId}.`,
    };
  },
});

registerTool({
  name: "list_portfolio",
  description:
    "List the asset portfolio for the current client, optionally filtered by status. Returns a compact summary of assets with type, status and revenue-to-date.",
  inputSchema: z.object({
    status: z.string().optional().describe("Optional status filter, e.g. 'in_review'"),
    limit: z.number().optional().describe("Max assets to return (default 50)"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const conditions = [eq(assetsTable.clientId, clientId)];
    if (input.status) conditions.push(eq(assetsTable.status, input.status));
    const assets = await db
      .select({
        id: assetsTable.id,
        title: assetsTable.title,
        type: assetsTable.type,
        status: assetsTable.status,
        niche: assetsTable.niche,
        revenueToDate: assetsTable.revenueToDate,
      })
      .from(assetsTable)
      .where(and(...conditions))
      .limit(input.limit ?? 50);
    return { count: assets.length, assets };
  },
});
