import type { Request, Response, NextFunction } from "express";
import { db, pool, developerApiKeysTable, developerApiUsageLogTable, withBypassRLS } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

const SCOPE_METHODS: Record<string, string[]> = {
  read: ["GET", "HEAD", "OPTIONS"],
  write: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
  admin: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
};

export async function developerApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer gbdev_")) {
    next();
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = hashKey(rawKey);
  const startTime = Date.now();

  // withBypassRLS: developer_api_keys lookup happens before any tenant context
  // is established. FORCE RLS would block the lookup without explicit bypass.
  const [keyRecord] = await withBypassRLS(pool, (bypassDb) =>
    bypassDb
      .select()
      .from(developerApiKeysTable)
      .where(eq(developerApiKeysTable.keyHash, keyHash)),
  );

  if (!keyRecord) {
    res.status(401).json({ error: "Invalid developer API key" });
    return;
  }

  if (keyRecord.status !== "active") {
    res.status(401).json({ error: "API key has been revoked" });
    return;
  }

  const scopes: string[] = Array.isArray(keyRecord.scopes) ? keyRecord.scopes : ["read"];
  const allowedMethods = new Set<string>();
  for (const scope of scopes) {
    const methods = SCOPE_METHODS[scope];
    if (methods) methods.forEach(m => allowedMethods.add(m));
  }

  if (!allowedMethods.has(req.method)) {
    res.status(403).json({
      error: `Insufficient scope. Key scopes: [${scopes.join(", ")}]. Method ${req.method} requires write or admin scope.`,
    });
    return;
  }

  const role = scopes.includes("admin") ? "admin" : "developer";

  req.user = {
    clientId: keyRecord.clientId,
    userId: 0,
    role,
    email: "",
    developerKeyId: keyRecord.id,
  };

  res.on("finish", () => {
    const latencyMs = Date.now() - startTime;
    // Fire-and-forget auditing: these run after the request handler completes
    // (outside any ALS tenant context). withBypassRLS provides the explicit
    // bypass needed since FORCE RLS would otherwise block them.
    withBypassRLS(pool, (bypassDb) =>
      bypassDb
        .update(developerApiKeysTable)
        .set({
          totalCalls: keyRecord.totalCalls + 1,
          lastUsedAt: new Date(),
        })
        .where(eq(developerApiKeysTable.id, keyRecord.id)),
    )
      .then(() => {})
      .catch(() => {});

    withBypassRLS(pool, (bypassDb) =>
      bypassDb
        .insert(developerApiUsageLogTable)
        .values({
          keyId: keyRecord.id,
          clientId: keyRecord.clientId,
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          latencyMs,
          tokensConsumed: 0,
        }),
    )
      .then(() => {})
      .catch(() => {});
  });

  next();
}
