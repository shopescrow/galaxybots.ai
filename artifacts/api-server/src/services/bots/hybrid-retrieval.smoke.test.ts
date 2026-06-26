import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  recencyScore,
  rolePriorScore,
  scoreMemory,
  rerankMemories,
  clamp01,
  DEFAULT_RETRIEVAL_WEIGHTS,
  RECENCY_HALF_LIFE_DAYS,
  type RankableMemory,
} from "./hybrid-retrieval";

describe("hybrid-retrieval pure ranking", () => {
  it("cosineSimilarity returns 1 for identical, 0 for orthogonal/empty", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("recencyScore decays exponentially with a 0.5 value at one half-life", () => {
    const now = Date.now();
    expect(recencyScore(new Date(now), now)).toBeCloseTo(1, 3);
    const oneHalfLifeAgo = now - RECENCY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;
    expect(recencyScore(new Date(oneHalfLifeAgo), now)).toBeCloseTo(0.5, 2);
    const veryOld = now - 365 * 24 * 60 * 60 * 1000;
    expect(recencyScore(new Date(veryOld), now)).toBeLessThan(0.01);
    expect(recencyScore(null, now)).toBe(0);
  });

  it("rolePriorScore boosts text matching role tags, no-op without role/tags", () => {
    expect(rolePriorScore("a strategic analytical plan", "thinker")).toBeGreaterThan(0);
    expect(rolePriorScore("operational execution task", "worker")).toBeGreaterThan(0);
    // No role/tags -> prior is a no-op.
    expect(rolePriorScore("strategic analytical plan")).toBe(0);
    // Unrelated text -> no boost.
    expect(rolePriorScore("the cat sat on the mat", "verifier")).toBe(0);
  });

  it("clamp01 bounds values into [0,1]", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(NaN)).toBe(0);
  });

  it("scoreMemory blends similarity, recency and role prior with weights", () => {
    const now = Date.now();
    const scored = scoreMemory(
      { similarity: 1, createdAt: new Date(now), summary: "strategic analytical insight" },
      { role: "thinker", now },
    );
    expect(scored.similarity).toBe(1);
    expect(scored.recency).toBeCloseTo(1, 3);
    expect(scored.rolePrior).toBeGreaterThan(0);
    // similarity maps [-1,1]->[0,1] = 1; recency ~1; prior >0 -> score near sum of weights.
    expect(scored.score).toBeGreaterThan(DEFAULT_RETRIEVAL_WEIGHTS.similarity);
  });

  it("rerank surfaces the most semantically relevant entry (cosine dominates)", () => {
    const query = [1, 0, 0, 0];
    const candidates: RankableMemory[] = [
      { embedding: [0, 1, 0, 0], summary: "off-topic", createdAt: new Date() },
      { embedding: [1, 0, 0, 0], summary: "the relevant one", createdAt: new Date() },
      { embedding: [0, 0, 1, 0], summary: "also off-topic", createdAt: new Date() },
    ];
    const ranked = rerankMemories(candidates, { queryEmbedding: query });
    expect(ranked[0].memory.summary).toBe("the relevant one");
  });

  it("recency breaks ties between equally-similar entries", () => {
    const now = Date.now();
    const old = new Date(now - 90 * 24 * 60 * 60 * 1000);
    const fresh = new Date(now);
    const candidates: RankableMemory[] = [
      { similarity: 0.9, summary: "stale", createdAt: old },
      { similarity: 0.9, summary: "fresh", createdAt: fresh },
    ];
    const ranked = rerankMemories(candidates, { now });
    expect(ranked[0].memory.summary).toBe("fresh");
  });

  it("role prior can re-order entries with equal similarity and recency", () => {
    const now = Date.now();
    const candidates: RankableMemory[] = [
      { similarity: 0.8, summary: "general note", createdAt: new Date(now) },
      { similarity: 0.8, summary: "risk error validation audit", createdAt: new Date(now) },
    ];
    const ranked = rerankMemories(candidates, { role: "verifier", now });
    expect(ranked[0].memory.summary).toBe("risk error validation audit");
  });

  it("falls back to recency ordering when no query embedding is available", () => {
    const now = Date.now();
    const candidates: RankableMemory[] = [
      { summary: "old", createdAt: new Date(now - 30 * 86400000) },
      { summary: "new", createdAt: new Date(now) },
    ];
    // No queryEmbedding and no precomputed similarity -> similarity contributes 0,
    // recency dominates -> newest first.
    const ranked = rerankMemories(candidates, { now });
    expect(ranked[0].memory.summary).toBe("new");
  });

  it("reranker work is bounded by the candidate pool size (not total memory)", () => {
    const now = Date.now();
    const pool: RankableMemory[] = Array.from({ length: 40 }, (_, i) => ({
      similarity: i / 40,
      summary: `m${i}`,
      createdAt: new Date(now),
    }));
    const ranked = rerankMemories(pool, { now });
    // Highest similarity (last item) should rank first; output length == pool length.
    expect(ranked).toHaveLength(40);
    expect(ranked[0].memory.summary).toBe("m39");
  });
});
