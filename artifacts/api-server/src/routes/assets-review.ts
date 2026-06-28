import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  assetsTable,
  assetFilesTable,
  botsTable,
  confidenceConfigsTable,
  assetAutonomyConfigsTable,
  assetAutoPublishLogTable,
  AUTONOMY_SCOPE_ANY,
  ASSET_TYPES,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";
import { eq, and, desc, inArray, sql, SQL } from "drizzle-orm";
import {
  computeAssetConfidence,
  readComplianceFromAsset,
} from "../services/assets/confidence";
import {
  loadAutonomyConfigs,
  resolveAutonomyConfig,
  evaluateAutonomy,
} from "../services/assets/autonomy";

const router: IRouter = Router();

function requireOperator(req: Request, res: Response): boolean {
  const role = req.user?.role;
  if (role !== "owner" && role !== "admin") {
    res.status(403).json({ error: "Operator (owner/admin) access required." });
    return false;
  }
  return true;
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

// ---- Review queue: pending assets with confidence + compliance -------------
router.get("/assets/review/queue", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { type, platform, search } = req.query;

  const conditions: SQL[] = [
    eq(assetsTable.clientId, clientId),
    eq(assetsTable.status, "in_review"),
  ];
  if (type) conditions.push(eq(assetsTable.type, type as string));
  if (platform)
    conditions.push(eq(assetsTable.targetPlatform, platform as string));

  const assets = await db
    .select({
      asset: assetsTable,
      botName: botsTable.name,
    })
    .from(assetsTable)
    .leftJoin(botsTable, eq(assetsTable.botId, botsTable.id))
    .where(and(...conditions))
    .orderBy(desc(assetsTable.updatedAt))
    .limit(300);

  const searchTerm =
    typeof search === "string" ? search.trim().toLowerCase() : "";
  const filtered = searchTerm
    ? assets.filter((r) =>
        r.asset.title.toLowerCase().includes(searchTerm),
      )
    : assets;

  const assetIds = filtered.map((r) => r.asset.id);
  const fileRows = assetIds.length
    ? await db
        .select({ id: assetFilesTable.id, assetId: assetFilesTable.assetId })
        .from(assetFilesTable)
        .where(inArray(assetFilesTable.assetId, assetIds))
    : [];
  const filesByAsset = new Map<number, { id: number }[]>();
  for (const f of fileRows) {
    const list = filesByAsset.get(f.assetId) ?? [];
    list.push({ id: f.id });
    filesByAsset.set(f.assetId, list);
  }

  const [configs, [confidenceConfig]] = await Promise.all([
    loadAutonomyConfigs(clientId),
    db
      .select()
      .from(confidenceConfigsTable)
      .where(eq(confidenceConfigsTable.clientId, clientId)),
  ]);
  const reviewSlaHours = confidenceConfig?.reviewSlaHours ?? 24;

  const now = Date.now();
  const items = filtered.map((r) => {
    const a = r.asset;
    const files = filesByAsset.get(a.id) ?? [];
    const confidence = computeAssetConfidence(a, files);
    const config = resolveAutonomyConfig(configs, a.type, a.targetPlatform);
    const decision = evaluateAutonomy({
      config,
      confidenceScore: confidence.score,
      complianceStatus: confidence.complianceStatus,
    });

    // SLA tracking via confidence-configs.reviewSlaHours.
    const enteredReview =
      (a.statusHistory ?? [])
        .filter((h) => h.status === "in_review")
        .map((h) => new Date(h.at).getTime())
        .pop() ?? new Date(a.updatedAt).getTime();
    const hoursInReview = (now - enteredReview) / 3_600_000;
    const slaOverdue = hoursInReview > reviewSlaHours;

    return {
      id: a.id,
      title: a.title,
      type: a.type,
      description: a.description,
      niche: a.niche,
      targetPlatform: a.targetPlatform,
      status: a.status,
      botId: a.botId,
      botName: r.botName,
      fileCount: files.length,
      revenueToDate: a.revenueToDate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      confidenceScore: confidence.score,
      confidenceFactors: confidence.factors,
      complianceStatus: confidence.complianceStatus,
      complianceIssues: confidence.complianceIssues,
      autoPublishEligible: decision.eligible,
      autonomyReason: decision.reason,
      thresholdUsed: decision.thresholdUsed,
      hoursInReview: Math.round(hoursInReview * 10) / 10,
      slaOverdue,
    };
  });

  res.json({ items, reviewSlaHours });
});

// ---- Bulk review actions: approve / reject / revise ------------------------
const BULK_ACTIONS = ["approve", "reject", "revise"] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];
const BULK_TARGET_STATUS: Record<BulkAction, AssetStatus> = {
  approve: "published",
  reject: "archived",
  revise: "draft",
};

