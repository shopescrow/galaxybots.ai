import { db, gaaMemoryTable, type GaaMemory } from "@workspace/db";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import { broadcastSSEToAll } from "../platform/sse.js";

// ---------------------------------------------------------------------------
// Multi-horizon memory. Lessons start in the "hot" tier; reinforced/high-
// confidence memories are promoted to "warm" (TTL) and then "cold" (durable).
// Supports GDPR-style deletion of all client-scoped memory.
// ---------------------------------------------------------------------------

const WARM_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const HOT_PROMOTE_REINFORCEMENTS = 2;
const WARM_PROMOTE_CONFIDENCE = 80;

export async function remember(params: {
  key: string;
  content: string;
  lesson?: string;
  scope?: "platform" | "client";
  clientId?: number | null;
  goalId?: number | null;
  confidence?: number;
}): Promise<GaaMemory> {
  const scope = params.scope ?? (params.clientId ? "client" : "platform");

  // Reinforce an existing memory with the same key+scope if present.
  const existing = await db
    .select()
    .from(gaaMemoryTable)
    .where(
      and(
        eq(gaaMemoryTable.key, params.key),
        eq(gaaMemoryTable.scope, scope),
        params.clientId
          ? eq(gaaMemoryTable.clientId, params.clientId)
          : sql`${gaaMemoryTable.clientId} IS NULL`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const m = existing[0];
    const [updated] = await db
      .update(gaaMemoryTable)
      .set({
        content: params.content,
        lesson: params.lesson ?? m.lesson,
        confidence: Math.min(
          100,
          Math.max(m.confidence, params.confidence ?? m.confidence),
        ),
        timesReinforced: m.timesReinforced + 1,
        lastAccessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gaaMemoryTable.id, m.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(gaaMemoryTable)
    .values({
      tier: "hot",
      scope,
      clientId: params.clientId ?? null,
      goalId: params.goalId ?? null,
      key: params.key,
      content: params.content,
      lesson: params.lesson ?? null,
      confidence: params.confidence ?? 50,
      lastAccessedAt: new Date(),
    })
    .returning();
  return created;
}

export async function recall(params: {
  scope?: "platform" | "client";
  clientId?: number | null;
  limit?: number;
}): Promise<GaaMemory[]> {
  const conditions = [];
  if (params.scope) conditions.push(eq(gaaMemoryTable.scope, params.scope));
  if (params.clientId)
    conditions.push(eq(gaaMemoryTable.clientId, params.clientId));

  const rows = await db
    .select()
    .from(gaaMemoryTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(gaaMemoryTable.confidence), desc(gaaMemoryTable.updatedAt))
    .limit(params.limit ?? 50);
  return rows;
}

/**
 * Promote memories across tiers based on reinforcement + confidence, and
 * expire stale warm memories. Run periodically by the GAA service.
 * Emits SSE push events for each promotion so the frontend receives live updates.
 */
export async function consolidateMemory(): Promise<{
  promotedToWarm: number;
  promotedToCold: number;
  expired: number;
}> {
  const hotToWarm = await db
    .update(gaaMemoryTable)
    .set({
      tier: "warm",
      expiresAt: new Date(Date.now() + WARM_TTL_MS),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gaaMemoryTable.tier, "hot"),
        sql`${gaaMemoryTable.timesReinforced} >= ${HOT_PROMOTE_REINFORCEMENTS}`,
      ),
    )
    .returning({ id: gaaMemoryTable.id, key: gaaMemoryTable.key, scope: gaaMemoryTable.scope, clientId: gaaMemoryTable.clientId });

  const warmToCold = await db
    .update(gaaMemoryTable)
    .set({ tier: "cold", expiresAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(gaaMemoryTable.tier, "warm"),
        sql`${gaaMemoryTable.confidence} >= ${WARM_PROMOTE_CONFIDENCE}`,
        sql`${gaaMemoryTable.timesReinforced} >= 4`,
      ),
    )
    .returning({ id: gaaMemoryTable.id, key: gaaMemoryTable.key, scope: gaaMemoryTable.scope, clientId: gaaMemoryTable.clientId });

  const expired = await db
    .delete(gaaMemoryTable)
    .where(
      and(
        eq(gaaMemoryTable.tier, "warm"),
        lt(gaaMemoryTable.expiresAt, new Date()),
      ),
    )
    .returning({ id: gaaMemoryTable.id });

  const at = new Date().toISOString();

  for (const m of hotToWarm) {
    broadcastSSEToAll("gaa_memory_promoted", {
      memoryId: m.id,
      key: m.key,
      fromTier: "hot",
      toTier: "warm",
      scope: m.scope,
      clientId: m.clientId ?? null,
      at,
    });
  }

  for (const m of warmToCold) {
    broadcastSSEToAll("gaa_memory_promoted", {
      memoryId: m.id,
      key: m.key,
      fromTier: "warm",
      toTier: "cold",
      scope: m.scope,
      clientId: m.clientId ?? null,
      at,
    });
  }

  return {
    promotedToWarm: hotToWarm.length,
    promotedToCold: warmToCold.length,
    expired: expired.length,
  };
}

/**
 * GDPR-style erasure: delete all memory scoped to a client.
 */
export async function forgetClient(clientId: number): Promise<number> {
  const deleted = await db
    .delete(gaaMemoryTable)
    .where(eq(gaaMemoryTable.clientId, clientId))
    .returning({ id: gaaMemoryTable.id });
  return deleted.length;
}
