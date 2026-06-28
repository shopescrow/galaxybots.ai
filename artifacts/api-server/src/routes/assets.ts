import { Router, type IRouter } from "express";
import {
  db,
  assetsTable,
  assetFilesTable,
  assetListingsTable,
  assetRevenueTable,
  botsTable,
  clientBotsTable,
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_FILE_KINDS,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";
import { eq, desc, and, ilike, sql, SQL } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

// Lifecycle transitions a bot/user may request directly. Moving an asset to
// "published" is gated behind explicit human approval (see /status endpoint).
const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  idea: ["draft", "archived"],
  draft: ["in_review", "archived"],
  in_review: ["published", "draft", "archived"],
  published: ["tracking", "archived"],
  tracking: ["published", "archived"],
  archived: ["draft"],
};

async function validateBotOwnership(
  botId: number,
  clientId: number,
): Promise<boolean> {
  const [assignment] = await db
    .select()
    .from(clientBotsTable)
    .where(
      and(
        eq(clientBotsTable.botId, botId),
        eq(clientBotsTable.clientId, clientId),
      ),
    );
  return !!assignment;
}

function pushStatusEvent(
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

const router: IRouter = Router();

// ---- Portfolio overview rollup ---------------------------------------------
router.get("/assets/portfolio", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;

  const rows = await db
    .select({
      type: assetsTable.type,
      status: assetsTable.status,
      count: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${assetsTable.revenueToDate}), 0)`,
    })
    .from(assetsTable)
    .where(eq(assetsTable.clientId, clientId))
    .groupBy(assetsTable.type, assetsTable.status);

  let total = 0;
  let published = 0;
  let totalRevenue = 0;
  const byType: Record<string, { count: number; revenue: number }> = {};
  const byStatus: Record<string, number> = {};

  for (const r of rows) {
    const count = Number(r.count) || 0;
    const revenue = Number(r.revenue) || 0;
    total += count;
    totalRevenue += revenue;
    if (r.status === "published" || r.status === "tracking") published += count;
    byType[r.type] = byType[r.type] || { count: 0, revenue: 0 };
    byType[r.type].count += count;
    byType[r.type].revenue += revenue;
    byStatus[r.status] = (byStatus[r.status] || 0) + count;
  }

  res.json({
    totals: { total, published, revenue: totalRevenue },
    byType,
    byStatus,
  });
});

// ---- Object-storage upload URL ---------------------------------------------
router.post("/assets/upload-url", async (req, res): Promise<void> => {
  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL(
      `assets/${req.user!.clientId}`,
    );
    res.json({ uploadURL });
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : "Upload URL failed" });
  }
});

// ---- List assets -----------------------------------------------------------
router.get("/assets", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { type, status, botId, search } = req.query;

  const conditions: SQL[] = [eq(assetsTable.clientId, clientId)];
  if (type) conditions.push(eq(assetsTable.type, type as string));
  if (status) conditions.push(eq(assetsTable.status, status as string));
  if (botId) conditions.push(eq(assetsTable.botId, parseInt(botId as string)));
  if (search) conditions.push(ilike(assetsTable.title, `%${search}%`));

  const assets = await db
    .select({
      id: assetsTable.id,
      clientId: assetsTable.clientId,
      botId: assetsTable.botId,
      managerBotId: assetsTable.managerBotId,
      type: assetsTable.type,
      title: assetsTable.title,
      description: assetsTable.description,
      niche: assetsTable.niche,
      status: assetsTable.status,
      targetPlatform: assetsTable.targetPlatform,
      revenueToDate: assetsTable.revenueToDate,
      publishedAt: assetsTable.publishedAt,
      lastReviewedAt: assetsTable.lastReviewedAt,
      createdAt: assetsTable.createdAt,
      updatedAt: assetsTable.updatedAt,
      botName: botsTable.name,
    })
    .from(assetsTable)
    .leftJoin(botsTable, eq(assetsTable.botId, botsTable.id))
    .where(and(...conditions))
    .orderBy(desc(assetsTable.updatedAt))
    .limit(200);

  res.json(assets);
});

// ---- Asset detail (with files, listings, revenue) --------------------------
router.get("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const [files, listings, revenue] = await Promise.all([
    db
      .select()
      .from(assetFilesTable)
      .where(eq(assetFilesTable.assetId, id))
      .orderBy(desc(assetFilesTable.createdAt)),
    db
      .select()
      .from(assetListingsTable)
      .where(eq(assetListingsTable.assetId, id))
      .orderBy(desc(assetListingsTable.createdAt)),
    db
      .select()
      .from(assetRevenueTable)
      .where(eq(assetRevenueTable.assetId, id))
      .orderBy(desc(assetRevenueTable.occurredAt))
      .limit(100),
  ]);

  res.json({ ...asset, files, listings, revenue });
});

// ---- Create asset ----------------------------------------------------------
router.post("/assets", async (req, res): Promise<void> => {
  const { title, type, description, niche, targetPlatform, botId, managerBotId, metadata } =
    req.body;

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "Title is required" });
    return;
  }
  if (title.length > 500) {
    res.status(400).json({ error: "Title too long" });
    return;
  }
  if (type && !ASSET_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. One of: ${ASSET_TYPES.join(", ")}` });
    return;
  }
  if (botId && !(await validateBotOwnership(botId, req.user!.clientId))) {
    res.status(403).json({ error: "Bot not assigned to your organization" });
    return;
  }
  if (managerBotId && !(await validateBotOwnership(managerBotId, req.user!.clientId))) {
    res.status(403).json({ error: "Manager bot not assigned to your organization" });
    return;
  }

  const [asset] = await db
    .insert(assetsTable)
    .values({
      clientId: req.user!.clientId,
      title,
      type: type || "other",
      description: description || null,
      niche: niche || null,
      targetPlatform: targetPlatform || null,
      botId: botId || null,
      managerBotId: managerBotId || null,
      metadata: metadata || {},
      status: "idea",
      statusHistory: pushStatusEvent([], "idea", "user", "created"),
    })
    .returning();

  res.status(201).json(asset);
});