router.post("/assets/review/bulk", async (req, res): Promise<void> => {
  if (!requireOperator(req, res)) return;
  const clientId = req.user!.clientId;
  const { ids, action, note } = req.body as {
    ids?: unknown;
    action?: string;
    note?: string;
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids must be a non-empty array." });
    return;
  }
  if (ids.length > 200) {
    res.status(400).json({ error: "Cannot process more than 200 at once." });
    return;
  }
  const numericIds = ids
    .map((i) => Number(i))
    .filter((i) => Number.isInteger(i));
  if (numericIds.length === 0) {
    res.status(400).json({ error: "No valid ids supplied." });
    return;
  }
  if (!action || !BULK_ACTIONS.includes(action as BulkAction)) {
    res
      .status(400)
      .json({ error: `action must be one of: ${BULK_ACTIONS.join(", ")}` });
    return;
  }
  const target = BULK_TARGET_STATUS[action as BulkAction];

  const rows = await db
    .select()
    .from(assetsTable)
    .where(
      and(
        eq(assetsTable.clientId, clientId),
        inArray(assetsTable.id, numericIds),
        eq(assetsTable.status, "in_review"),
      ),
    );

  const changedBy = `user:${req.user!.userId ?? "owner"}`;
  const updated: number[] = [];
  for (const asset of rows) {
    await db
      .update(assetsTable)
      .set({
        status: target,
        statusHistory: pushStatusEvent(
          asset.statusHistory,
          target,
          changedBy,
          note,
        ),
        publishedAt: target === "published" ? new Date() : asset.publishedAt,
        lastReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, asset.id));
    updated.push(asset.id);
  }

  const skipped = numericIds.filter((id) => !updated.includes(id));
  res.json({ action, updated, skipped });
});

// ---- Autonomy threshold configuration --------------------------------------
router.get("/assets/autonomy/configs", async (req, res): Promise<void> => {
  const configs = await loadAutonomyConfigs(req.user!.clientId);
  res.json(configs);
});

