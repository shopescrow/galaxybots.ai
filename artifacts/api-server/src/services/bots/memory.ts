import {
  db,
  botMemoriesTable,
  botsTable,
  gaaMemoryTable,
} from "@workspace/db";
import { eq, desc, sql, and, isNull, isNotNull, lt } from "drizzle-orm";
import { remember } from "../gaa/memory-tiers.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";
import {
  rerankMemories,
  DEFAULT_CANDIDATE_POOL,
  type RetrievalWeights,
  type CoordinatorRoleLike,
} from "./hybrid-retrieval";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------------------------------------------------------------------------
// C-Suite detection — used to gate enhanced memory behaviour.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Memory storage
// ---------------------------------------------------------------------------

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

/**
 * Store a C-Suite memory and supersede any prior non-archived memories with
 * the same topic for this bot FROM PREVIOUS SESSIONS. Memories from the same
 * session are never archived against each other — sibling extracted insights
 * (e.g. multiple strategicImplications) are all additive, not competing.
 *
 * The old records are archived (not deleted) with a pointer to the new record,
 * preserving the full strategic reasoning chain.
 */
async function storeCsuiteMemory(params: {
  botId: number;
  clientId?: number;
  sourceType: string;
  sessionId?: number;
  content: string;
  summary: string;
  topic?: string;
}) {
  const memory = await storeMemory(params);

  // Supersede prior memories with the same topic for this bot, but only those
  // from a DIFFERENT session so sibling items extracted in the same pass are
  // each preserved independently.
  if (params.topic) {
    const conditions = [
      eq(botMemoriesTable.botId, params.botId),
      eq(botMemoriesTable.topic, params.topic),
      isNull(botMemoriesTable.archivedAt),
      sql`${botMemoriesTable.id} != ${memory.id}`,
    ];

    // Exclude same-session memories — they are siblings, not supersessions.
    if (params.sessionId != null) {
      conditions.push(
        sql`(${botMemoriesTable.sessionId} IS NULL OR ${botMemoriesTable.sessionId} != ${params.sessionId})`,
      );
    }

    const priorMemories = await db
      .select({ id: botMemoriesTable.id })
      .from(botMemoriesTable)
      .where(and(...conditions));

    for (const prior of priorMemories) {
      await db
        .update(botMemoriesTable)
        .set({
          archivedAt: new Date(),
          supersededByBeliefId: memory.id,
        })
        .where(eq(botMemoriesTable.id, prior.id));
    }
  }

  return memory;
}

/**
 * Archive any non-archived bot_memories for a C-Suite bot with the given
 * task-category topic, pointing them to the new memory record. Used by the
 * knowledge-transfer path to complete the supersession chain when a distilled
 * belief is applied to a C-Suite target.
 */
export async function archivePriorCsuiteMemoriesForTopic(params: {
  botId: number;
  topic: string;
  newMemoryId: number;
  sessionId?: number;
}): Promise<number> {
  const conditions = [
    eq(botMemoriesTable.botId, params.botId),
    eq(botMemoriesTable.topic, params.topic),
    isNull(botMemoriesTable.archivedAt),
    sql`${botMemoriesTable.id} != ${params.newMemoryId}`,
  ];
  if (params.sessionId != null) {
    conditions.push(
      sql`(${botMemoriesTable.sessionId} IS NULL OR ${botMemoriesTable.sessionId} != ${params.sessionId})`,
    );
  }

  const priors = await db
    .select({ id: botMemoriesTable.id })
    .from(botMemoriesTable)
    .where(and(...conditions));

  for (const prior of priors) {
    await db
      .update(botMemoriesTable)
      .set({ archivedAt: new Date(), supersededByBeliefId: params.newMemoryId })
      .where(eq(botMemoriesTable.id, prior.id));
  }

  return priors.length;
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

  const conditions = [eq(botMemoriesTable.botId, params.botId), isNull(botMemoriesTable.archivedAt)];
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

// ---------------------------------------------------------------------------
// Session consolidation
// ---------------------------------------------------------------------------

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

  // Standard extraction pass.
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

  // Determine which participating bots are C-Suite members.
  const csuiteFlags = await Promise.all(
    params.botIds.map(async (botId) => ({ botId, csuite: await isCsuiteBot(botId) })),
  );

  for (const { botId, csuite } of csuiteFlags) {
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

    // C-Suite enrichment pass — extract strategic-grade fields and store each
    // as a permanent memory immediately after creation.
    if (csuite) {
      await enrichCsuiteSession({
        botId,
        clientId: params.clientId,
        sessionId: params.sessionId,
        objective: params.objective,
        conversationText,
      });
    }
  }

  return { summary: parsed, memories };
}

/**
 * Second-pass extraction for C-Suite sessions. Pulls out strategic implications,
 * precedents, and relationship context, and stores each as a permanent-tier
 * bot_memory record.
 */
