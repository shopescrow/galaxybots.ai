import { Router, type IRouter } from "express";
import { db, aeoScanRequestsTable, platformApiKeysTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";
import { dispatchScanToPirateMonster } from "../../../services/partner/piratemonster-client";

const router: IRouter = Router();

router.post("/aeo/scan/request", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const orgClientId = req.user?.clientId;
  if (!orgClientId) {
    res.status(403).json({ error: "No organization context found." });
    return;
  }

  const [partnerKey] = await db
    .select({ id: platformApiKeysTable.id })
    .from(platformApiKeysTable)
    .where(
      and(
        eq(platformApiKeysTable.platform, "piratemonster_mcp"),
        eq(platformApiKeysTable.status, "active"),
        eq(platformApiKeysTable.clientId, orgClientId)
      )
    )
    .limit(1);

  if (!partnerKey) {
    res.status(422).json({ error: "No active PirateMonster integration found for your organization. Configure it in Integrations to enable AEO scans." });
    return;
  }

  const [scanRequest] = await db.insert(aeoScanRequestsTable).values({
    partnerKeyId: partnerKey.id,
    url: url.trim(),
    status: "queued",
  }).returning();

  const dispatch = await dispatchScanToPirateMonster(scanRequest.id, url.trim());
  if (dispatch.success) {
    await db
      .update(aeoScanRequestsTable)
      .set({ status: "processing" })
      .where(eq(aeoScanRequestsTable.id, scanRequest.id));
  } else {
    console.warn(`[PM] Immediate scan dispatch failed for request ${scanRequest.id}: ${dispatch.error} — will retry via background queue`);
  }

  res.json({ success: true, message: "AEO scan queued. Results will appear in the AEO Intelligence tab once processing completes.", requestId: scanRequest.id });
});

router.get("/integrations/piratemonster/pending-scans/:clientId", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  const clientId = Number(req.params.clientId);
  if (isNaN(clientId)) {
    res.status(400).json({ error: "Invalid client ID" });
    return;
  }

  try {
    const partnerKeys = await db
      .select({ id: platformApiKeysTable.id })
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.platform, "piratemonster_mcp"),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.clientId, clientId)
        )
      );

    if (partnerKeys.length === 0) {
      res.json({ pendingCount: 0 });
      return;
    }

    const keyIds = partnerKeys.map(k => k.id);
    const pending = await db
      .select({ id: aeoScanRequestsTable.id })
      .from(aeoScanRequestsTable)
      .where(
        and(
          inArray(aeoScanRequestsTable.partnerKeyId, keyIds),
          or(
            eq(aeoScanRequestsTable.status, "queued"),
            eq(aeoScanRequestsTable.status, "processing")
          )
        )
      );

    res.json({ pendingCount: pending.length });
  } catch (err) {
    console.error("Error fetching pending scans:", err);
    res.status(500).json({ error: "Failed to fetch pending scans" });
  }
});

export default router;
