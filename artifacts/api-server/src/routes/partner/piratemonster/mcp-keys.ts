import { Router, type IRouter } from "express";
import { db, platformApiKeysTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireRole } from "../../../middleware/auth";
import crypto from "node:crypto";

const router: IRouter = Router();

router.post("/integrations/piratemonster/mcp-keys", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const { label } = req.body || {};

    const rawKey = `pmk_${crypto.randomBytes(32).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const [key] = await db.insert(platformApiKeysTable).values({
      platform: "piratemonster_mcp",
      label: label || null,
      keyHash,
      status: "active",
      rateLimit: 100,
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
    console.error("Error creating MCP key:", err);
    res.status(500).json({ error: "Failed to create MCP key" });
  }
});

router.get("/integrations/piratemonster/mcp-keys", requireRole("owner", "admin"), async (_req, res): Promise<void> => {
  try {
    const keys = await db
      .select({
        id: platformApiKeysTable.id,
        label: platformApiKeysTable.label,
        status: platformApiKeysTable.status,
        rateLimit: platformApiKeysTable.rateLimit,
        allowedTools: platformApiKeysTable.allowedTools,
        createdAt: platformApiKeysTable.createdAt,
        revokedAt: platformApiKeysTable.revokedAt,
      })
      .from(platformApiKeysTable)
      .where(eq(platformApiKeysTable.platform, "piratemonster_mcp"))
      .orderBy(desc(platformApiKeysTable.createdAt));

    res.json(keys);
  } catch (err) {
    console.error("Error listing MCP keys:", err);
    res.status(500).json({ error: "Failed to list MCP keys" });
  }
});

router.post("/integrations/piratemonster/mcp-keys/:id/revoke", requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const keyId = Number(req.params.id);
    if (isNaN(keyId)) {
      res.status(400).json({ error: "Invalid key ID" });
      return;
    }

    const [updated] = await db
      .update(platformApiKeysTable)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(platformApiKeysTable.id, keyId),
          eq(platformApiKeysTable.platform, "piratemonster_mcp")
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Key not found" });
      return;
    }

    res.json({ id: updated.id, status: updated.status, revokedAt: updated.revokedAt });
  } catch (err) {
    console.error("Error revoking MCP key:", err);
    res.status(500).json({ error: "Failed to revoke MCP key" });
  }
});

export default router;