router.put("/assets/autonomy/configs", async (req, res): Promise<void> => {
  if (!requireOperator(req, res)) return;
  const clientId = req.user!.clientId;
  const {
    assetType,
    targetPlatform,
    autoPublishEnabled,
    confidenceThreshold,
    requireCompliancePass,
  } = req.body as Record<string, unknown>;

  const type =
    typeof assetType === "string" && assetType ? assetType : AUTONOMY_SCOPE_ANY;
  const platform =
    typeof targetPlatform === "string" && targetPlatform
      ? targetPlatform
      : AUTONOMY_SCOPE_ANY;
  if (type !== AUTONOMY_SCOPE_ANY && !ASSET_TYPES.includes(type as never)) {
    res
      .status(400)
      .json({ error: `Invalid asset type. One of: ${ASSET_TYPES.join(", ")}` });
    return;
  }
  const threshold = Number(confidenceThreshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    res
      .status(400)
      .json({ error: "confidenceThreshold must be between 0 and 100." });
    return;
  }

  const [config] = await db
    .insert(assetAutonomyConfigsTable)
    .values({
      clientId,
      assetType: type,
      targetPlatform: platform,
      autoPublishEnabled: Boolean(autoPublishEnabled),
      confidenceThreshold: Math.round(threshold),
      requireCompliancePass: requireCompliancePass !== false,
    })
    .onConflictDoUpdate({
      target: [
        assetAutonomyConfigsTable.clientId,
        assetAutonomyConfigsTable.assetType,
        assetAutonomyConfigsTable.targetPlatform,
      ],
      set: {
        autoPublishEnabled: Boolean(autoPublishEnabled),
        confidenceThreshold: Math.round(threshold),
        requireCompliancePass: requireCompliancePass !== false,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(config);
});

router.delete(
  "/assets/autonomy/configs/:id",
  async (req, res): Promise<void> => {
    if (!requireOperator(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid config ID" });
      return;
    }
    const [deleted] = await db
      .delete(assetAutonomyConfigsTable)
      .where(
        and(
          eq(assetAutonomyConfigsTable.id, id),
          eq(assetAutonomyConfigsTable.clientId, req.user!.clientId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json({ success: true });
  },
);

// ---- Autonomy sweep: auto-publish eligible in-review assets -----------------
router.post("/assets/autonomy/run", async (req, res): Promise<void> => {
  if (!requireOperator(req, res)) return;
  const clientId = req.user!.clientId;

  const configs = await loadAutonomyConfigs(clientId);
  if (!configs.some((c) => c.autoPublishEnabled)) {
    res.json({ published: [], skipped: [], message: "No autonomy rules enabled." });
    return;
  }

  const rows = await db
    .select()
    .from(assetsTable)
    .where(
      and(
        eq(assetsTable.clientId, clientId),
        eq(assetsTable.status, "in_review"),
      ),
    )
    .limit(500);

  const assetIds = rows.map((r) => r.id);
  const fileRows = assetIds.length
    ? await db
        .select({ id: assetFilesTable.id, assetId: assetFilesTable.assetId })
        .from(assetFilesTable)
        .where(inArray(assetFilesTable.assetId, assetIds))
    : [];
  const filesByAsset = new Map<number, { id: number }[]>();
  for (const f of fileRows) {
    const list = filesByAsset.get(f.assetId) ?? [];
    list.push({ id: f.id });
    filesByAsset.set(f.assetId, list);
  }

  const published: Array<{ id: number; title: string; score: number }> = [];
  const skipped: Array<{ id: number; reason: string }> = [];

  for (const asset of rows) {
    const files = filesByAsset.get(asset.id) ?? [];
    const confidence = computeAssetConfidence(asset, files);
    const config = resolveAutonomyConfig(
      configs,
      asset.type,
      asset.targetPlatform,
    );
    const decision = evaluateAutonomy({
      config,
      confidenceScore: confidence.score,
      complianceStatus: confidence.complianceStatus,
    });
    if (!decision.eligible) {
      skipped.push({ id: asset.id, reason: decision.reason });
      continue;
    }

    await db
      .update(assetsTable)
      .set({
        status: "published",
        statusHistory: pushStatusEvent(
          asset.statusHistory,
          "published",
          "autonomy:auto-publish",
          `Auto-published at confidence ${confidence.score} (threshold ${decision.thresholdUsed}).`,
        ),
        publishedAt: new Date(),
        lastReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, asset.id));

    await db.insert(assetAutoPublishLogTable).values({
      clientId,
      assetId: asset.id,
      assetTitle: asset.title,
      assetType: asset.type,
      targetPlatform: asset.targetPlatform,
      confidenceScore: confidence.score,
      thresholdUsed: decision.thresholdUsed ?? 0,
      complianceStatus: confidence.complianceStatus,
      confidenceFactors: { factors: confidence.factors },
      previousStatus: "in_review",
    });

    published.push({ id: asset.id, title: asset.title, score: confidence.score });
  }

  res.json({ published, skipped });
});

// ---- Auto-publish audit trail ----------------------------------------------
router.get("/assets/autonomy/audit", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const { rolledBack } = req.query;

  const conditions: SQL[] = [eq(assetAutoPublishLogTable.clientId, clientId)];
  if (rolledBack === "true")
    conditions.push(eq(assetAutoPublishLogTable.rolledBack, true));
  if (rolledBack === "false")
    conditions.push(eq(assetAutoPublishLogTable.rolledBack, false));

  const entries = await db
    .select()
    .from(assetAutoPublishLogTable)
    .where(and(...conditions))
    .orderBy(desc(assetAutoPublishLogTable.createdAt))
    .limit(200);

  res.json(entries);
});

// ---- Rollback a spot-checked auto-published asset --------------------------
router.post(
  "/assets/autonomy/audit/:id/rollback",
  async (req, res): Promise<void> => {
    if (!requireOperator(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid audit entry ID" });
      return;
    }
    const { reason } = req.body as { reason?: string };

    const [entry] = await db
      .select()
      .from(assetAutoPublishLogTable)
      .where(
        and(
          eq(assetAutoPublishLogTable.id, id),
          eq(assetAutoPublishLogTable.clientId, req.user!.clientId),
        ),
      );
    if (!entry) {
      res.status(404).json({ error: "Audit entry not found" });
      return;
    }
    if (entry.rolledBack) {
      res.status(409).json({ error: "Already rolled back." });
      return;
    }

    const restoreStatus = (entry.previousStatus as AssetStatus) || "in_review";

    if (entry.assetId != null) {
      const [asset] = await db
        .select()
        .from(assetsTable)
        .where(
          and(
            eq(assetsTable.id, entry.assetId),
            eq(assetsTable.clientId, req.user!.clientId),
          ),
        );
      if (asset) {
        await db
          .update(assetsTable)
          .set({
            status: restoreStatus,
            statusHistory: pushStatusEvent(
              asset.statusHistory,
              restoreStatus,
              `user:${req.user!.userId ?? "owner"}`,
              reason
                ? `Rolled back auto-publish: ${reason}`
                : "Rolled back auto-publish.",
            ),
            publishedAt: null,
            lastReviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(assetsTable.id, asset.id));
      }
    }

    const [updatedEntry] = await db
      .update(assetAutoPublishLogTable)
      .set({
        rolledBack: true,
        rolledBackAt: new Date(),
        rolledBackBy: req.user!.userId ?? null,
        rollbackReason: reason || null,
      })
      .where(eq(assetAutoPublishLogTable.id, id))
      .returning();

    res.json(updatedEntry);
  },
);

export function registerAssetReviewRoutes(parent: IRouter) {
  parent.use(router);
}

export default router;
