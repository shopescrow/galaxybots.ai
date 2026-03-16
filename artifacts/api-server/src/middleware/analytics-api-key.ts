import type { Request, Response, NextFunction } from "express";
import { db, analyticsApiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export { hashApiKey };

export async function analyticsApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer gba_")) {
    next();
    return;
  }

  const apiKey = authHeader.slice(7);
  const hashed = hashApiKey(apiKey);

  const [keyRecord] = await db
    .select()
    .from(analyticsApiKeysTable)
    .where(eq(analyticsApiKeysTable.apiKey, hashed));

  if (!keyRecord) {
    res.status(401).json({ error: "Invalid analytics API key" });
    return;
  }

  (req as any).user = {
    clientId: keyRecord.clientId,
    userId: null,
    role: "analytics_readonly",
  };

  next();
}
