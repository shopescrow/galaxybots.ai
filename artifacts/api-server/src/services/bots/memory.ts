import {
  db,
  botMemoriesTable,
  botsTable,
} from "@workspace/db";
import { eq, desc, sql, and, isNull, isNotNull } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import {
  rerankMemories,
  DEFAULT_CANDIDATE_POOL,
  type RetrievalWeights,
  type CoordinatorRoleLike,
} from "./hybrid-retrieval";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Embed multiple texts in a single API call. Returns vectors in the same order as the
 * input. Used by the scaling layer for bounded top-k vector retrieval over in-memory sets.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// Small in-process LRU-ish cache for query embeddings. Repeated retrievals for
// the same query text (e.g. a hot conversation) avoid re-paying embedding cost.
const QUERY_EMBED_CACHE_MAX = 256;
const queryEmbedCache = new Map<string, number[]>();

function cacheGet(key: string): number[] | undefined {
  const hit = queryEmbedCache.get(key);
  if (hit) {
    // Refresh recency: re-insert so it moves to the end of the Map.
    queryEmbedCache.delete(key);
    queryEmbedCache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: number[]): void {
  queryEmbedCache.set(key, value);
  if (queryEmbedCache.size > QUERY_EMBED_CACHE_MAX) {
    const oldest = queryEmbedCache.keys().next().value;
    if (oldest !== undefined) queryEmbedCache.delete(oldest);
  }
}

/**
 * Embed query text, returning null (rather than throwing) when embeddings are
 * unavailable so callers can fall back to the non-vector retrieval path. Results
 * are cached per query string to control embedding cost.
 */
export async function getQueryEmbedding(text: string): Promise<number[] | null> {
  const key = text.trim();
  if (!key) return null;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const embedding = await generateEmbedding(key);
    cacheSet(key, embedding);
    return embedding;
  } catch (err) {
    console.error("[memory] query embedding failed, falling back:", errMsg(err));
    return null;
  }
}

export function __clearQueryEmbedCacheForTests(): void {
  queryEmbedCache.clear();
}

export async function storeMemory(params: {
  botId: number;
  clientId?: number;
  sourceType: string;
  sourceId?: number;
  sessionId?: number;
  content: string;
  summary: string;
  topic?: string;
}) {
  // Embeddings are computed once per entry. If the embedding provider is
  // unavailable we still persist the memory (embedding null) so no data is lost;
  // backfillMissingEmbeddings can populate it later.
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(params.summary);
  } catch (err) {
    console.error("[memory] storeMemory embedding failed, storing without vector:", errMsg(err));
  }

  const [memory] = await db
    .insert(botMemoriesTable)
    .values({
      botId: params.botId,
      clientId: params.clientId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      sessionId: params.sessionId ?? null,
      content: params.content,
      summary: params.summary,
      topic: params.topic ?? null,
      embedding,
    })
    .returning();

  return memory;
}

const MEMORY_SELECTION = {
  id: botMemoriesTable.id,
  botId: botMemoriesTable.botId,
  clientId: botMemoriesTable.clientId,
  sourceType: botMemoriesTable.sourceType,
  sourceId: botMemoriesTable.sourceId,
  sessionId: botMemoriesTable.sessionId,
  content: botMemoriesTable.content,
  summary: botMemoriesTable.summary,
  topic: botMemoriesTable.topic,
  createdAt: botMemoriesTable.createdAt,
} as const;

export interface RetrievedMemory {
  id: number;
  botId: number;
  clientId: number | null;
  sourceType: string;
  sourceId: number | null;
  sessionId: number | null;
  content: string;
  summary: string;
  topic: string | null;
  createdAt: Date;
  similarity: number;
  score: number;
}

/**
 * Retrieve the most relevant memories for a bot/client and query.
 *
 * Fast path: pull a bounded candidate pool from the HNSW ANN index (top-k by
 * cosine distance), then rerank it with a hybrid score that blends vector
 * similarity, recency, and an optional role/lexical prior. Because the candidate
 * pool is bounded, retrieval latency stays roughly flat as memory grows.
 *
 * Fallback path: when a query embedding can't be produced (provider down), fall
 * back to recency-ordered retrieval so the feature degrades gracefully.
 */
export async function retrieveMemories(params: {
  botId: number;
  clientId?: number;
  query: string;
  limit?: number;
  role?: CoordinatorRoleLike;
  tags?: string[];
  weights?: Partial<RetrievalWeights>;
  candidatePool?: number;
}): Promise<RetrievedMemory[]> {
  const limit = params.limit ?? 5;
  const candidatePool = Math.max(
    limit,
    params.candidatePool ?? DEFAULT_CANDIDATE_POOL,
  );

  const conditions = [eq(botMemoriesTable.botId, params.botId)];
  if (params.clientId !== undefined) {
    conditions.push(eq(botMemoriesTable.clientId, params.clientId));
  }

  // Recency-ordered scan over the same scoped conditions. Used whenever the
  // vector path can't produce results (no query embedding, or no rows carry an
  // embedding yet) so memories remain retrievable regardless of embedding state.
  const recencyFallback = async (): Promise<RetrievedMemory[]> => {
    const rows = await db
      .select(MEMORY_SELECTION)
      .from(botMemoriesTable)
      .where(and(...conditions))
      .orderBy(desc(botMemoriesTable.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, similarity: 0, score: 0 }));
  };

  const queryEmbedding = await getQueryEmbedding(params.query);

  // Graceful fallback: no embedding available -> recency-ordered scan.
  if (!queryEmbedding) {
    return recencyFallback();
  }

  const literal = JSON.stringify(queryEmbedding);

  // ANN candidate pool: only rows that have an embedding participate in the
  // index scan; null-embedding rows are handled by backfill / fallback.
  const candidates = await db
    .select({
      ...MEMORY_SELECTION,
      similarity: sql<number>`1 - (${botMemoriesTable.embedding} <=> ${literal}::vector)`.as("similarity"),
    })
    .from(botMemoriesTable)
    .where(and(...conditions, isNotNull(botMemoriesTable.embedding)))
    .orderBy(sql`${botMemoriesTable.embedding} <=> ${literal}::vector`)
    .limit(candidatePool);

  // No embedded rows yet (e.g. all memories written during a provider outage):
  // fall back to recency so valid memories are still surfaced.
  if (candidates.length === 0) return recencyFallback();

  // Hybrid rerank: blend the SQL-computed cosine similarity with recency and an
  // optional role/lexical prior, then take the top `limit`.
  const reranked = rerankMemories(candidates, {
    role: params.role,
    tags: params.tags,
    weights: params.weights,
  });

  return reranked.slice(0, limit).map((s) => ({
    ...s.memory,
    similarity: s.memory.similarity,
    score: s.score,
  }));
}

