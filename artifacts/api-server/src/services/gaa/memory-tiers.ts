import { db, gaaMemoryTable, botsTable, type GaaMemory } from "@workspace/db";
import { eq, and, lt, desc, sql, isNotNull } from "drizzle-orm";
import { broadcastSSEToAll } from "../platform/sse.js";

// ---------------------------------------------------------------------------
// Multi-horizon memory. Lessons start in the "hot" tier; reinforced/high-
// confidence memories are promoted to "warm" (TTL) and then "cold" (durable).
// C-Suite bot memories are further promoted to "permanent" — a tier that
// never decays, is immune to the 90-day cleanup, and survives indefinitely.
// Supports GDPR-style deletion of all client-scoped memory.
// ---------------------------------------------------------------------------

const WARM_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const HOT_PROMOTE_REINFORCEMENTS = 2;
const WARM_PROMOTE_CONFIDENCE = 80;

const CSUITE_TITLE_KEYWORDS = [
  "Chief", "CEO", "CFO", "COO", "CMO", "CTO", "President",
];
const CSUITE_DEPT_KEYWORDS = ["executive", "c-suite", "c suite", "leadership"];

async function isCsuiteBot(botId: number): Promise<boolean> {
  const [bot] = await db
    .select({ title: botsTable.title, department: botsTable.department })
    .from(botsTable)
    .where(eq(botsTable.id, botId))
    .limit(1);
  if (!bot) return false;
  const titleMatch = CSUITE_TITLE_KEYWORDS.some((kw) => bot.title.includes(kw));
  const deptMatch = CSUITE_DEPT_KEYWORDS.some((kw) => bot.department.toLowerCase().includes(kw));
  return titleMatch || deptMatch;
}

export async function remember(params: {
  key: string;
  content: string;
  lesson?: string;
  scope?: "platform" | "client";
  clientId?: number | null;
  goalId?: number | null;
  confidence?: number;
  botId?: number | null;
  /**
   * Override the starting tier. Defaults to "hot". Pass "permanent" to write
   * C-Suite strategic insights directly into the permanent tier without waiting
   * for consolidation promotion cycles.
   */
  tier?: "hot" | "warm" | "cold" | "permanent";
}): Promise<GaaMemory> {
  const scope = params.scope ?? (params.clientId ? "client" : "platform");
  const tier = params.tier ?? "hot";

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

    // Tier resolution on reinforce — three invariants:
    //   1. Permanent is a ceiling: never downgrade it.
    //   2. When the caller explicitly requests a tier, apply it only if it is
    //      an upgrade (higher rank); never demote an already-promoted memory.
    //   3. When no explicit tier is requested, preserve the existing tier so
    //      routine reinforcement calls cannot silently demote warm/cold records.
    const tierRank: Record<string, number> = { hot: 0, warm: 1, cold: 2, permanent: 3 };
    let resolvedTier: "hot" | "warm" | "cold" | "permanent";
    if (m.tier === "permanent") {
      resolvedTier = "permanent";
    } else if (params.tier != null) {
      // Only upgrade; never demote.
      resolvedTier = tierRank[params.tier] > tierRank[m.tier]
        ? params.tier
        : (m.tier as "hot" | "warm" | "cold" | "permanent");
    } else {
      // No explicit tier — preserve whatever tier the record already holds.
      resolvedTier = m.tier as "hot" | "warm" | "cold" | "permanent";
    }

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
        tier: resolvedTier,
        // Permanent memories have no expiry.
        ...(resolvedTier === "permanent" ? { expiresAt: null } : {}),
        ...(params.botId != null && { botId: params.botId }),
      })
      .where(eq(gaaMemoryTable.id, m.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(gaaMemoryTable)
    .values({
      tier,
      scope,
      clientId: params.clientId ?? null,
      botId: params.botId ?? null,
      goalId: params.goalId ?? null,
      key: params.key,
      content: params.content,
      lesson: params.lesson ?? null,
      confidence: params.confidence ?? 50,
      // Permanent memories are written without an expiry.
      expiresAt: tier === "permanent" ? null : undefined,
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
 *
 * Permanent tier rules:
 *   - cold-tier memories whose associated bot is a C-Suite member are promoted
 *     to permanent — they never receive an expiresAt and are never deleted.
 *   - Warm-tier deletion explicitly excludes permanent records (tier check).
 *
 * Emits SSE push events for each promotion so the frontend receives live updates.
 */
export async function consolidateMemory(): Promise<{
  promotedToWarm: number;
  promotedToCold: number;
  promotedToPermanent: number;
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

  // Promote cold-tier records belonging to C-Suite bots to permanent.
  // Fetch all cold rows regardless of bot_id — legacy rows may have bot_id=NULL
  // but still encode the bot id in the key (e.g. "reflection:bot42:type").
  const allColdMemories = await db
    .select()
    .from(gaaMemoryTable)
    .where(eq(gaaMemoryTable.tier, "cold"));

  const permanentPromotions: Array<{ id: number; key: string; scope: string; clientId: number | null }> = [];

  // Regex to extract a numeric bot id from keys like "prefix:bot123:suffix" or "prefix:bot123".
  const BOT_KEY_RE = /:bot(\d+)(?:[^0-9]|$)/;

  for (const mem of allColdMemories) {
    // Resolve botId from the column; fall back to parsing the key for legacy rows.
    let botId: number | null = mem.botId ?? null;
    if (botId == null) {
      const match = BOT_KEY_RE.exec(mem.key);
      if (match) {
        botId = parseInt(match[1], 10);
        // Backfill bot_id in the DB so future passes skip the key parsing.
        await db
          .update(gaaMemoryTable)
          .set({ botId })
          .where(eq(gaaMemoryTable.id, mem.id));
      }
    }
    if (botId == null) continue;
    const csuite = await isCsuiteBot(botId);
    if (!csuite) continue;
    const [promoted] = await db
      .update(gaaMemoryTable)
      .set({ tier: "permanent", expiresAt: null, updatedAt: new Date() })
      .where(eq(gaaMemoryTable.id, mem.id))
      .returning({ id: gaaMemoryTable.id, key: gaaMemoryTable.key, scope: gaaMemoryTable.scope, clientId: gaaMemoryTable.clientId });
    if (promoted) permanentPromotions.push(promoted);
  }

  // Expire stale warm memories only — permanent records are never touched.
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

  for (const m of permanentPromotions) {
    broadcastSSEToAll("gaa_memory_promoted", {
      memoryId: m.id,
      key: m.key,
      fromTier: "cold",
      toTier: "permanent",
      scope: m.scope,
      clientId: m.clientId ?? null,
      at,
    });
  }

  return {
    promotedToWarm: hotToWarm.length,
    promotedToCold: warmToCold.length,
    promotedToPermanent: permanentPromotions.length,
    expired: expired.length,
  };
}

/**
 * GDPR-style erasure: delete all memory scoped to a client.
 * Permanent memories are included in erasure to honour the right to be forgotten.
 */
export async function forgetClient(clientId: number): Promise<number> {
  const deleted = await db
    .delete(gaaMemoryTable)
    .where(eq(gaaMemoryTable.clientId, clientId))
    .returning({ id: gaaMemoryTable.id });
  return deleted.length;
}
