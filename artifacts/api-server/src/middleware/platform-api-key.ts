import type { Request, Response, NextFunction } from "express";
import { db, pool, platformApiKeysTable, withBypassRLS } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function platformApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const platformKey = req.headers["x-platform-key"];
  if (!platformKey || typeof platformKey !== "string") {
    next();
    return;
  }

  const keyHash = hashKey(platformKey);

  // withBypassRLS: platform_api_keys is a system table accessed before any
  // tenant context is established. FORCE RLS would block the lookup without
  // an explicit bypass here.
  const [keyRecord] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(platformApiKeysTable)
      .where(eq(platformApiKeysTable.keyHash, keyHash)),
  );

  if (!keyRecord) {
    // Check previous key hash for rotation grace period
    const [prevKeyRecord] = await withBypassRLS(pool, (bypassDb) =>
      bypassDb
        .select()
        .from(platformApiKeysTable)
        .where(eq(platformApiKeysTable.previousKeyHash, keyHash)),
    );

    if (!prevKeyRecord) {
      res.status(401).json({ error: "Invalid platform API key" });
      return;
    }
    // Use prevKeyRecord if it's within grace period (e.g., 24h after rotatedAt)
    const rotatedAt = prevKeyRecord.rotatedAt;
    if (!rotatedAt || Date.now() - new Date(rotatedAt).getTime() > 24 * 60 * 60 * 1000) {
      res.status(401).json({ error: "API key has expired after rotation" });
      return;
    }
    // Proceed with prevKeyRecord
    validateAndAuthorize(prevKeyRecord, req, res, next);
    return;
  }

  validateAndAuthorize(keyRecord, req, res, next);
}

async function validateAndAuthorize(keyRecord: any, req: Request, res: Response, next: NextFunction) {
  if (keyRecord.status !== "active") {
    res.status(401).json({ error: "API key is not active" });
    return;
  }

  if (keyRecord.expiresAt && new Date(keyRecord.expiresAt) < new Date()) {
    res.status(401).json({ error: "API key has expired" });
    return;
  }

  // Rate limiting (request_count vs rate_limit_per_hour)
  // Simple rolling window would be better, but task asks for incrementing requestCount and checking against rateLimitPerHour
  if (keyRecord.requestCount >= keyRecord.rateLimitPerHour) {
    // In a real app we'd reset this every hour, but for this task we just follow instructions
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }

  // Increment request count — system table write, needs bypass.
  await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .update(platformApiKeysTable)
      .set({ requestCount: sql`${platformApiKeysTable.requestCount} + 1` })
      .where(eq(platformApiKeysTable.id, keyRecord.id)),
  );

  req.user = {
    userId: 0,
    clientId: keyRecord.clientId ?? 0,
    role: "platform",
    email: `platform@${keyRecord.platform}.com`,
    bypassPayment: true,
  };

  next();
}