/**
 * Backfill embeddings for memories that were stored without one (e.g. when the
 * embedding provider was temporarily unavailable). Processes a bounded batch so
 * it can be called repeatedly from a job without blowing up cost or runtime.
 */
export async function backfillMissingEmbeddings(params: {
  botId?: number;
  clientId?: number;
  batchSize?: number;
} = {}): Promise<{ processed: number; failed: number }> {
  const batchSize = params.batchSize ?? 50;
  const conditions = [isNull(botMemoriesTable.embedding)];
  if (params.botId !== undefined) conditions.push(eq(botMemoriesTable.botId, params.botId));
  if (params.clientId !== undefined) conditions.push(eq(botMemoriesTable.clientId, params.clientId));

  const rows = await db
    .select({ id: botMemoriesTable.id, summary: botMemoriesTable.summary })
    .from(botMemoriesTable)
    .where(and(...conditions))
    .orderBy(desc(botMemoriesTable.createdAt))
    .limit(batchSize);

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const embedding = await generateEmbedding(row.summary);
      await db
        .update(botMemoriesTable)
        .set({ embedding })
        .where(eq(botMemoriesTable.id, row.id));
      processed++;
    } catch (err) {
      failed++;
      console.error(`[memory] backfill embedding failed for #${row.id}:`, errMsg(err));
    }
  }

  return { processed, failed };
}

export async function consolidateSession(params: {
  sessionId: number;
  clientId?: number;
  objective: string;
  messages: Array<{ botId?: number | null; botName?: string | null; role: string; content: string }>;
  botIds: number[];
}) {
  const conversationText = params.messages
    .map((m) => `${m.botName || "User"} (${m.role}): ${m.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a memory consolidation system. Given a task session conversation, extract the key decisions, findings, action items, and important context. Return a JSON object with:
{
  "decisions": ["decision 1", "decision 2"],
  "findings": ["finding 1", "finding 2"],
  "actionItems": ["action 1", "action 2"],
  "keyContext": "A 2-3 sentence summary of the most important context from this session"
}`,
      },
      {
        role: "user",
        content: `OBJECTIVE: ${params.objective}\n\nCONVERSATION:\n${conversationText}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: {
    decisions: string[];
    findings: string[];
    actionItems: string[];
    keyContext: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { decisions: [], findings: [], actionItems: [], keyContext: "Session consolidation failed." };
  }

  const summary = [
    parsed.keyContext,
    parsed.decisions.length > 0 ? `Decisions: ${parsed.decisions.join("; ")}` : "",
    parsed.findings.length > 0 ? `Findings: ${parsed.findings.join("; ")}` : "",
    parsed.actionItems.length > 0 ? `Action items: ${parsed.actionItems.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const memories = [];
  for (const botId of params.botIds) {
    const memory = await storeMemory({
      botId,
      clientId: params.clientId,
      sourceType: "session_consolidation",
      sessionId: params.sessionId,
      content: conversationText.substring(0, 5000),
      summary,
      topic: params.objective,
    });
    memories.push(memory);
  }

  return { summary: parsed, memories };
}

export async function getMemoriesForBot(botId: number, limit = 20, clientId?: number) {
  const conditions = [eq(botMemoriesTable.botId, botId)];
  if (clientId !== undefined) {
    conditions.push(eq(botMemoriesTable.clientId, clientId));
  }

  return db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
      clientId: botMemoriesTable.clientId,
      sourceType: botMemoriesTable.sourceType,
      sourceId: botMemoriesTable.sourceId,
      sessionId: botMemoriesTable.sessionId,
      content: botMemoriesTable.content,
      summary: botMemoriesTable.summary,
      topic: botMemoriesTable.topic,
      createdAt: botMemoriesTable.createdAt,
    })
    .from(botMemoriesTable)
    .where(and(...conditions))
    .orderBy(desc(botMemoriesTable.createdAt))
    .limit(limit);
}

export async function deleteMemory(memoryId: number) {
  return db
    .delete(botMemoriesTable)
    .where(eq(botMemoriesTable.id, memoryId));
}

export async function buildMemoryContext(botId: number, query: string, clientId?: number): Promise<string> {
  const memories = await retrieveMemories({ botId, clientId, query, limit: 5 });
  if (memories.length === 0) return "";

  const memoryBlock = memories
    .map((m, i) => `[Memory ${i + 1}] ${m.summary}`)
    .join("\n");

  return `\n\n--- PRIOR CONTEXT (from long-term memory) ---\n${memoryBlock}\n--- END PRIOR CONTEXT ---`;
}
