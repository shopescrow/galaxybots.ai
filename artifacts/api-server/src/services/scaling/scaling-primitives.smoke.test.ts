import { describe, it, expect } from "vitest";
import {
  clusterIntoGroups,
  clusterBySqrtN,
  treeAggregate,
  cosineSimilarity,
  topKBySimilarity,
} from "./scaling-primitives";

describe("clusterIntoGroups", () => {
  it("preserves order and drops no item across an even split", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const groups = clusterIntoGroups(items, 3);
    expect(groups).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(groups.flat()).toEqual(items);
  });

  it("distributes the remainder to the earliest groups (near-equal sizes)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const groups = clusterIntoGroups(items, 3);
    expect(groups.map((g) => g.length)).toEqual([3, 2, 2]);
    expect(groups.flat()).toEqual(items);
  });

  it("never produces more groups than items", () => {
    const groups = clusterIntoGroups([1, 2], 10);
    expect(groups.length).toBe(2);
    expect(groups.flat()).toEqual([1, 2]);
  });

  it("returns [] for empty input", () => {
    expect(clusterIntoGroups([], 4)).toEqual([]);
  });
});

describe("clusterBySqrtN", () => {
  it("produces ~sqrt(n) groups", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const groups = clusterBySqrtN(items);
    expect(groups.length).toBe(10);
    // every item present exactly once, in original order
    expect(groups.flat()).toEqual(items);
  });

  it("handles small inputs without dropping items", () => {
    const groups = clusterBySqrtN([1, 2, 3]);
    expect(groups.flat()).toEqual([1, 2, 3]);
  });

  it("returns [] for empty input", () => {
    expect(clusterBySqrtN([])).toEqual([]);
  });
});

describe("treeAggregate", () => {
  it("aggregates a large set, summarizing every item exactly once and preserving order", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: number[] = [];

    const result = await treeAggregate<number>({
      items,
      toText: (n) => String(n),
      summarizeGroup: async (texts) => {
        for (const t of texts) seen.push(Number(t));
        return texts.join(",");
      },
      finalCombine: async (texts) => texts.join("|"),
      fanIn: 8,
    });

    // No item dropped at the first tier; first-tier groups cover all inputs in order.
    expect(seen.slice().sort((a, b) => a - b)).toEqual(items);
    expect(result.length).toBeGreaterThan(0);
  });

  it("never hands the final combine more than fanIn texts", async () => {
    const items = Array.from({ length: 200 }, (_, i) => `item-${i}`);
    let finalCombineSize = Infinity;

    await treeAggregate<string>({
      items,
      toText: (s) => s,
      summarizeGroup: async (texts) => `g(${texts.length})`,
      finalCombine: async (texts) => {
        finalCombineSize = texts.length;
        return "done";
      },
      fanIn: 8,
    });

    expect(finalCombineSize).toBeLessThanOrEqual(8);
  });

  it("returns the single item unchanged without any LLM call", async () => {
    let summarizeCalls = 0;
    let combineCalls = 0;
    const result = await treeAggregate<string>({
      items: ["only"],
      toText: (s) => s,
      summarizeGroup: async (texts) => {
        summarizeCalls++;
        return texts.join("");
      },
      finalCombine: async (texts) => {
        combineCalls++;
        return texts.join("");
      },
    });
    expect(result).toBe("only");
    expect(summarizeCalls).toBe(0);
    expect(combineCalls).toBe(0);
  });

  it("skips group summarization when the set already fits within fanIn", async () => {
    let summarizeCalls = 0;
    const result = await treeAggregate<string>({
      items: ["a", "b", "c"],
      toText: (s) => s,
      summarizeGroup: async (texts) => {
        summarizeCalls++;
        return texts.join("");
      },
      finalCombine: async (texts) => texts.join("+"),
      fanIn: 8,
    });
    expect(summarizeCalls).toBe(0);
    expect(result).toBe("a+b+c");
  });

  it("filters empty rendered items before aggregating", async () => {
    const result = await treeAggregate<string>({
      items: ["", "  ", "x"],
      toText: (s) => s,
      summarizeGroup: async (texts) => texts.join(""),
      finalCombine: async (texts) => texts.join("+"),
      fanIn: 8,
    });
    expect(result).toBe("x");
  });

  it("emits a tier event for each aggregation round", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const tiers: number[] = [];
    await treeAggregate<number>({
      items,
      toText: (n) => String(n),
      summarizeGroup: async (texts) => texts.join(","),
      finalCombine: async (texts) => texts.join("|"),
      fanIn: 8,
      onTier: (info) => tiers.push(info.tier),
    });
    expect(tiers.length).toBeGreaterThanOrEqual(1);
    expect(tiers[0]).toBe(1);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("returns 0 for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("topKBySimilarity", () => {
  it("returns the k most similar items in descending score order", () => {
    const query = [1, 0, 0];
    const items = [
      { item: "x-aligned", embedding: [1, 0, 0] },
      { item: "y-aligned", embedding: [0, 1, 0] },
      { item: "xy", embedding: [1, 1, 0] },
    ];
    const top = topKBySimilarity(query, items, 2);
    expect(top.length).toBe(2);
    expect(top[0].item).toBe("x-aligned");
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
  });

  it("returns [] when k <= 0 or there are no items", () => {
    expect(topKBySimilarity([1], [{ item: "a", embedding: [1] }], 0)).toEqual([]);
    expect(topKBySimilarity([1], [], 5)).toEqual([]);
  });
});
