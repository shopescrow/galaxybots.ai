import { Router, type IRouter } from "express";
import {
  db,
  assetsTable,
  assetComplianceChecksTable,
  assetLicenseRecordsTable,
  platformPolicyConfigsTable,
  DISCLOSURE_STATES,
  POLICY_STRICTNESS,
  type LicenseSource,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  runPrePublishGate,
  ensureLicenseRecord,
  resolvePlatformPolicy,
  getLatestCheck,
} from "../services/compliance/pre-publish-gate";

const router: IRouter = Router();

// ---- Recent gate decisions -------------------------------------------------
router.get("/firewall/checks", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const rows = await db
    .select({
      id: assetComplianceChecksTable.id,
      assetId: assetComplianceChecksTable.assetId,
      assetTitle: assetsTable.title,
      targetPlatform: assetComplianceChecksTable.targetPlatform,
      decision: assetComplianceChecksTable.decision,
      reviewStatus: assetComplianceChecksTable.reviewStatus,
      checks: assetComplianceChecksTable.checks,
      reasons: assetComplianceChecksTable.reasons,
      similarityScore: assetComplianceChecksTable.similarityScore,
      matchedAssetId: assetComplianceChecksTable.matchedAssetId,
      matchedAssetTitle: assetComplianceChecksTable.matchedAssetTitle,
      triggeredBy: assetComplianceChecksTable.triggeredBy,
      reviewedBy: assetComplianceChecksTable.reviewedBy,
      reviewedAt: assetComplianceChecksTable.reviewedAt,
      reviewNote: assetComplianceChecksTable.reviewNote,
      createdAt: assetComplianceChecksTable.createdAt,
    })
    .from(assetComplianceChecksTable)
    .leftJoin(assetsTable, eq(assetComplianceChecksTable.assetId, assetsTable.id))
    .where(eq(assetComplianceChecksTable.clientId, clientId))
    .orderBy(desc(assetComplianceChecksTable.createdAt))
    .limit(limit);

  res.json(rows);
});

// ---- Pending-review queue (flagged assets) ---------------------------------
router.get("/firewall/checks/pending", async (req, res): Promise<void> => {
  const clientId = req.user!.clientId;
  const rows = await db
    .select({
      id: assetComplianceChecksTable.id,
      assetId: assetComplianceChecksTable.assetId,
      assetTitle: assetsTable.title,
      assetStatus: assetsTable.status,
      targetPlatform: assetComplianceChecksTable.targetPlatform,
      decision: assetComplianceChecksTable.decision,
      reviewStatus: assetComplianceChecksTable.reviewStatus,
      checks: assetComplianceChecksTable.checks,
      reasons: assetComplianceChecksTable.reasons,
      similarityScore: assetComplianceChecksTable.similarityScore,
      matchedAssetTitle: assetComplianceChecksTable.matchedAssetTitle,
      createdAt: assetComplianceChecksTable.createdAt,
    })
    .from(assetComplianceChecksTable)
    .leftJoin(assetsTable, eq(assetComplianceChecksTable.assetId, assetsTable.id))
    .where(
      and(
        eq(assetComplianceChecksTable.clientId, clientId),
        eq(assetComplianceChecksTable.reviewStatus, "pending_review"),
      ),
    )
    .orderBy(desc(assetComplianceChecksTable.createdAt))
    .limit(200);

  res.json(rows);
});

// ---- Resolve a flagged check (approve / reject) ----------------------------
router.post("/firewall/checks/:id/review", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid check ID" });
    return;
  }
  const { action, note } = req.body as { action?: string; note?: string };
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    return;
  }

  const [check] = await db
    .select()
    .from(assetComplianceChecksTable)
    .where(
      and(
        eq(assetComplianceChecksTable.id, id),
        eq(assetComplianceChecksTable.clientId, req.user!.clientId),
      ),
    );
  if (!check) {
    res.status(404).json({ error: "Check not found" });
    return;
  }
  if (check.reviewStatus === "blocked") {
    res.status(409).json({ error: "Blocked checks cannot be reviewed — the asset must be revised." });
    return;
  }

  const reviewedBy = `user:${req.user!.userId ?? "owner"}`;
  const [updated] = await db
    .update(assetComplianceChecksTable)
    .set({
      reviewStatus: action === "approve" ? "approved" : "rejected",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
    })
    .where(eq(assetComplianceChecksTable.id, id))
    .returning();

  res.json(updated);
});

// ---- On-demand gate run (dry check without publishing) ----------------------
router.post("/firewall/assets/:id/run", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const result = await runPrePublishGate({
    asset,
    triggeredBy: `manual:${req.user!.userId ?? "owner"}`,
  });
  res.json(result);
});

