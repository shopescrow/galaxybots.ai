import { describe, it, expect, afterAll } from "vitest";
import { runAgenticLoop } from "./agentic-loop";
import { createTestUser, cleanupTestUser, type TestUser } from "../test-utils";
import { shouldPauseAutonomous, upsertCostCap } from "../services/analytics/cost-caps";
import { db, llmUsageLogTable, clientCostCapsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { setOpenAIMockHandler } from "../test-setup";

describe("Agentic loop smoke tests", () => {
  const testUsers: TestUser[] = [];

  afterAll(async () => {
    for (const u of testUsers) {
      await db.delete(llmUsageLogTable).where(eq(llmUsageLogTable.clientId, u.clientId)).catch(() => {});
      await db.delete(clientCostCapsTable).where(eq(clientCostCapsTable.clientId, u.clientId)).catch(() => {});
      await cleanupTestUser(u);
    }
  });

  it("should execute a basic loop and return a response (OpenAI mocked)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const result = await runAgenticLoop({
      model: "gpt-5.4",
      maxIterations: 10,
      maxTokens: 500,
      systemPrompt: "You are a helpful test assistant.",
      messages: [{ role: "user", content: "Hello, smoke test!" }],
      context: {
        clientId: user.clientId,
        botId: 1,
        botName: "TestBot",
      },
    });

    expect(result.finalContent).toBeTruthy();
    expect(typeof result.finalContent).toBe("string");
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events.some((e) => e.type === "bot_complete")).toBe(true);
  });

  it("should hit iteration cap at 10 and return fallback content when model always requests tool calls", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    let callCount = 0;
    setOpenAIMockHandler(() => {
      callCount++;
      return {
        id: `chatcmpl-toolloop-${callCount}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: `call_${callCount}`,
                  type: "function",
                  function: {
                    name: "web_search",
                    arguments: JSON.stringify({ query: "smoke test iteration" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };
    });

    const events: Array<{ type: string }> = [];
    const result = await runAgenticLoop({
      model: "gpt-5.4",
      maxIterations: 10,
      maxTokens: 500,
      systemPrompt: "You are a helpful test assistant.",
      messages: [{ role: "user", content: "Keep calling tools forever." }],
      context: {
        clientId: user.clientId,
        botId: 1,
        botName: "TestBot",
      },
      onEvent: (event) => {
        events.push({ type: event.type });
      },
    });

    expect(result.finalContent).toContain("maximum number of processing steps");
    expect(events.some((e) => e.type === "bot_complete")).toBe(true);
    expect(callCount).toBeLessThanOrEqual(11);
  }, 30000);

  it("should also enforce iteration cap at lower values (maxIterations: 2)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    setOpenAIMockHandler(() => {
      return {
        id: "chatcmpl-lowcap",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-5.4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_low",
                  type: "function",
                  function: {
                    name: "web_search",
                    arguments: JSON.stringify({ query: "low cap test" }),
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };
    });

    const result = await runAgenticLoop({
      model: "gpt-5.4",
      maxIterations: 2,
      maxTokens: 500,
      systemPrompt: "You are a helpful test assistant.",
      messages: [{ role: "user", content: "Respond concisely." }],
      context: {
        clientId: user.clientId,
        botId: 1,
        botName: "TestBot",
      },
    });

    expect(result.finalContent).toContain("maximum number of processing steps");
  });

  it("should report pauseAutonomous=true when cost cap is exceeded", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    await upsertCostCap(user.clientId, 0.01, false, true);

    await db.insert(llmUsageLogTable).values({
      clientId: user.clientId,
      botId: 1,
      model: "gpt-5.4",
      promptTokens: 50000,
      completionTokens: 50000,
      estimatedCostUsd: "100.00",
      latencyMs: 500,
    });

    const paused = await shouldPauseAutonomous(user.clientId);
    expect(paused).toBe(true);
  });

  it("should report pauseAutonomous=false when no cost cap is set", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const paused = await shouldPauseAutonomous(user.clientId);
    expect(paused).toBe(false);
  });
});
