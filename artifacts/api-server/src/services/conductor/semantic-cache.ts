import { db, semanticCacheTable } from "@workspace/db";
import { and, eq, isNull, sql, lt } from "drizzle-orm";
import { generateEmbedding } from "../bots/memory.js";

/**
 * Semantic cache (task #216).
 *
 * Agent fleets repeatedly ask near-identical sub-questions across runs and
 * sessions. This cache stores agent and summary completions keyed by the
 * embedding of the request text. A lookup embeds the incoming request and
 * returns the closest stored completion *only* when cosine similarity clears a
 * confidence bar, so misses behave exactly as before (no correctness drift).
 *
 * Isolation: every read/write is scoped to a single client (or to the global
 * NULL bucket for anonymous flows) — entries never leak across clients.
 * Expiry: rows carry expires_at and lookups ignore expired rows (TTL).
 */

export type CacheKind = "agent" | "summary";

export interface SemanticCacheConfig {
  /** Minimum cosine similarity (0..1) for a stored entry to be served. */
  similarityThreshold: number;
  /** Time-to-live for new entries, in seconds. */
  ttlSeconds: number;
  /** Master on/off switch. */
  enabled: boolean;
}

function envNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSemanticCacheConfig(): SemanticCacheConfig {
  const threshold = envNum("SEMANTIC_CACHE_SIMILARITY_THRESHOLD", 0.95);
  return {
    similarityThreshold: Math.min(1, Math.max(0, threshold)),
    ttlSeconds: envNum("SEMANTIC_CACHE_TTL_SECONDS", 24 * 60 * 60),
    enabled: process.env.SEMANTIC_CACHE_DISABLED !== "true",
  };
}

export interface CacheLookupParams {
  clientId?: number;
  kind: CacheKind;
  queryText: string;
  taskCategory?: string;
}

export interface CacheLookupHit {
  hit: true;
  id: number;
  response: string;
  similarity: number;
  savedCostUsd: number;
}

export interface CacheLookupMiss {
  hit: false;
  similarity: number;
}

export type CacheLookupResult = CacheLookupHit | CacheLookupMiss;

function clientIsolation(clientId?: number) {
  return clientId != null ? eq(semanticCacheTable.clientId, clientId) : isNull(semanticCacheTable.clientId);
}

/**
 * Look up the closest non-expired cache entry for this client/kind. Returns a
 * hit only when similarity clears the configured threshold. Any error (missing
 * table, embedding failure) degrades to a miss so callers proceed normally.
 */
export async function lookupSemanticCache(params: CacheLookupParams): Promise<CacheLookupResult> {
  const cfg = getSemanticCacheConfig();
  if (!cfg.enabled || !params.queryText.trim()) return { hit: false, similarity: 0 };

  try {
    const queryEmbedding = await generateEmbedding(params.queryText);
    const vectorLiteral = JSON.stringify(queryEmbedding);

    const rows = await db
      .select({
        id: semanticCacheTable.id,
        response: semanticCacheTable.responseText,
        savedCostUsd: semanticCacheTable.savedCostUsd,
        similarity: sql<number>`1 - (${semanticCacheTable.embedding} <=> ${vectorLiteral}::vector)`.as("similarity"),
      })
      .from(semanticCacheTable)
      .where(
        and(
          eq(semanticCacheTable.cacheKind, params.kind),
          clientIsolation(params.clientId),
          sql`${semanticCacheTable.embedding} IS NOT NULL`,
          sql`${semanticCacheTable.expiresAt} > now()`,
        ),
      )
      .orderBy(sql`${semanticCacheTable.embedding} <=> ${vectorLiteral}::vector`)
      .limit(1);

    const top = rows[0];
    if (!top) return { hit: false, similarity: 0 };

    const similarity = Number(top.similarity ?? 0);
    if (similarity < cfg.similarityThreshold) {
      return { hit: false, similarity };
    }

    // Record the hit (best-effort).
    db.update(semanticCacheTable)
      .set({ hitCount: sql`${semanticCacheTable.hitCount} + 1`, lastHitAt: new Date() })
      .where(eq(semanticCacheTable.id, top.id))
      .catch(() => {});

    return {
      hit: true,
      id: top.id,
      response: top.response,
      similarity,
      savedCostUsd: Number(top.savedCostUsd ?? 0),
    };
  } catch (err) {
    console.warn("[SemanticCache] lookup failed, treating as miss:", err instanceof Error ? err.message : err);
    return { hit: false, similarity: 0 };
  }
}