async function enrichCsuiteSession(params: {
  botId: number;
  clientId?: number;
  sessionId: number;
  objective: string;
  conversationText: string;
}): Promise<void> {
  try {
    const completion = await openai.chat.completions.create({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content: `You are a strategic memory extraction system for a C-Suite executive AI. Extract three categories of durable insights from the session. Return a JSON object:
{
  "strategicImplications": ["long-term consequence 1", "long-term consequence 2"],
  "precedents": ["decision pattern 1 that should guide future choices", "decision pattern 2"],
  "relationshipContext": ["key thing learned about a person, company, or partner"]
}
Be concise but substantive. Only include items you are confident about from the conversation.`,
        },
        {
          role: "user",
          content: `OBJECTIVE: ${params.objective}\n\nCONVERSATION:\n${params.conversationText}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let enriched: {
      strategicImplications: string[];
      precedents: string[];
      relationshipContext: string[];
    };
    try {
      enriched = JSON.parse(raw);
    } catch {
      enriched = { strategicImplications: [], precedents: [], relationshipContext: [] };
    }

    const entries: Array<{ category: string; items: string[] }> = [
      { category: "strategic_implication", items: enriched.strategicImplications ?? [] },
      { category: "precedent", items: enriched.precedents ?? [] },
      { category: "relationship_context", items: enriched.relationshipContext ?? [] },
    ];

    for (const { category, items } of entries) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        if (!item.trim()) continue;
        const topic = `${params.objective}::${category}`;

        // Write to bot_memories with supersession chain.
        await storeCsuiteMemory({
          botId: params.botId,
          clientId: params.clientId,
          sourceType: "csuite_consolidation",
          sessionId: params.sessionId,
          content: item,
          summary: item,
          topic,
        });

        // Also write into gaa_memory as permanent immediately so the strategic
        // insight is never subject to the warm-tier 90-day cleanup cycle.
        await remember({
          key: `csuite:bot${params.botId}:${category}:${idx}`,
          content: item,
          lesson: item,
          scope: params.clientId ? "client" : "platform",
          clientId: params.clientId ?? null,
          botId: params.botId,
          confidence: 85,
          tier: "permanent",
        });
      }
    }

    console.log(
      `[memory] C-Suite enrichment for bot ${params.botId}: ` +
      `${enriched.strategicImplications?.length ?? 0} implications, ` +
      `${enriched.precedents?.length ?? 0} precedents, ` +
      `${enriched.relationshipContext?.length ?? 0} relationship items`,
    );
  } catch (err) {
    console.error(`[memory] C-Suite enrichment failed for bot ${params.botId}:`, errMsg(err));
  }
}

// ---------------------------------------------------------------------------
// Memory retrieval helpers
// ---------------------------------------------------------------------------

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

/**
 * Build the memory context block for prompt injection.
 *
 * C-Suite bots get an enhanced context:
 *   - Up to 15 memories (vs 5 for standard bots)
 *   - Platform-scoped gaa_memory records included so strategic knowledge
 *     persists across all client contexts
 */
export async function buildMemoryContext(botId: number, query: string, clientId?: number): Promise<string> {
  const csuite = await isCsuiteBot(botId);
  const limit = csuite ? 15 : 5;

  const memories = await retrieveMemories({ botId, clientId, query, limit });

  // For C-Suite bots also pull the most relevant platform-scoped gaa_memory
  // records (platform lessons that span all clients).
  let platformLessons: string[] = [];
  if (csuite) {
    const platformMemories = await db
      .select({
        key: gaaMemoryTable.key,
        content: gaaMemoryTable.content,
        lesson: gaaMemoryTable.lesson,
      })
      .from(gaaMemoryTable)
      .where(eq(gaaMemoryTable.scope, "platform"))
      .orderBy(desc(gaaMemoryTable.confidence), desc(gaaMemoryTable.updatedAt))
      .limit(5);

    platformLessons = platformMemories.map((m) =>
      `[Platform] ${m.lesson ?? m.content}`,
    );
  }

  if (memories.length === 0 && platformLessons.length === 0) return "";

  const memoryBlock = [
    ...memories.map((m, i) => `[Memory ${i + 1}] ${m.summary}`),
    ...platformLessons,
  ].join("\n");

  return `\n\n--- PRIOR CONTEXT (from long-term memory) ---\n${memoryBlock}\n--- END PRIOR CONTEXT ---`;
}

// ---------------------------------------------------------------------------
// Superseded memory cleanup job
// ---------------------------------------------------------------------------

const SUPERSEDED_NON_CSUITE_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

/**
 * Background cleanup: remove superseded (archived) bot_memories for non-C-Suite
 * bots that are older than 180 days. C-Suite supersession chains are preserved
 * indefinitely so the full strategic reasoning history stays inspectable.
 */
export async function cleanupSupersededMemories(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - SUPERSEDED_NON_CSUITE_TTL_MS);

  // Fetch all bots that have superseded memories older than the cutoff.
  const candidates = await db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
    })
    .from(botMemoriesTable)
    .where(
      and(
        isNotNull(botMemoriesTable.archivedAt),
        lt(botMemoriesTable.archivedAt, cutoff),
      ),
    );

  if (candidates.length === 0) return { deleted: 0 };

  // Group by botId, check C-Suite status once per bot.
  const csuiteCache = new Map<number, boolean>();
  const toDelete: number[] = [];

  for (const row of candidates) {
    let csuite = csuiteCache.get(row.botId);
    if (csuite === undefined) {
      csuite = await isCsuiteBot(row.botId);
      csuiteCache.set(row.botId, csuite);
    }
    if (!csuite) {
      toDelete.push(row.id);
    }
  }

  if (toDelete.length === 0) return { deleted: 0 };

  // Delete in bounded batches.
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    await db
      .delete(botMemoriesTable)
      .where(sql`${botMemoriesTable.id} = ANY(ARRAY[${sql.join(batch.map(id => sql`${id}`), sql`, `)}]::int[])`);
    deleted += batch.length;
  }

  console.log(`[memory] cleanup: removed ${deleted} superseded non-C-Suite memories older than 180 days`);
  return { deleted };
}
