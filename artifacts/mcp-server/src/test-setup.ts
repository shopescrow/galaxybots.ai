import { beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

process.env["MCP_API_KEY"] = "test-mcp-api-key";
process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = "http://localhost:59999/v1";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "test-openai-key";
process.env["NODE_ENV"] = "test";
process.env["PORT"] = "0";
process.env["BASE_PATH"] = "/__mcp";

const OPENAI_BASE = "http://localhost:59999";

const handlers = [
  http.post(`${OPENAI_BASE}/v1/chat/completions`, () => {
    return HttpResponse.json({
      id: "chatcmpl-test-mcp",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-5.4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Mocked MCP AI response.",
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  }),
  http.post("https://api.anthropic.com/v1/messages", () => {
    return HttpResponse.json({
      id: "msg-test-mcp",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Mocked Anthropic response." }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  }),
  http.post("https://api.twilio.com/2010-04-01/Accounts/:accountSid/Messages.json", () => {
    return HttpResponse.json({ sid: "SM_test_mcp", status: "queued" });
  }),
];

export const mswServer = setupServer(...handlers);

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  mswServer.resetHandlers();
});

afterAll(() => {
  mswServer.close();
});
