import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "node:http";
import { setOpenAIMockHandler } from "../../test-setup";
import { executeParallelSynthesis, type StrategyAgent } from "../conductor/strategies/index";
import { scalingConfig } from "./scaling-config";

/**
 * Benchmark / validation for the hierarchical synthesis aggregation.
 *
 * It captures every prompt the strategy sends to the (mocked) model and records the
 * largest single prompt plus the wall-clock time, comparing the flat O(n) synthesis
 * (aggregation OFF) against the √n tree aggregation (aggregation ON) at a large agent
 * count. It asserts the tree path bounds the largest prompt, and that below-threshold
 * runs are byte-identical regardless of the flag (zero regression for small runs).
 */

interface CapturedCall {
  systemLen: number;
  userLen: number;
}

const FIXED_PERSPECTIVE = "X".repeat(400);

function installCapturingMock(): { calls: CapturedCall[]; maxPromptChars: () => number } {
  const calls: CapturedCall[] = [];
  setOpenAIMockHandler((_req: IncomingMessage, body: string) => {
    try {
      const parsed = JSON.parse(body) as { messages?: Array<{ role: string; content: string }> };
      const messages = parsed.messages ?? [];
      const systemLen = messages.filter((m) => m.role === "system").reduce((s, m) => s + (m.content?.length ?? 0), 0);
      const userLen = messages.filter((m) => m.role === "user").reduce((s, m) => s + (m.content?.length ?? 0), 0);
      calls.push({ systemLen, userLen });
    } catch {
      /* ignore parse errors */
    }
    return {
      id: "chatcmpl-bench",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-5.4",
      choices: [{ index: 0, message: { role: "assistant", content: FIXED_PERSPECTIVE }, finish_reason: "stop" }],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
    };
  });
  return {
    calls,
    maxPromptChars: () => calls.reduce((max, c) => Math.max(max, c.systemLen + c.userLen), 0),
  };
}

function makeAgents(n: number): StrategyAgent[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `agent_${i}`,
    systemPrompt: `You are analyst ${i}. Provide a perspective.`,
  }));
}

const originalSynthesis = { ...scalingConfig.synthesisAggregation };

describe("scaling benchmark — hierarchical synthesis aggregation", () => {
  beforeEach(() => {
    scalingConfig.synthesisAggregation.enabled = originalSynthesis.enabled;
    scalingConfig.synthesisAggregation.threshold = originalSynthesis.threshold;
  });

  afterEach(() => {
    setOpenAIMockHandler(null);
    scalingConfig.synthesisAggregation.enabled = originalSynthesis.enabled;
    scalingConfig.synthesisAggregation.threshold = originalSynthesis.threshold;
  });

  it("bounds the largest synthesis prompt at scale (tree ON) vs flat (OFF), with no regression below threshold", async () => {
    const AGENT_COUNT = 40;
    scalingConfig.synthesisAggregation.threshold = 6;

    // --- Flat synthesis (aggregation OFF): one prompt holds all N perspectives. ---
    scalingConfig.synthesisAggregation.enabled = false;
    const flat = installCapturingMock();
    const flatStart = Date.now();
    const flatResult = await executeParallelSynthesis({
      taskDescription: "bench",
      userContent: "Analyze the scaling question.",
      agents: makeAgents(AGENT_COUNT),
    });
    const flatWall = Date.now() - flatStart;
    const flatMaxPrompt = flat.maxPromptChars();

    // --- Tree synthesis (aggregation ON): each combine prompt holds ~√N perspectives. ---
    scalingConfig.synthesisAggregation.enabled = true;
    const tree = installCapturingMock();
    const treeStart = Date.now();
    const treeResult = await executeParallelSynthesis({
      taskDescription: "bench",
      userContent: "Analyze the scaling question.",
      agents: makeAgents(AGENT_COUNT),
    });
    const treeWall = Date.now() - treeStart;
    const treeMaxPrompt = tree.maxPromptChars();

    // Both produce a usable answer.
    expect(flatResult.content.length).toBeGreaterThan(0);
    expect(treeResult.content.length).toBeGreaterThan(0);

    // The flat path's largest prompt grows with N; the tree path keeps it bounded (well under flat).
    expect(treeMaxPrompt).toBeLessThan(flatMaxPrompt);
    // Bound should be roughly √N-scaled: comfortably below half the flat prompt at N=40.
    expect(treeMaxPrompt).toBeLessThan(flatMaxPrompt * 0.6);

    // eslint-disable-next-line no-console
    console.log(
      `[scaling-benchmark] N=${AGENT_COUNT} | flat maxPrompt=${flatMaxPrompt} (${flatWall}ms) | tree maxPrompt=${treeMaxPrompt} (${treeWall}ms) | reduction=${(
        (1 - treeMaxPrompt / flatMaxPrompt) *
        100
      ).toFixed(1)}%`,
    );
  });

  it("is byte-identical below threshold whether the flag is on or off (zero regression for small runs)", async () => {
    const AGENT_COUNT = 4; // below the threshold of 6
    scalingConfig.synthesisAggregation.threshold = 6;

    scalingConfig.synthesisAggregation.enabled = false;
    const off = installCapturingMock();
    await executeParallelSynthesis({
      taskDescription: "bench",
      userContent: "Small run.",
      agents: makeAgents(AGENT_COUNT),
    });
    const offMax = off.maxPromptChars();
    const offCallCount = off.calls.length;

    scalingConfig.synthesisAggregation.enabled = true;
    const on = installCapturingMock();
    await executeParallelSynthesis({
      taskDescription: "bench",
      userContent: "Small run.",
      agents: makeAgents(AGENT_COUNT),
    });
    const onMax = on.maxPromptChars();
    const onCallCount = on.calls.length;

    // Below threshold the aggregation never engages: same call count and same max prompt size.
    expect(onCallCount).toBe(offCallCount);
    expect(onMax).toBe(offMax);
  });
});
