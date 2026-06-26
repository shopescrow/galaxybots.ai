import { describe, it, expect } from "vitest";
import {
  computeDivergence,
  computePairwiseDivergence,
  stanceScore,
  jaccardDistance,
  normalizeTokens,
} from "./divergence";
import { getAggregationConfig } from "./fidelity-config";
import { clusterPerspectives, aggregateWithFidelityGuardrail } from "./hierarchical-aggregator";
import { GOLDEN_TASKS, makeDeterministicDeps } from "./golden-set";

// ── Divergence measure ───────────────────────────────────────────────────────

describe("divergence measure", () => {
  it("identical texts have zero divergence", () => {
    const d = computePairwiseDivergence("the deal is strong", "the deal is strong");
    expect(d).toBe(0);
  });

  it("opposite stances on shared topic register high divergence", () => {
    const a = "We strongly recommend proceeding; synergy upside is substantial.";
    const b = "We advise against proceeding; integration will destroy margins.";
    expect(computePairwiseDivergence(a, b)).toBeGreaterThan(0.4);
  });

  it("stanceScore is positive for recommendations and negative for warnings", () => {
    expect(stanceScore("We recommend and support this; proceed and approve.")).toBeGreaterThan(0);
    expect(stanceScore("Avoid this. We oppose and reject; do not proceed.")).toBeLessThan(0);
  });

  it("jaccardDistance is 1 for disjoint token sets", () => {
    expect(jaccardDistance(normalizeTokens("alpha bravo charlie"), normalizeTokens("delta echo foxtrot"))).toBe(1);
  });

  it("computeDivergence reports mean and max over all pairs", () => {
    const report = computeDivergence(["cats are great", "cats are wonderful", "dogs are terrible and bad"]);
    expect(report.pairCount).toBe(3);
    expect(report.maxDivergence).toBeGreaterThanOrEqual(report.meanDivergence);
  });
});

// ── Per-category config ──────────────────────────────────────────────────────

describe("aggregation fidelity config", () => {
  it("high-stakes categories escalate sooner and tolerate less degradation", () => {
    const legal = getAggregationConfig("legal");
    const research = getAggregationConfig("research");
    expect(legal.divergenceEscalationThreshold).toBeLessThan(research.divergenceEscalationThreshold);
    expect(legal.fidelityFloor).toBeGreaterThan(research.fidelityFloor);
    expect(legal.fidelitySampleRate).toBeGreaterThanOrEqual(research.fidelitySampleRate);
  });

  it("caller overrides win over category defaults", () => {
    const cfg = getAggregationConfig("legal", { fidelityFloor: 0.5 });
    expect(cfg.fidelityFloor).toBe(0.5);
  });
});

// ── Clustering ───────────────────────────────────────────────────────────────

describe("clusterPerspectives", () => {
  it("groups similar perspectives and respects clusterSize", () => {
    const perspectives = [
      "security flaw exposes customer data",
      "the security flaw must be patched to protect customer data",
      "supply chain depends on a single hardware vendor",
      "the single hardware vendor causes delivery delays",
    ];
    const clusters = clusterPerspectives(perspectives, [0, 1, 2, 3], 2);
    expect(clusters.length).toBe(2);
    for (const c of clusters) expect(c.length).toBeLessThanOrEqual(2);
    // Every perspective assigned exactly once.
    expect(clusters.flat().sort()).toEqual([0, 1, 2, 3]);
  });
});

// ── Golden-set regression harness ────────────────────────────────────────────

describe("golden-set aggregation quality harness", () => {
  for (const task of GOLDEN_TASKS) {
    it(`[${task.id}] preserves quality with the guardrail on`, async () => {
      const { content, trace } = await aggregateWithFidelityGuardrail({
        perspectives: task.perspectives,
        userContent: task.userContent,
        taskCategory: task.taskCategory,
        configOverrides: task.configOverrides,
        deps: makeDeterministicDeps(task.keyPoints),
      });

      const score = scoreContent(content, task.keyPoints);
      expect(score).toBeGreaterThanOrEqual(task.expectedQualityFloor);

      expect(trace.aggregationUsed).toBe(task.expectAggregation);
      if (task.expectEscalation) {
        // Either a branch was expanded for disagreement, or the fidelity
        // guardrail caught the loss and fell back to flat — both are acceptable
        // ways of preserving the conflicting signal.
        expect(trace.escalatedClusterCount > 0 || trace.fellBackToFlat).toBe(true);
      }
    });
  }
});

// ── Guardrail behaviour: escalation + safe fallback ──────────────────────────

