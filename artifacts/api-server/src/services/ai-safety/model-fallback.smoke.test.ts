import { describe, it, expect, vi, beforeEach } from "vitest";

// These tests exercise callWithFallback end-to-end with the two external
// dispatch points mocked: the GLM52Adapter (Zhipu BigModel backend) and the
// shared `openai` proxy client. The goal is to lock in the contract that GLM
// 5.2 is the LEAD frontier model — a frontier request must try GLM first, must
// degrade cleanly to GPT/Claude when GLM is unavailable, and must log GLM usage
// with the right model name and tier. logLlmUsage is mocked so no DB is needed.

const { glmCompleteMock, glmIsAvailableMock, openaiCreateMock, logLlmUsageMock } = vi.hoisted(() => ({
  glmCompleteMock: vi.fn(),
  glmIsAvailableMock: vi.fn(),
  openaiCreateMock: vi.fn(),
  logLlmUsageMock: vi.fn(),
}));

vi.mock("../../agent-core/adapters/glm52-adapter", async (importActual) => {
  const actual = await importActual<typeof import("../../agent-core/adapters/glm52-adapter")>();
  return {
    ...actual,
    // Keep GLM_CIRCUIT_KEY ("glm") and isGlmModel() real so provider routing in
    // model-fallback behaves exactly as in production; only swap the network class.
    GLM52Adapter: vi.fn().mockImplementation(() => ({
      isAvailable: glmIsAvailableMock,
      complete: glmCompleteMock,
    })),
  };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: openaiCreateMock } } },
  isRateLimitError: () => false,
  OpenAI: class {},
}));

vi.mock("../analytics/llm-usage", () => ({
  logLlmUsage: logLlmUsageMock,
}));

import { callWithFallback, ModelTier } from "./model-fallback";
import { resetCircuit } from "./circuit-breaker";

const messages = [{ role: "user" as const, content: "hello" }];

function glmCompletion() {
  return {
    content: "GLM frontier response",
    tool_calls: undefined,
    promptTokens: 100,
    completionTokens: 40,
    costCents: 2,
    model: "glm-4.5",
  };
}

function openaiRawCompletion(content: string) {
  return {
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
  };
}

describe("callWithFallback — GLM 5.2 lead-model failover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCircuit("glm");
    resetCircuit("openai");
    resetCircuit("anthropic");
    glmIsAvailableMock.mockReturnValue(true);
    glmCompleteMock.mockResolvedValue(glmCompletion());
    openaiCreateMock.mockResolvedValue(openaiRawCompletion("GPT fallback response"));
  });

  it("routes a gpt-4o request to the GLM branch first when the key is present", async () => {
    const result = await callWithFallback({ model: "gpt-4o", messages, clientId: 1 });

    expect(glmCompleteMock).toHaveBeenCalledTimes(1);
    expect(glmCompleteMock.mock.calls[0][0].model).toBe("glm-5.2-plus");
    // GLM served the request — OpenAI proxy must NOT have been touched.
    expect(openaiCreateMock).not.toHaveBeenCalled();

    expect(result.model).toBe("glm-5.2-plus");
    expect(result.provider).toBe("glm");
    expect(result.fallbackUsed).toBe(false);
    expect(result.degraded).toBe(false);
    expect(result.completion.choices[0].message.content).toBe("GLM frontier response");
  });

  it("routes a gpt-5.4 request to the GLM ultra branch first when the key is present", async () => {
    const result = await callWithFallback({ model: "gpt-5.4", messages, clientId: 1 });

    expect(glmCompleteMock).toHaveBeenCalledTimes(1);
    expect(glmCompleteMock.mock.calls[0][0].model).toBe("glm-5.2-ultra");
    expect(openaiCreateMock).not.toHaveBeenCalled();
    expect(result.model).toBe("glm-5.2-ultra");
    expect(result.provider).toBe("glm");
  });

  it("degrades to GPT when GLM is unavailable (key absent) and still returns a successful completion", async () => {
    glmIsAvailableMock.mockReturnValue(false);

    const result = await callWithFallback({ model: "gpt-4o", messages, clientId: 1 });

    // GLM is skipped before any network attempt, so complete() is never called.
    expect(glmCompleteMock).not.toHaveBeenCalled();
    // Chain falls through to the next entry (gpt-4o via the openai proxy).
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock.mock.calls[0][0].model).toBe("gpt-4o");

    expect(result.model).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.fallbackUsed).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.completion.choices[0].message.content).toBe("GPT fallback response");
  });

  it("degrades to GPT when the GLM circuit is open", async () => {
    // Open the GLM circuit: ≥3 calls in window with ≥50% errors.
    const { recordError } = await import("./circuit-breaker");
    for (let i = 0; i < 5; i++) await recordError("glm");

    const result = await callWithFallback({ model: "gpt-4o", messages, clientId: 1 });

    expect(glmCompleteMock).not.toHaveBeenCalled();
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(result.model).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.fallbackUsed).toBe(true);

    resetCircuit("glm");
  });

  it("logs GLM usage via logLlmUsage with a glm-5.2* model name and the FRONTIER tier", async () => {
    await callWithFallback({ model: "gpt-4o", messages, clientId: 7, botId: 3 });

    expect(logLlmUsageMock).toHaveBeenCalledTimes(1);
    const logged = logLlmUsageMock.mock.calls[0][0];
    expect(logged.model).toMatch(/^glm-5\.2/);
    expect(logged.model).toBe("glm-5.2-plus");
    expect(logged.modelTier).toBe(ModelTier.FRONTIER);
    expect(logged.clientId).toBe(7);
    expect(logged.promptTokens).toBe(100);
    expect(logged.completionTokens).toBe(40);
  });
});
