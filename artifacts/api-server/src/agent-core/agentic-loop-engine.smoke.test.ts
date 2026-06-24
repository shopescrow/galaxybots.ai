import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentLoopConfig, LLMProvider, ToolRegistry, MemoryStore, SessionStore, FailureLogStore, ConfigProvider, FailureRecord, LLMCompletionOptions, LLMCompletion, MemoryEntry } from "./ports/index";
import { DEFAULT_LOOP_CONFIG } from "./ports/index";
import { Confidence, Cost, Duration, Thought, Action, Observation, Evaluation } from "./value-objects/index";

const mockLLMProvider: LLMProvider = {
  isAvailable: () => true,
  async complete(options: LLMCompletionOptions): Promise<LLMCompletion> {
    return {
      content: "Mock response: task complete.",
      tool_calls: undefined,
      promptTokens: 100,
      completionTokens: 50,
      costCents: 1,
      model: options.model,
    };
  },
};

const mockToolRegistry: ToolRegistry = {
  async execute(toolName: string, args: Record<string, unknown>, _context: Record<string, unknown>) {
    return {
      result: { success: true, data: `Result from ${toolName}`, args },
      durationMs: 10,
    };
  },
  getSchemas() {
    return [
      {
        type: "function" as const,
        function: {
          name: "web_search",
          description: "Search the web",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ];
  },
  hasIdempotencyKey(_toolName: string, _key: string): boolean {
    return false;
  },
};

const mockMemoryStore: MemoryStore = {
  async retrieve(_sessionId: number, _keys?: string[]): Promise<MemoryEntry[]> {
    return [];
  },
  async store(_sessionId: number, _entries: MemoryEntry[]): Promise<void> {},
};

const capturedFailures: FailureRecord[] = [];
const mockFailureLogStore: FailureLogStore = {
  async logFailure(record: FailureRecord): Promise<void> {
    capturedFailures.push(record);
  },
};

const sessionUpdates: Array<{ sessionId: number; data: Record<string, unknown> }> = [];
const mockSessionStore: SessionStore = {
  async getSession(_sessionId: number) {
    return { id: _sessionId, objective: "test objective", status: "active" };
  },
  async updateSessionOutcome(sessionId: number, data: Record<string, unknown>): Promise<void> {
    sessionUpdates.push({ sessionId, data });
  },
};

const mockConfigProvider: ConfigProvider = {
  async getLoopConfig(_botId: number, _clientId?: number): Promise<AgentLoopConfig> {
    return { ...DEFAULT_LOOP_CONFIG };
  },
};

describe("Value Objects", () => {
  describe("Confidence", () => {
    it("should clamp values to [0, 1]", () => {
      expect(Confidence.of(1.5).value).toBe(1);
      expect(Confidence.of(-0.5).value).toBe(0);
    });

    it("should decay correctly", () => {
      const c = Confidence.of(1.0);
      const decayed = c.decay(0.1);
      expect(decayed.value).toBeCloseTo(0.9, 5);
    });

    it("should reinforce correctly", () => {
      const c = Confidence.of(0.5);
      const reinforced = c.reinforce(0.1);
      expect(reinforced.value).toBeGreaterThan(0.5);
      expect(reinforced.value).toBeLessThanOrEqual(1.0);
    });

    it("should check threshold", () => {
      expect(Confidence.of(0.8).meetsThreshold(0.7)).toBe(true);
      expect(Confidence.of(0.6).meetsThreshold(0.7)).toBe(false);
    });

    it("decay and reinforce are composable without exceeding bounds", () => {
      let c = Confidence.of(0.9);
      for (let i = 0; i < 20; i++) c = c.reinforce(0.1);
      expect(c.value).toBeLessThanOrEqual(1.0);
      for (let i = 0; i < 20; i++) c = c.decay(0.1);
      expect(c.value).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe("Cost", () => {
    it("should create from cents and dollars", () => {
      expect(Cost.ofCents(100).dollars).toBe(1);
      expect(Cost.ofDollars(1.5).cents).toBe(150);
    });

    it("should add correctly", () => {
      const total = Cost.ofCents(50).add(Cost.ofCents(75));
      expect(total.cents).toBe(125);
    });

    it("should check budget limits", () => {
      expect(Cost.ofCents(600).exceeds(500)).toBe(true);
      expect(Cost.ofCents(400).exceeds(500)).toBe(false);
    });
  });

  describe("Duration", () => {
    it("should create from ms", () => {
      const d = Duration.ofMs(5000);
      expect(d.seconds).toBe(5);
    });

    it("should check limits", () => {
      expect(Duration.ofMs(130000).exceeds(120000)).toBe(true);
      expect(Duration.ofMs(60000).exceeds(120000)).toBe(false);
    });
  });

  describe("Thought", () => {
    it("should create and serialize", () => {
      const t = Thought.create("planning step", 0);
      const json = t.toJSON();
      expect(json.content).toBe("planning step");
      expect(json.iteration).toBe(0);
      expect(typeof json.timestamp).toBe("number");
    });
  });

  describe("Action", () => {
    it("should create and serialize", () => {
      const a = Action.create("web_search", "call_123", { query: "test" }, 1);
      const json = a.toJSON();
      expect(json.toolName).toBe("web_search");
      expect(json.toolCallId).toBe("call_123");
      expect(json.arguments).toEqual({ query: "test" });
    });
  });

  describe("Observation", () => {
    it("should detect errors", () => {
      const obs = new Observation({
        toolName: "web_search",
        toolCallId: "call_1",
        result: null,
        error: "Timeout",
        durationMs: 5000,
        iteration: 0,
        timestamp: Date.now(),
      });
      expect(obs.isError).toBe(true);
    });

    it("should not mark success as error", () => {
      const obs = new Observation({
        toolName: "web_search",
        toolCallId: "call_2",
        result: { results: [] },
        durationMs: 200,
        iteration: 0,
        timestamp: Date.now(),
      });
      expect(obs.isError).toBe(false);
    });
  });

  describe("Evaluation", () => {
    it("should compute confidence from overall score", () => {
      const ev = new Evaluation({
        completeness: 0.8,
        accuracy: 0.9,
        relevance: 0.7,
        overallScore: 0.8,
        passedGate: true,
        iteration: 0,
        timestamp: Date.now(),
      });
      expect(ev.confidence.value).toBeCloseTo(0.8, 5);
    });

    it("should fail gate when score below threshold", () => {
      const ev = new Evaluation({
        completeness: 0.5,
        accuracy: 0.4,
        relevance: 0.5,
        overallScore: 0.467,
        passedGate: false,
        critique: "Response incomplete",
        iteration: 1,
        timestamp: Date.now(),
      });
      expect(ev.passedGate).toBe(false);
      expect(ev.critique).toBe("Response incomplete");
    });
  });
});

describe("Ports (mock implementations)", () => {
  it("LLMProvider mock completes successfully", async () => {
    const result = await mockLLMProvider.complete({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "hello", tool_call_id: undefined }],
    });
    expect(result.content).toBeTruthy();
    expect(result.promptTokens).toBeGreaterThan(0);
  });

  it("ToolRegistry mock executes tools", async () => {
    const result = await mockToolRegistry.execute("web_search", { query: "test" }, {});
    expect((result.result as { success: boolean }).success).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("ToolRegistry exposes schemas", () => {
    const schemas = mockToolRegistry.getSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas[0].type).toBe("function");
  });

  it("FailureLogStore captures failures", async () => {
    capturedFailures.length = 0;
    await mockFailureLogStore.logFailure({
      failureCategory: "reasoning_failure",
      failureDetail: "Test failure",
      iterationsCompleted: 3,
      costCents: 50,
      durationMs: 5000,
      toolsAttempted: ["web_search"],
    });
    expect(capturedFailures.length).toBe(1);
    expect(capturedFailures[0].failureCategory).toBe("reasoning_failure");
  });

  it("ConfigProvider returns default config", async () => {
    const config = await mockConfigProvider.getLoopConfig(1, 1);
    expect(config.maxIterations).toBe(DEFAULT_LOOP_CONFIG.maxIterations);
    expect(config.qualityThreshold).toBe(DEFAULT_LOOP_CONFIG.qualityThreshold);
    expect(config.enableSelfEvaluation).toBe(DEFAULT_LOOP_CONFIG.enableSelfEvaluation);
  });

  it("SessionStore captures outcome updates", async () => {
    sessionUpdates.length = 0;
    await mockSessionStore.updateSessionOutcome(42, {
      loopIterations: 5,
      costCents: 120,
      terminationReason: "natural_completion",
    });
    expect(sessionUpdates.length).toBe(1);
    expect(sessionUpdates[0].sessionId).toBe(42);
    expect(sessionUpdates[0].data.loopIterations).toBe(5);
  });
});

describe("Circuit Breaker (agent-core)", () => {
  beforeEach(async () => {
    const { recordCircuitSuccess } = await import("./circuit-breaker");
    for (let i = 0; i < 10; i++) recordCircuitSuccess("test-circuit");
  });

  it("should start closed", async () => {
    const { isCircuitOpen } = await import("./circuit-breaker");
    expect(isCircuitOpen("test-circuit")).toBe(false);
  });

  it("should open after threshold failures", async () => {
    const { isCircuitOpen, recordCircuitFailure, recordCircuitSuccess } = await import("./circuit-breaker");
    for (let i = 0; i < 10; i++) recordCircuitSuccess("threshold-circuit");
    for (let i = 0; i < 5; i++) recordCircuitFailure("threshold-circuit");
    expect(isCircuitOpen("threshold-circuit")).toBe(true);
    for (let i = 0; i < 10; i++) recordCircuitSuccess("threshold-circuit");
  });

  it("should record status correctly", async () => {
    const { getCircuitStatus } = await import("./circuit-breaker");
    const status = getCircuitStatus("status-circuit");
    expect(typeof status.open).toBe("boolean");
    expect(typeof status.failures).toBe("number");
  });
});

describe("Metrics (agent-core)", () => {
  it("should render prometheus format without errors", async () => {
    const { renderPrometheusMetrics, agentMetrics } = await import("./metrics");

    agentMetrics.loopTotal.inc({ termination: "natural_completion", status: "success" });
    agentMetrics.loopDurationMs.observe(1500, { bot: "1" });
    agentMetrics.loopCostCents.observe(25, { bot: "1" });
    agentMetrics.loopIterations.observe(3, { bot: "1" });
    agentMetrics.toolCallsTotal.inc({ tool: "web_search", status: "success" });
    agentMetrics.failuresTotal.inc({ category: "reasoning_failure", bot: "1" });
    agentMetrics.circuitBreakerState.set(0, { circuit: "llm-primary" });

    const output = renderPrometheusMetrics();
    expect(output).toContain("galaxybots_agent_loop_total");
    expect(output).toContain("galaxybots_agent_loop_duration_ms");
    expect(output).toContain("galaxybots_agent_tool_calls_total");
    expect(output).toContain("galaxybots_agent_circuit_breaker_state");
    expect(output).toContain("galaxybots_agent_failures_total");
    expect(output.endsWith("\n")).toBe(true);
  });
});

describe("GLM 5.2 Adapter", () => {
  it("should be available when an API key is provided", async () => {
    const { GLM52Adapter } = await import("./adapters/glm52-adapter");
    const adapter = new GLM52Adapter("test-key-placeholder");
    expect(adapter.isAvailable()).toBe(true);
  });

  it("should NOT be available when no API key is provided", async () => {
    const origKey = process.env.ZHIPU_API_KEY;
    delete process.env.ZHIPU_API_KEY;
    const { GLM52Adapter } = await import("./adapters/glm52-adapter");
    const adapter = new GLM52Adapter("");
    expect(adapter.isAvailable()).toBe(false);
    if (origKey !== undefined) process.env.ZHIPU_API_KEY = origKey;
  });

  it("GLM52Adapter.recoverJsonMode parses valid JSON", async () => {
    const { GLM52Adapter } = await import("./adapters/glm52-adapter");
    const result = GLM52Adapter.recoverJsonMode('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("GLM52Adapter.recoverJsonMode extracts JSON from prose", async () => {
    const { GLM52Adapter } = await import("./adapters/glm52-adapter");
    const result = GLM52Adapter.recoverJsonMode('Some text before {"score": 0.8} some text after');
    expect(result).toEqual({ score: 0.8 });
  });

  it("GLM52Adapter.recoverJsonMode returns null for invalid", async () => {
    const { GLM52Adapter } = await import("./adapters/glm52-adapter");
    const result = GLM52Adapter.recoverJsonMode("no json here");
    expect(result).toBeNull();
  });
});

describe("DEFAULT_LOOP_CONFIG", () => {
  it("has sane defaults", () => {
    expect(DEFAULT_LOOP_CONFIG.maxIterations).toBe(10);
    expect(DEFAULT_LOOP_CONFIG.timeBudgetMs).toBe(120_000);
    expect(DEFAULT_LOOP_CONFIG.costBudgetCents).toBe(500);
    expect(DEFAULT_LOOP_CONFIG.qualityThreshold).toBe(0.7);
    expect(DEFAULT_LOOP_CONFIG.enableSelfEvaluation).toBe(true);
    expect(DEFAULT_LOOP_CONFIG.model).toBe("gpt-5-mini");
  });
});

// ── Integrated PARO loop smoke test (all 6 ports mocked) ────────────────────

describe("runAgenticLoopEngine — integrated PARO loop (all 6 ports mocked)", () => {
  // Track side-effects across test cases
  const storedMemories: Array<{ sessionId: number; entries: import("./ports/index").MemoryEntry[] }> = [];
  const sessionOutcomes: Array<{ sessionId: number; data: Record<string, unknown> }> = [];
  const failures: import("./ports/index").FailureRecord[] = [];

  const intMemoryStore: import("./ports/index").MemoryStore = {
    async retrieve() { return []; },
    async store(sessionId, entries) { storedMemories.push({ sessionId, entries }); },
  };

  const intSessionStore: import("./ports/index").SessionStore = {
    async getSession(id) { return { id, objective: "test", status: "active" }; },
    async updateSessionOutcome(sessionId, data) { sessionOutcomes.push({ sessionId, data: data as Record<string, unknown> }); },
  };

  const intFailureLogStore: import("./ports/index").FailureLogStore = {
    async logFailure(record) { failures.push(record); },
  };

  const intConfigProvider: import("./ports/index").ConfigProvider = {
    async getLoopConfig() {
      return {
        ...DEFAULT_LOOP_CONFIG,
        enableSelfEvaluation: false, // disable so we don't need an extra LLM call
        maxIterations: 5,
      };
    },
  };

  beforeEach(() => {
    storedMemories.length = 0;
    sessionOutcomes.length = 0;
    failures.length = 0;
  });

  it("natural_completion: LLM returns text with no tool calls → single iteration", async () => {
    const { runAgenticLoopEngine } = await import("./agentic-loop-engine");

    const result = await runAgenticLoopEngine({
      model: "gpt-5-mini",
      maxIterations: 5,
      maxTokens: 200,
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Say hello." }],
      context: { botId: 1, botName: "TestBot", clientId: 1, sessionId: 99, depth: 0 },
      loopConfig: { enableSelfEvaluation: false },
      deps: {
        llmProvider: {
          isAvailable: () => true,
          async complete() {
            return { content: "Hello! How can I help you?", promptTokens: 50, completionTokens: 20, costCents: 1, model: "gpt-5-mini" };
          },
        },
        toolRegistry: mockToolRegistry,
        memoryStore: intMemoryStore,
        configProvider: intConfigProvider,
        sessionStore: intSessionStore,
        failureLogStore: intFailureLogStore,
      },
    });

    expect(result.finalContent).toBe("Hello! How can I help you?");
    expect(result.events.some((e) => e.type === "bot_complete")).toBe(true);
    // LoopTrace must have been written to session_outcomes
    expect(sessionOutcomes.length).toBeGreaterThan(0);
    const outcome = sessionOutcomes[sessionOutcomes.length - 1];
    expect(outcome.sessionId).toBe(99);
    expect(outcome.data.terminationReason).toBe("natural_completion");
    expect(outcome.data.loopTrace).toBeTruthy();
    // MemoryStore must have received the final response
    expect(storedMemories.length).toBeGreaterThan(0);
    expect(storedMemories[0].sessionId).toBe(99);
  });

  it("tool_call path: one tool call then text response → two iterations with ToolRegistry", async () => {
    const { runAgenticLoopEngine } = await import("./agentic-loop-engine");
    let callCount = 0;
    const registryCallLog: string[] = [];

    const sequencedLLM: import("./ports/index").LLMProvider = {
      isAvailable: () => true,
      async complete() {
        callCount++;
        if (callCount === 1) {
          // First: request a tool call
          return {
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "cats" }) } }],
            promptTokens: 60,
            completionTokens: 30,
            costCents: 1,
            model: "gpt-5-mini",
          };
        }
        // Second: return final text
        return { content: "Cats are great!", promptTokens: 70, completionTokens: 20, costCents: 1, model: "gpt-5-mini" };
      },
    };

    const trackingRegistry: import("./ports/index").ToolRegistry = {
      ...mockToolRegistry,
      async execute(toolName, args, _ctx) {
        registryCallLog.push(toolName);
        return { result: { hits: ["tabby", "siamese"] }, durationMs: 5 };
      },
    };

    const result = await runAgenticLoopEngine({
      model: "gpt-5-mini",
      maxIterations: 5,
      maxTokens: 200,
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Search for cats." }],
      context: { botId: 2, botName: "SearchBot", clientId: 1, sessionId: 100, depth: 0 },
      loopConfig: { enableSelfEvaluation: false },
      deps: {
        llmProvider: sequencedLLM,
        toolRegistry: trackingRegistry,
        memoryStore: intMemoryStore,
        configProvider: intConfigProvider,
        sessionStore: intSessionStore,
        failureLogStore: intFailureLogStore,
      },
    });

    expect(result.finalContent).toBe("Cats are great!");
    // ToolRegistry port must have been called for the tool
    expect(registryCallLog).toContain("web_search");
    // Tool call and result events must be present
    expect(result.events.some((e) => e.type === "tool_call" && e.toolName === "web_search")).toBe(true);
    expect(result.events.some((e) => e.type === "tool_result" && e.toolName === "web_search")).toBe(true);
  });

  it("llm_error path: LLM throws → FailureLogStore receives record with traceSnapshot", async () => {
    const { runAgenticLoopEngine } = await import("./agentic-loop-engine");
    failures.length = 0;

    const failingLLM: import("./ports/index").LLMProvider = {
      isAvailable: () => true,
      async complete() { throw new Error("Simulated LLM failure"); },
    };

    const result = await runAgenticLoopEngine({
      model: "gpt-5-mini",
      maxIterations: 3,
      maxTokens: 200,
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "What is 2+2?" }],
      context: { botId: 3, botName: "FailBot", clientId: 1, sessionId: 101, depth: 0 },
      loopConfig: { enableSelfEvaluation: false },
      deps: {
        llmProvider: failingLLM,
        toolRegistry: mockToolRegistry,
        memoryStore: intMemoryStore,
        configProvider: intConfigProvider,
        sessionStore: intSessionStore,
        failureLogStore: intFailureLogStore,
      },
    });

    expect(result.events.some((e) => e.type === "error")).toBe(true);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].failureCategory).toMatch(/reasoning_failure|circuit_open/);
    // LoopTrace must have been persisted to session_outcomes on failure path too
    const failureOutcome = sessionOutcomes.find((o) => o.sessionId === 101);
    expect(failureOutcome).toBeTruthy();
    expect(failureOutcome!.data.loopTrace).toBeTruthy();
  });

  it("MemoryStore: pre-existing memories are injected into loop context", async () => {
    const { runAgenticLoopEngine } = await import("./agentic-loop-engine");

    const capturedMessages: string[] = [];

    const memoryAwareLLM: import("./ports/index").LLMProvider = {
      isAvailable: () => true,
      async complete(opts) {
        capturedMessages.push(...opts.messages.map((m) => (m.content ?? "")));
        return { content: "Using memory context.", promptTokens: 80, completionTokens: 25, costCents: 1, model: "gpt-5-mini" };
      },
    };

    const memStoreWithData: import("./ports/index").MemoryStore = {
      async retrieve() {
        return [{ key: "user_name", value: "Alice" }, { key: "preference", value: "formal tone" }];
      },
      async store() {},
    };

    await runAgenticLoopEngine({
      model: "gpt-5-mini",
      maxIterations: 2,
      maxTokens: 200,
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Hi." }],
      context: { botId: 4, botName: "MemBot", clientId: 1, sessionId: 102, depth: 0 },
      loopConfig: { enableSelfEvaluation: false },
      deps: {
        llmProvider: memoryAwareLLM,
        toolRegistry: mockToolRegistry,
        memoryStore: memStoreWithData,
        configProvider: intConfigProvider,
        sessionStore: intSessionStore,
        failureLogStore: intFailureLogStore,
      },
    });

    // The memory context system message should have been included in the LLM call
    const joinedMessages = capturedMessages.join(" ");
    expect(joinedMessages).toContain("user_name");
    expect(joinedMessages).toContain("Alice");
  });
});