describe("fidelity guardrail safe fallback", () => {
  const contradiction = GOLDEN_TASKS.find((t) => t.id === "contradiction-financial")!;

  it("expands the conflicting branch losslessly when divergence exceeds threshold", async () => {
    const { content, trace } = await aggregateWithFidelityGuardrail({
      perspectives: contradiction.perspectives,
      userContent: contradiction.userContent,
      taskCategory: contradiction.taskCategory,
      configOverrides: { ...contradiction.configOverrides },
      deps: makeDeterministicDeps(contradiction.keyPoints),
    });
    expect(trace.escalatedClusterCount).toBeGreaterThan(0);
    // Both the pro and con key points survive into the answer.
    expect(scoreContent(content, contradiction.keyPoints)).toBe(1);
  });

  it("falls back to flat synthesis when escalation is disabled but fidelity is scored", async () => {
    const { content, trace } = await aggregateWithFidelityGuardrail({
      perspectives: contradiction.perspectives,
      userContent: contradiction.userContent,
      taskCategory: contradiction.taskCategory,
      // Never escalate, but keep fidelity scoring on → guardrail must catch loss.
      configOverrides: { ...contradiction.configOverrides, divergenceEscalationThreshold: 1.1, fidelitySampleRate: 1 },
      deps: makeDeterministicDeps(contradiction.keyPoints),
    });
    expect(trace.escalatedClusterCount).toBe(0);
    expect(trace.fellBackToFlat).toBe(true);
    expect(trace.flaggedForReview).toBe(true);
    expect(trace.fidelityScore).toBeLessThan(trace.baselineScore!);
    // Fallback restores the lost signal.
    expect(scoreContent(content, contradiction.keyPoints)).toBe(1);
  });

  it("HARNESS CATCHES REGRESSION: degraded output ships when both guardrails are off", async () => {
    const { content, trace } = await aggregateWithFidelityGuardrail({
      perspectives: contradiction.perspectives,
      userContent: contradiction.userContent,
      taskCategory: contradiction.taskCategory,
      // Disable escalation AND fidelity scoring → no guardrail at all.
      configOverrides: { ...contradiction.configOverrides, divergenceEscalationThreshold: 1.1, fidelitySampleRate: 0 },
      deps: makeDeterministicDeps(contradiction.keyPoints),
    });
    expect(trace.fellBackToFlat).toBe(false);
    expect(trace.fidelityScored).toBe(false);
    // Without the guardrail, the conflicting view is silently dropped — proving
    // the harness can detect aggregation-quality regressions.
    expect(scoreContent(content, contradiction.keyPoints)).toBeLessThan(contradiction.expectedQualityFloor);
  });
});

// ── Trace surfacing ──────────────────────────────────────────────────────────

describe("aggregation trace surfacing", () => {
  it("records whether aggregation ran, tree depth, cluster sizes and fidelity", async () => {
    const task = GOLDEN_TASKS.find((t) => t.id === "mixed-analysis")!;
    const { trace } = await aggregateWithFidelityGuardrail({
      perspectives: task.perspectives,
      userContent: task.userContent,
      taskCategory: task.taskCategory,
      configOverrides: task.configOverrides,
      deps: makeDeterministicDeps(task.keyPoints),
    });

    expect(trace.aggregationUsed).toBe(true);
    expect(trace.strategy).toBe("hierarchical");
    expect(trace.treeDepth).toBe(2);
    expect(trace.clusterCount).toBe(2);
    expect(trace.clusters).toHaveLength(2);
    for (const c of trace.clusters) {
      expect(c.size).toBeGreaterThan(0);
      expect(typeof c.divergence).toBe("number");
    }
    expect(trace.fidelityScored).toBe(true);
    expect(typeof trace.fidelityScore).toBe("number");
    expect(typeof trace.baselineScore).toBe("number");
  });

  it("flat path is reported when below clustering threshold", async () => {
    const task = GOLDEN_TASKS.find((t) => t.id === "few-agents-flat")!;
    const { trace } = await aggregateWithFidelityGuardrail({
      perspectives: task.perspectives,
      userContent: task.userContent,
      taskCategory: task.taskCategory,
      configOverrides: task.configOverrides,
      deps: makeDeterministicDeps(task.keyPoints),
    });
    expect(trace.aggregationUsed).toBe(false);
    expect(trace.strategy).toBe("flat");
    expect(trace.treeDepth).toBe(1);
  });
});

function scoreContent(content: string, keyPoints: string[]): number {
  if (keyPoints.length === 0) return 1;
  const lower = content.toLowerCase();
  const found = keyPoints.filter((k) => lower.includes(k.toLowerCase())).length;
  return found / keyPoints.length;
}
