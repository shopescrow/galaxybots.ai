import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { db, bingolingoApiKeysTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface BingoLingoApiKeyRequest extends Request {
  bingolingoClientId?: number;
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function authenticateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers["x-bingolingo-key"] as string | undefined;
  if (!key) {
    res.status(401).json({ error: "Missing X-BingoLingo-Key header" });
    return;
  }
  const hashed = hashKey(key);
  const [apiKey] = await db
    .select()
    .from(bingolingoApiKeysTable)
    .where(and(eq(bingolingoApiKeysTable.keyHash, hashed), eq(bingolingoApiKeysTable.status, "active")));
  if (!apiKey) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }
  const blReq = req as BingoLingoApiKeyRequest;
  blReq.bingolingoClientId = apiKey.clientId;
  next();
}
