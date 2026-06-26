/**
 * Disagreement / divergence measurement over a cluster's member outputs.
 *
 * The hierarchical aggregator collapses many agent perspectives into a single
 * answer to save context window — but that collapse is lossy, and the FIRST
 * thing to vanish is genuine disagreement between agents. This module gives the
 * aggregator a deterministic, network-free signal for "how much do these
 * outputs actually disagree?" so it can decide whether a branch is safe to
 * summarize (low divergence) or must be expanded losslessly (high divergence).
 *
 * The measure combines two signals:
 *  - Lexical divergence: Jaccard distance over content-word token sets. Captures
 *    "these perspectives are talking about different things".
 *  - Stance conflict: opposing recommendation/polarity markers. Captures
 *    "these perspectives reach opposite conclusions" (true contradiction), which
 *    pure lexical overlap can miss when two texts share vocabulary but disagree.
 *
 * Everything here is pure and deterministic so it can be unit-tested and run in
 * the CI golden-set harness without any LLM calls.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to", "in",
  "on", "for", "with", "as", "by", "at", "from", "is", "are", "was", "were",
  "be", "been", "being", "this", "that", "these", "those", "it", "its", "we",
  "you", "they", "he", "she", "i", "our", "your", "their", "will", "would",
  "can", "could", "may", "might", "do", "does", "did", "have", "has", "had",
  "so", "than", "too", "very", "just", "also", "about", "into", "over", "more",
]);

const POSITIVE_MARKERS = new Set([
  "recommend", "should", "yes", "agree", "support", "increase", "approve",
  "favorable", "positive", "beneficial", "advisable", "proceed", "viable",
  "strong", "buy", "invest", "endorse", "feasible",
]);

const NEGATIVE_MARKERS = new Set([
  "avoid", "not", "no", "disagree", "oppose", "decrease", "reject", "against",
  "unfavorable", "negative", "harmful", "inadvisable", "halt", "stop",
  "risky", "weak", "sell", "divest", "infeasible", "never", "cannot", "shouldn't",
  "don't", "doesn't", "won't",
]);

export function normalizeTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

export function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return 1 - intersection / union;
}

/**
 * Stance score in [-1, 1]: positive → leans toward "yes/recommend/increase",
 * negative → leans toward "no/avoid/decrease". Used to detect contradictions
 * between two perspectives that may share vocabulary but reach opposite calls.
 */
export function stanceScore(text: string): number {
  const tokens = text.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/);
  let pos = 0;
  let neg = 0;
  for (const t of tokens) {
    if (POSITIVE_MARKERS.has(t)) pos++;
    if (NEGATIVE_MARKERS.has(t)) neg++;
  }
  if (pos + neg === 0) return 0;
  return (pos - neg) / (pos + neg);
}

/**
 * Divergence between two texts in [0, 1]. 0 = identical stance & vocabulary,
 * 1 = completely disjoint and/or directly contradictory.
 */
export function computePairwiseDivergence(a: string, b: string): number {
  const lexical = jaccardDistance(normalizeTokens(a), normalizeTokens(b));
  const stanceConflict = Math.min(1, Math.abs(stanceScore(a) - stanceScore(b)) / 2);
  const divergence = 0.65 * lexical + 0.35 * stanceConflict;
  return Math.max(0, Math.min(1, divergence));
}

export interface DivergenceReport {
  meanDivergence: number;
  maxDivergence: number;
  pairCount: number;
}

/**
 * Aggregate divergence over a set of member outputs. Returns the mean and max
 * pairwise divergence. A single member (or none) has zero divergence.
 */
export function computeDivergence(texts: string[]): DivergenceReport {
  const members = texts.filter((t) => t && t.trim().length > 0);
  if (members.length < 2) {
    return { meanDivergence: 0, maxDivergence: 0, pairCount: 0 };
  }
  let sum = 0;
  let max = 0;
  let pairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const d = computePairwiseDivergence(members[i], members[j]);
      sum += d;
      if (d > max) max = d;
      pairs++;
    }
  }
  return {
    meanDivergence: pairs > 0 ? sum / pairs : 0,
    maxDivergence: max,
    pairCount: pairs,
  };
}
