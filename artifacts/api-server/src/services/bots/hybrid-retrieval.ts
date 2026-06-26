// Hybrid memory ranking utilities.
//
// Pure, dependency-free scoring helpers used by the memory retrieval path. They
// blend three signals into a single reranking score:
//   1. vector similarity (semantic closeness to the query)
//   2. recency (exponential decay so fresh memories surface)
//   3. role/lexical prior (boost entries whose text matches the active role/tags)
//
// Keeping these pure makes retrieval quality testable without a database or an
// embedding provider, and lets both the DB-backed path (memory.ts) and the
// in-memory living-memory path (context-distiller.ts) share one ranking model.

export interface RetrievalWeights {
  /** Weight on cosine similarity (0..1 range expected). */
  similarity: number;
  /** Weight on recency decay (0..1 range). */
  recency: number;
  /** Weight on role/lexical prior (0..1 range). */
  rolePrior: number;
}

export const DEFAULT_RETRIEVAL_WEIGHTS: RetrievalWeights = {
  similarity: 0.7,
  recency: 0.2,
  rolePrior: 0.1,
};

/** Half-life (in days) used by the recency decay curve. */
export const RECENCY_HALF_LIFE_DAYS = 14;

/**
 * How many candidates to pull from the ANN index before reranking. Overfetching
 * a bounded pool keeps latency flat (work is O(pool), not O(total memories))
 * while giving the reranker enough breadth to apply recency/role priors.
 */
export const DEFAULT_CANDIDATE_POOL = 40;

export type CoordinatorRoleLike = "thinker" | "worker" | "verifier";

export const ROLE_PRIOR_TAGS: Record<CoordinatorRoleLike, string[]> = {
  thinker: ["strategic", "analytical", "research", "planning", "hypothesis", "insight"],
  worker: ["operational", "procedural", "execution", "task", "implementation", "action"],
  verifier: ["risk", "error", "correction", "validation", "audit", "review", "failure"],
};

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Cosine similarity in [-1, 1]; 0 when either vector is empty/zero. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Exponential recency decay in [0, 1]. 1.0 for "now", 0.5 at one half-life,
 * approaching 0 for very old entries. Missing/invalid dates score 0.
 */
export function recencyScore(
  createdAt: Date | string | null | undefined,
  now: number = Date.now(),
  halfLifeDays: number = RECENCY_HALF_LIFE_DAYS,
): number {
  if (!createdAt) return 0;
  const ts = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return 0;
  const ageDays = Math.max(0, (now - ts) / (1000 * 60 * 60 * 24));
  const halfLife = halfLifeDays > 0 ? halfLifeDays : RECENCY_HALF_LIFE_DAYS;
  return Math.pow(0.5, ageDays / halfLife);
}

/**
 * Lexical role prior in [0, 1]: fraction-ish of role tags present in the memory
 * text, saturating at 1. Returns 0 when no role/tags are supplied so the prior
 * is a no-op unless callers opt in.
 */
export function rolePriorScore(
  text: string,
  role?: CoordinatorRoleLike,
  extraTags?: string[],
): number {
  const tags = [
    ...(role ? ROLE_PRIOR_TAGS[role] : []),
    ...(extraTags ?? []),
  ].map((t) => t.toLowerCase());
  if (tags.length === 0) return 0;

  const haystack = text.toLowerCase();
  let hits = 0;
  for (const tag of tags) {
    if (tag && haystack.includes(tag)) hits++;
  }
  // Two solid tag matches is treated as a strong prior.
  return clamp01(hits / 2);
}

export interface RankableMemory {
  /** Cosine similarity to the query, if known (e.g. computed in SQL). */
  similarity?: number | null;
  /** Raw embedding, used to compute similarity when `similarity` is absent. */
  embedding?: number[] | null;
  createdAt?: Date | string | null;
  /** Free text used for the lexical/role prior (summary/topic/etc). */
  summary?: string | null;
  topic?: string | null;
  content?: string | null;
}

export interface RerankOptions {
  /** Query embedding; required to compute similarity from raw embeddings. */
  queryEmbedding?: number[] | null;
  role?: CoordinatorRoleLike;
  tags?: string[];
  weights?: Partial<RetrievalWeights>;
  now?: number;
  halfLifeDays?: number;
}

export interface ScoredMemory<T> {
  memory: T;
  score: number;
  similarity: number;
  recency: number;
  rolePrior: number;
}

function priorText(m: RankableMemory): string {
  return [m.summary, m.topic, m.content].filter(Boolean).join(" ");
}

/**
 * Compute the blended hybrid score and its components for a single candidate.
 */
export function scoreMemory<T extends RankableMemory>(
  memory: T,
  opts: RerankOptions = {},
): ScoredMemory<T> {
  const weights: RetrievalWeights = { ...DEFAULT_RETRIEVAL_WEIGHTS, ...(opts.weights ?? {}) };
  const now = opts.now ?? Date.now();

  let similarity: number;
  if (typeof memory.similarity === "number") {
    similarity = memory.similarity;
  } else if (memory.embedding && opts.queryEmbedding) {
    similarity = cosineSimilarity(memory.embedding, opts.queryEmbedding);
  } else {
    similarity = 0;
  }
  // Map cosine [-1,1] -> [0,1] so it composes with the other [0,1] signals.
  const simNorm = clamp01((similarity + 1) / 2);

  const recency = recencyScore(memory.createdAt, now, opts.halfLifeDays);
  const rolePrior = rolePriorScore(priorText(memory), opts.role, opts.tags);

  const score =
    weights.similarity * simNorm +
    weights.recency * recency +
    weights.rolePrior * rolePrior;

  return { memory, score, similarity, recency, rolePrior };
}

/**
 * Rerank a candidate pool by the blended hybrid score, highest first.
 */
export function rerankMemories<T extends RankableMemory>(
  candidates: T[],
  opts: RerankOptions = {},
): Array<ScoredMemory<T>> {
  return candidates
    .map((c) => scoreMemory(c, opts))
    .sort((a, b) => b.score - a.score);
}