// ---- Update asset (non-status fields) --------------------------------------
router.put("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );
  if (!existing) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const { title, description, niche, type, targetPlatform, managerBotId, metadata } =
    req.body;
  if (type && !ASSET_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. One of: ${ASSET_TYPES.join(", ")}` });
    return;
  }
  if (
    managerBotId !== undefined &&
    managerBotId !== null &&
    !(await validateBotOwnership(managerBotId, req.user!.clientId))
  ) {
    res.status(403).json({ error: "Manager bot not found or not owned by this client" });
    return;
  }

  const [updated] = await db
    .update(assetsTable)
    .set({
      title: title ?? existing.title,
      description: description ?? existing.description,
      niche: niche ?? existing.niche,
      type: type ?? existing.type,
      targetPlatform: targetPlatform ?? existing.targetPlatform,
      managerBotId: managerBotId ?? existing.managerBotId,
      metadata: metadata ?? existing.metadata,
      updatedAt: new Date(),
    })
    .where(eq(assetsTable.id, id))
    .returning();

  res.json(updated);
});

// ---- Lifecycle transition (approval-gated for "published") -----------------
router.post("/assets/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const { status, note, approve } = req.body as {
    status?: AssetStatus;
    note?: string;
    approve?: boolean;
  };
  if (!status || !ASSET_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. One of: ${ASSET_STATUSES.join(", ")}` });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const current = asset.status as AssetStatus;
  if (status !== current && !ALLOWED_TRANSITIONS[current]?.includes(status)) {
    res.status(409).json({
      error: `Cannot move asset from "${current}" to "${status}".`,
      allowed: ALLOWED_TRANSITIONS[current] ?? [],
    });
    return;
  }

  // Human-approval gate: publishing requires explicit sign-off.
  if (status === "published" && approve !== true) {
    res.status(403).json({
      error: "Publishing requires explicit approval. Resend with approve: true.",
      requiresApproval: true,
    });
    return;
  }

  const changedBy = `user:${req.user!.userId ?? "owner"}`;
  const [updated] = await db
    .update(assetsTable)
    .set({
      status,
      statusHistory: pushStatusEvent(asset.statusHistory, status, changedBy, note),
      publishedAt: status === "published" ? new Date() : asset.publishedAt,
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(assetsTable.id, id))
    .returning();

  res.json(updated);
});

