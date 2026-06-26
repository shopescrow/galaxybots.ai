/**
 * Reusable sub-quadratic scaling primitives shared across the coordination layer.
 *
 * These port the algorithmic insights from the research framework into pure, testable
 * TypeScript building blocks:
 *  - `clusterBySqrtN` / `clusterIntoGroups`: contiguous √n partitioning (no item dropped, order preserved).
 *  - `treeAggregate`: hierarchical map-reduce of LLM outputs (chunk → summarize each group → combine),
 *    re-clustering recursively so the final synthesis step is bounded regardless of fan-out.
 *  - `cosineSimilarity` / `topKBySimilarity`: a bounded top-k vector-similarity selector
 *    (kernel-trick style retrieval) instead of an all-pairs / full scan.
 */

import { scalingConfig } from "./scaling-config";

/**
 * Partition `items` into exactly `groupCount` contiguous, near-equal groups.
 * Order is preserved and every item appears in exactly one group (nothing dropped).
 */
export function clusterIntoGroups<T>(items: T[], groupCount: number): T[][] {
  const n = items.length;
  if (n === 0) return [];
  const g = Math.max(1, Math.min(Math.floor(groupCount), n));

  const base = Math.floor(n / g);
  let remainder = n % g;

  const groups: T[][] = [];
  let idx = 0;
  for (let i = 0; i < g; i++) {
    const size = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups.push(items.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

/**
 * Partition `items` into ~√n contiguous groups (each of ~√n size). This is the
 * hierarchical aggregation fan-out used to keep coordination steps sub-quadratic.
 */
export function clusterBySqrtN<T>(items: T[]): T[][] {
  if (items.length === 0) return [];
  const groupCount = Math.max(1, Math.round(Math.sqrt(items.length)));
  return clusterIntoGroups(items, groupCount);
}

export interface TreeTierInfo {
  /** 1-based tier index (1 = first round of group summaries). */
  tier: number;
  /** Number of groups produced at this tier. */
  groups: number;
  /** Number of inputs that were clustered to produce those groups. */
  total: number;
}

export interface TreeAggregateOptions<I> {
  items: I[];
  /** Render a single item to text for inclusion in a group summary prompt. */
  toText: (item: I, indexInGroup: number) => string;
  /** Summarize one group of item-texts into a single intermediate summary. */
  summarizeGroup: (
    texts: string[],
    meta: { tier: number; groupIndex: number; groupCount: number },
  ) => Promise<string>;
  /** Combine the final bounded set of summaries into the single authoritative output. */
  finalCombine: (texts: string[], meta: { tier: number }) => Promise<string>;
  /**
   * Max number of texts allowed into a single combine/summarize call before we must
   * re-cluster. Defaults to the configured aggregation fan-in.
   */
  fanIn?: number;
  /** Emitted once per aggregation tier so callers can stream live progress. */
  onTier?: (info: TreeTierInfo) => void;
}

/**
 * Hierarchical map-reduce aggregation. Repeatedly clusters the working set into ~√n
 * groups and summarizes each group until the set is at or below `fanIn`, then runs a
 * single bounded final combine. This keeps the largest prompt O(√n) instead of O(n)
 * and prevents the synthesis step from exceeding the model context window at scale.
 */
export async function treeAggregate<I>(opts: TreeAggregateOptions<I>): Promise<string> {
  const fanIn = Math.max(2, opts.fanIn ?? scalingConfig.aggregationFanIn);

  let level: string[] = opts.items
    .map((item, i) => opts.toText(item, i))
    .filter((t) => t.trim().length > 0);

  if (level.length === 0) return "";
  if (level.length === 1) return level[0];

  let tier = 0;
  while (level.length > fanIn) {
    tier++;
    const prevLength = level.length;
    const groups = clusterBySqrtN(level);
    opts.onTier?.({ tier, groups: groups.length, total: prevLength });

    let next = await Promise.all(
      groups.map((group, groupIndex) =>
        opts.summarizeGroup(group, { tier, groupIndex, groupCount: groups.length }),
      ),
    );
    next = next.filter((t) => t.trim().length > 0);

    // Defensive: if summarization collapsed everything, stop to avoid an empty combine.
    if (next.length === 0) return "";
    // Defensive: if a tier failed to shrink the working set, stop to avoid an infinite loop.
    if (next.length >= prevLength) {
      level = next;
      break;
    }
    level = next;
  }

  return opts.finalCombine(level, { tier: tier + 1 });
}

/** Cosine similarity between two equal-length numeric vectors. Returns 0 for degenerate inputs. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredItem<T> {
  item: T;
  score: number;
}

/**
 * Bounded top-k selector by cosine similarity to `query`. Replaces an all-pairs /
 * full-scan filter with a single similarity pass + partial sort, returning at most `k`.
 */
export function topKBySimilarity<T>(
  query: number[],
  items: Array<{ item: T; embedding: number[] }>,
  k: number,
): Array<ScoredItem<T>> {
  if (k <= 0 || items.length === 0) return [];
  return items
    .map((entry) => ({ item: entry.item, score: cosineSimilarity(query, entry.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
