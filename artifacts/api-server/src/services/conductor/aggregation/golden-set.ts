import type { TaskCategory } from "@workspace/db";
import type { AggregatorDeps } from "./hierarchical-aggregator";
import type { AggregationFidelityConfig } from "./fidelity-config";

/**
 * Golden-set of representative multi-agent aggregation tasks used by the quality
 * regression harness. Each task ships a set of agent perspectives plus the
 * `keyPoints` a high-fidelity answer MUST preserve, so aggregation quality can
 * be scored deterministically (no LLM) and any future change that degrades
 * answers fails fast in CI.
 */
export interface GoldenTask {
  id: string;
  description: string;
  userContent: string;
  taskCategory: TaskCategory;
  perspectives: string[];
  /** Substrings a faithful answer must contain. Drives deterministic scoring. */
  keyPoints: string[];
  /** Minimum acceptable quality (0..1) for the guardrailed run. */
  expectedQualityFloor: number;
  /** Whether hierarchical aggregation is expected to run for this task. */
  expectAggregation: boolean;
  /** Whether at least one branch is expected to be expanded for disagreement. */
  expectEscalation: boolean;
  /** Per-task config so clustering behaviour is deterministic in the harness. */
  configOverrides: Partial<AggregationFidelityConfig>;
}

export const GOLDEN_TASKS: GoldenTask[] = [
  {
    id: "agreement-research",
    description: "Four perspectives that broadly agree — safe to summarize.",
    userContent: "What growth strategy should the company pursue next year?",
    taskCategory: "research",
    perspectives: [
      "The company should diversify into adjacent markets to drive durable growth. Expanding the product line into adjacent markets is the clearest path forward.",
      "I agree the strongest move is to diversify into adjacent markets, leveraging existing distribution to expand into adjacent markets.",
      "Growth comes from moving into adjacent markets; the team should diversify into adjacent markets where the brand already has trust.",
      "Diversifying into adjacent markets is the right call — adjacent markets reuse current strengths and minimize execution risk.",
    ],
    keyPoints: ["diversify into adjacent markets"],
    expectedQualityFloor: 0.9,
    expectAggregation: true,
    expectEscalation: false,
    configOverrides: { clusterSize: 4, minAgentsForClustering: 3, fidelitySampleRate: 1 },
  },
  {
    id: "contradiction-financial",
    description: "Pro/con split on an acquisition — disagreement must survive.",
    userContent: "Should we proceed with the proposed acquisition?",
    taskCategory: "financial",
    perspectives: [
      "We strongly recommend proceeding with the acquisition. Recurring revenue is durable and synergy upside is substantial.",
      "Recommend approving the deal; cash flow supports the valuation and synergy upside is substantial across both businesses.",
      "Advise against the acquisition. Churn is accelerating and integration will destroy margins within two years.",
      "We oppose proceeding; the debt load is excessive and integration will destroy margins as teams are merged.",
    ],
    keyPoints: ["synergy upside is substantial", "integration will destroy margins"],
    expectedQualityFloor: 0.95,
    expectAggregation: true,
    expectEscalation: true,
    configOverrides: { clusterSize: 4, minAgentsForClustering: 3, fidelitySampleRate: 1 },
  },
  {
    id: "mixed-analysis",
    description: "Two distinct, internally-agreeing topics → two summarized clusters.",
    userContent: "What are the main risks facing the product?",
    taskCategory: "analysis",
    perspectives: [
      "The primary risk is security: an unpatched authentication flaw could expose customer data and trigger a breach.",
      "Security is the top concern — the authentication flaw must be patched before launch to avoid a breach.",
      "The biggest risk is supply chain: a single hardware vendor creates fragile dependency and delivery delays.",
      "Supply chain fragility dominates — the single hardware vendor means delivery delays will cascade.",
    ],
    keyPoints: ["expose customer data", "single hardware vendor"],
    expectedQualityFloor: 0.9,
    expectAggregation: true,
    expectEscalation: false,
    configOverrides: { clusterSize: 2, minAgentsForClustering: 3, fidelitySampleRate: 1 },
  },
  {
    id: "few-agents-flat",
    description: "Only two perspectives — stays flat, no collapse.",
    userContent: "Summarize the quarterly outlook.",
    taskCategory: "review",
    perspectives: [
      "Revenue is up and the outlook is positive heading into next quarter.",
      "Costs are stable and margins are improving, supporting a positive outlook.",
    ],
    keyPoints: ["positive outlook", "margins are improving"],
    expectedQualityFloor: 0.9,
    expectAggregation: false,
    expectEscalation: false,
    configOverrides: { clusterSize: 3, minAgentsForClustering: 3, fidelitySampleRate: 1 },
  },
];

/**
 * Deterministic, network-free aggregator dependencies for the harness.
 *
 * The `summarize` stub is intentionally LOSSY — it keeps only the first member
 * of a cluster, modelling the real-world failure where summarization silently
 * drops minority/conflicting signal. `scoreQuality` measures the fraction of the
 * task's keyPoints preserved, so a summary that drops a dissenting view scores
 * lower than the lossless flat baseline — exactly the regression the guardrail
 * must catch.
 */
export function makeDeterministicDeps(keyPoints: string[]): AggregatorDeps {
  return {
    async summarize(texts) {
      return texts[0] ?? "";
    },
    async synthesize(parts) {
      return parts.join("\n\n");
    },
    async scoreQuality(content) {
      if (keyPoints.length === 0) return 1;
      const lower = content.toLowerCase();
      const found = keyPoints.filter((k) => lower.includes(k.toLowerCase())).length;
      return found / keyPoints.length;
    },
    // Deterministic sampling: 0 < any positive sampleRate, so scoring always runs.
    random: () => 0,
  };
}