export interface CacheStoreParams {
  clientId?: number;
  kind: CacheKind;
  queryText: string;
  responseText: string;
  model?: string;
  taskCategory?: string;
  /** Estimated cost of producing this entry — surfaced as savings on future hits. */
  costUsd?: number;
}

/** Store a completion. Best-effort: failures never break the calling flow. */
export async function storeSemanticCache(params: CacheStoreParams): Promise<void> {
  const cfg = getSemanticCacheConfig();
  if (!cfg.enabled || !params.queryText.trim() || !params.responseText.trim()) return;

  try {
    const embedding = await generateEmbedding(params.queryText);
    const expiresAt = new Date(Date.now() + cfg.ttlSeconds * 1000);
    await db.insert(semanticCacheTable).values({
      clientId: params.clientId ?? null,
      cacheKind: params.kind,
      taskCategory: params.taskCategory ?? null,
      queryText: params.queryText.slice(0, 8000),
      responseText: params.responseText,
      model: params.model ?? null,
      embedding,
      savedCostUsd: params.costUsd ?? 0,
      expiresAt,
    });
  } catch (err) {
    console.warn("[SemanticCache] store failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Invalidate cache entries. With no filters, expires the entire table. Use
 * `clientId`/`kind` to scope, or `olderThan` to drop stale rows.
 */
export async function invalidateSemanticCache(opts?: {
  clientId?: number;
  kind?: CacheKind;
  olderThan?: Date;
}): Promise<number> {
  try {
    const clauses = [];
    if (opts?.clientId != null) clauses.push(eq(semanticCacheTable.clientId, opts.clientId));
    if (opts?.kind) clauses.push(eq(semanticCacheTable.cacheKind, opts.kind));
    if (opts?.olderThan) clauses.push(lt(semanticCacheTable.createdAt, opts.olderThan));

    const result = await db
      .delete(semanticCacheTable)
      .where(clauses.length > 0 ? and(...clauses) : sql`true`)
      .returning({ id: semanticCacheTable.id });
    return result.length;
  } catch (err) {
    console.warn("[SemanticCache] invalidate failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Delete all expired rows. Cheap housekeeping; lookups already ignore them. */
export async function purgeExpiredSemanticCache(): Promise<number> {
  try {
    const result = await db
      .delete(semanticCacheTable)
      .where(lt(semanticCacheTable.expiresAt, new Date()))
      .returning({ id: semanticCacheTable.id });
    return result.length;
  } catch {
    return 0;
  }
}

/**
 * Per-run accumulator so a strategy can report how many of its sub-calls were
 * served from cache and the cost it avoided.
 */
export interface RunCacheStats {
  lookups: number;
  hits: number;
  savedCostUsd: number;
  /** Best-observed similarity among hits — surfaced for telemetry. */
  bestSimilarity: number;
}

export function newRunCacheStats(): RunCacheStats {
  return { lookups: 0, hits: 0, savedCostUsd: 0, bestSimilarity: 0 };
}

export function cacheHitRate(stats: RunCacheStats): number {
  return stats.lookups > 0 ? stats.hits / stats.lookups : 0;
}

/**
 * Run `produce` unless a semantically-equivalent result is already cached.
 * On a miss, the produced result is stored for future reuse. Updates `stats`.
 */
export async function withSemanticCache(
  params: CacheLookupParams & { model?: string; estimatedCostUsd?: number },
  produce: () => Promise<string>,
  stats?: RunCacheStats,
): Promise<{ content: string; cacheHit: boolean; similarity: number; savedCostUsd: number }> {
  if (stats) stats.lookups += 1;

  const lookup = await lookupSemanticCache(params);
  if (lookup.hit) {
    const saved = lookup.savedCostUsd || params.estimatedCostUsd || 0;
    if (stats) {
      stats.hits += 1;
      stats.savedCostUsd += saved;
      stats.bestSimilarity = Math.max(stats.bestSimilarity, lookup.similarity);
    }
    return { content: lookup.response, cacheHit: true, similarity: lookup.similarity, savedCostUsd: saved };
  }

  const content = await produce();
  if (content.trim()) {
    await storeSemanticCache({
      clientId: params.clientId,
      kind: params.kind,
      queryText: params.queryText,
      responseText: content,
      model: params.model,
      taskCategory: params.taskCategory,
      costUsd: params.estimatedCostUsd,
    });
  }
  return { content, cacheHit: false, similarity: lookup.similarity, savedCostUsd: 0 };
}