// ---- Per-asset license/rights record ---------------------------------------
router.get("/firewall/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const license = await ensureLicenseRecord(asset);
  const latestCheck = await getLatestCheck(id, req.user!.clientId);
  const { config, effective } = await resolvePlatformPolicy(
    asset.clientId,
    asset.targetPlatform,
  );

  res.json({ asset, license, latestCheck, policy: { config, effective } });
});

router.put("/firewall/assets/:id/license", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid asset ID" });
    return;
  }
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, id), eq(assetsTable.clientId, req.user!.clientId)));
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const { aiGenerated, sourcesUsed, usageRights, disclosureState, disclosureText } =
    req.body as {
      aiGenerated?: boolean;
      sourcesUsed?: LicenseSource[];
      usageRights?: string | null;
      disclosureState?: string;
      disclosureText?: string | null;
    };

  if (disclosureState && !DISCLOSURE_STATES.includes(disclosureState as never)) {
    res.status(400).json({
      error: `Invalid disclosureState. One of: ${DISCLOSURE_STATES.join(", ")}`,
    });
    return;
  }

  const existing = await ensureLicenseRecord(asset);
  const [updated] = await db
    .update(assetLicenseRecordsTable)
    .set({
      aiGenerated: aiGenerated ?? existing.aiGenerated,
      sourcesUsed: Array.isArray(sourcesUsed) ? sourcesUsed : existing.sourcesUsed,
      usageRights: usageRights !== undefined ? usageRights : existing.usageRights,
      disclosureState: disclosureState ?? existing.disclosureState,
      disclosureText:
        disclosureText !== undefined ? disclosureText : existing.disclosureText,
      updatedAt: new Date(),
    })
    .where(eq(assetLicenseRecordsTable.assetId, id))
    .returning();

  res.json(updated);
});

// ---- Per-platform policy configuration (operator-tunable strictness) -------
router.get("/firewall/policies", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(platformPolicyConfigsTable)
    .where(eq(platformPolicyConfigsTable.clientId, req.user!.clientId))
    .orderBy(platformPolicyConfigsTable.platform);
  res.json(rows);
});

router.put("/firewall/policies", async (req, res): Promise<void> => {
  // Configuring platform policy is an admin/owner action.
  if (req.user!.role !== "admin" && req.user!.role !== "owner") {
    res.status(403).json({ error: "Only admins or owners can configure platform policies." });
    return;
  }

  const {
    platform,
    strictness,
    aiContentAllowed,
    disclosureRequired,
    similarityThreshold,
    prohibitedKeywords,
    notes,
  } = req.body as {
    platform?: string;
    strictness?: string;
    aiContentAllowed?: boolean;
    disclosureRequired?: boolean;
    similarityThreshold?: number;
    prohibitedKeywords?: string[];
    notes?: string | null;
  };

  if (!platform || typeof platform !== "string") {
    res.status(400).json({ error: "platform is required" });
    return;
  }
  if (strictness && !POLICY_STRICTNESS.includes(strictness as never)) {
    res.status(400).json({
      error: `Invalid strictness. One of: ${POLICY_STRICTNESS.join(", ")}`,
    });
    return;
  }
  if (
    similarityThreshold !== undefined &&
    (typeof similarityThreshold !== "number" ||
      similarityThreshold < 0 ||
      similarityThreshold > 1)
  ) {
    res.status(400).json({ error: "similarityThreshold must be between 0 and 1" });
    return;
  }

  const clientId = req.user!.clientId;
  const values = {
    clientId,
    platform,
    strictness: strictness ?? "standard",
    aiContentAllowed: aiContentAllowed ?? true,
    disclosureRequired: disclosureRequired ?? true,
    similarityThreshold:
      similarityThreshold !== undefined ? String(similarityThreshold) : "0.72",
    prohibitedKeywords: Array.isArray(prohibitedKeywords) ? prohibitedKeywords : [],
    notes: notes ?? null,
  };

  const [config] = await db
    .insert(platformPolicyConfigsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [platformPolicyConfigsTable.clientId, platformPolicyConfigsTable.platform],
      set: {
        strictness: values.strictness,
        aiContentAllowed: values.aiContentAllowed,
        disclosureRequired: values.disclosureRequired,
        similarityThreshold: values.similarityThreshold,
        prohibitedKeywords: values.prohibitedKeywords,
        notes: values.notes,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(config);
});

router.delete("/firewall/policies/:id", async (req, res): Promise<void> => {
  if (req.user!.role !== "admin" && req.user!.role !== "owner") {
    res.status(403).json({ error: "Only admins or owners can configure platform policies." });
    return;
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid policy ID" });
    return;
  }
  const [deleted] = await db
    .delete(platformPolicyConfigsTable)
    .where(
      and(
        eq(platformPolicyConfigsTable.id, id),
        eq(platformPolicyConfigsTable.clientId, req.user!.clientId),
      ),
    )
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json({ success: true });
});

export function registerFirewallRoutes(parent: IRouter) {
  parent.use(router);
}

export default router;