// ---- Attach a generated file (object-storage path) -------------------------
router.post("/assets/:id/files", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const { fileName, objectPath, kind, contentType, sizeBytes } = req.body;
  if (!fileName || !objectPath) {
    res.status(400).json({ error: "fileName and objectPath are required" });
    return;
  }
  if (kind && !ASSET_FILE_KINDS.includes(kind)) {
    res.status(400).json({ error: `Invalid kind. One of: ${ASSET_FILE_KINDS.join(", ")}` });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const normalized = objectStorage.normalizeObjectEntityPath(objectPath);
  const [file] = await db
    .insert(assetFilesTable)
    .values({
      assetId: id,
      clientId: req.user!.clientId,
      kind: kind || "other",
      fileName,
      objectPath: normalized,
      contentType: contentType || null,
      sizeBytes: typeof sizeBytes === "number" ? sizeBytes : null,
    })
    .returning();

  res.status(201).json(file);
});

// ---- Download a stored file ------------------------------------------------
router.get("/assets/:id/files/:fileId/download", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const fileId = parseInt(req.params.fileId);
  if (isNaN(id) || isNaN(fileId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [file] = await db
    .select()
    .from(assetFilesTable)
    .where(
      and(
        eq(assetFilesTable.id, fileId),
        eq(assetFilesTable.assetId, id),
        eq(assetFilesTable.clientId, req.user!.clientId),
      ),
    );
  if (!file) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(file.objectPath);
    const downloadResponse = await objectStorage.downloadObject(objectFile);
    res.setHeader(
      "Content-Type",
      downloadResponse.headers.get("Content-Type") || "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    );
    const arrayBuffer = await downloadResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch {
    res.status(404).json({ error: "Stored file not found" });
  }
});

// ---- Listings --------------------------------------------------------------
router.post("/assets/:id/listings", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const { platform, externalUrl, externalId, listingStatus, price, currency } =
    req.body;
  if (!platform || typeof platform !== "string") {
    res.status(400).json({ error: "platform is required" });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const [listing] = await db
    .insert(assetListingsTable)
    .values({
      assetId: id,
      clientId: req.user!.clientId,
      platform,
      externalUrl: externalUrl || null,
      externalId: externalId || null,
      listingStatus: listingStatus || "planned",
      price: price != null ? String(price) : null,
      currency: currency || "USD",
    })
    .returning();

  res.status(201).json(listing);
});

// ---- Revenue (logging updates the asset's revenue-to-date) ------------------
router.post("/assets/:id/revenue", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const { source, amount, currency, note, listingId, occurredAt } = req.body;
  const numericAmount = Number(amount);
  if (!source || typeof source !== "string") {
    res.status(400).json({ error: "source is required" });
    return;
  }
  if (!isFinite(numericAmount)) {
    res.status(400).json({ error: "amount must be a number" });
    return;
  }

  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    );
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  if (listingId !== undefined && listingId !== null) {
    const [listing] = await db
      .select({ id: assetListingsTable.id })
      .from(assetListingsTable)
      .where(
        and(
          eq(assetListingsTable.id, listingId),
          eq(assetListingsTable.assetId, id),
        ),
      );
    if (!listing) {
      res.status(400).json({ error: "listingId does not belong to this asset" });
      return;
    }
  }

  const [entry] = await db
    .insert(assetRevenueTable)
    .values({
      assetId: id,
      clientId: req.user!.clientId,
      listingId: listingId || null,
      source,
      amount: String(numericAmount),
      currency: currency || "USD",
      note: note || null,
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    })
    .returning();

  const [updated] = await db
    .update(assetsTable)
    .set({
      revenueToDate: sql`${assetsTable.revenueToDate} + ${numericAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(assetsTable.id, id))
    .returning();

  res.status(201).json({ entry, revenueToDate: updated.revenueToDate });
});

// ---- Delete asset ----------------------------------------------------------
router.delete("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }

  const [deleted] = await db
    .delete(assetsTable)
    .where(
      and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }
  res.json({ success: true });
});

export function registerAssetRoutes(parent: IRouter) {
  parent.use(router);
}

export default router;
