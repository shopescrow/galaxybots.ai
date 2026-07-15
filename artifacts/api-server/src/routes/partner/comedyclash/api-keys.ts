import { Router, type IRouter } from "express";
import { db, platformApiKeysTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";
import crypto from "node:crypto";

const router: IRouter = Router();

router.post("/integrations/comedyclash/api-keys", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const { label, rateLimit } = req.body || {};

    const rawKey = `cck_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const clientId = req.user!.clientId;

    const [key] = await db.insert(platformApiKeysTable).values({
      platform: "comedyclash",
      label: label || null,
      keyHash,
      clientId,
      status: "active",
      rateLimit: rateLimit || 100,
    }).returning();

    res.status(201).json({
      id: key.id,
      key: rawKey,
      label: key.label,
      rateLimit: key.rateLimit,
      status: key.status,
      createdAt: key.createdAt.toISOString(),
      warning: "Store this key securely. It will not be shown again.",
    });
  } catch (err) {
    console.error("[CC] Error creating API key:", err);
    res.status(500).json({ error: "Failed to create ComedyClash API key" });
  }
});

router.get("/integrations/comedyclash/api-keys", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const keys = await db
      .select({
        id: platformApiKeysTable.id,
        label: platformApiKeysTable.label,
        status: platformApiKeysTable.status,
        rateLimit: platformApiKeysTable.rateLimit,
        allowedTools: platformApiKeysTable.allowedTools,
        createdAt: platformApiKeysTable.createdAt,
        revokedAt: platformApiKeysTable.revokedAt,
        requestCount: platformApiKeysTable.requestCount,
      })
      .from(platformApiKeysTable)
      .where(and(
        eq(platformApiKeysTable.platform, "comedyclash"),
        eq(platformApiKeysTable.clientId, clientId),
      ))
      .orderBy(desc(platformApiKeysTable.createdAt));

    res.json(keys);
  } catch (err) {
    console.error("[CC] Error listing API keys:", err);
    res.status(500).json({ error: "Failed to list ComedyClash API keys" });
  }
});

router.post("/integrations/comedyclash/api-keys/:id/rotate", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) { res.status(400).json({ error: "Invalid key ID" }); return; }

    const clientId = req.user!.clientId;
    const [existing] = await db
      .select()
      .from(platformApiKeysTable)
      .where(and(
        eq(platformApiKeysTable.id, keyId),
        eq(platformApiKeysTable.platform, "comedyclash"),
        eq(platformApiKeysTable.clientId, clientId),
      ));

    if (!existing) { res.status(404).json({ error: "Key not found" }); return; }

    const rawKey = `cck_${crypto.randomBytes(32).toString("hex")}`;
    const newKeyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [updated] = await db
      .update(platformApiKeysTable)
      .set({ keyHash: newKeyHash, previousKeyHash: existing.keyHash, rotatedAt: new Date() })
      .where(eq(platformApiKeysTable.id, keyId))
      .returning();

    res.json({
      id: updated.id,
      key: rawKey,
      label: updated.label,
      rotatedAt: updated.rotatedAt?.toISOString(),
      warning: "Old key remains valid for 24 hours. Store this key securely — it will not be shown again.",
    });
  } catch (err) {
    console.error("[CC] Error rotating API key:", err);
    res.status(500).json({ error: "Failed to rotate ComedyClash API key" });
  }
});

router.delete("/integrations/comedyclash/api-keys/:id", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) { res.status(400).json({ error: "Invalid key ID" }); return; }

    const clientId = req.user!.clientId;
    const [updated] = await db
      .update(platformApiKeysTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(platformApiKeysTable.id, keyId),
        eq(platformApiKeysTable.platform, "comedyclash"),
        eq(platformApiKeysTable.clientId, clientId),
      ))
      .returning();

    if (!updated) { res.status(404).json({ error: "Key not found" }); return; }

    res.json({ id: updated.id, status: updated.status, revokedAt: updated.revokedAt });
  } catch (err) {
    console.error("[CC] Error revoking API key:", err);
    res.status(500).json({ error: "Failed to revoke ComedyClash API key" });
  }
});

export default router;
