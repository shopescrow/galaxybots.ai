import { beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import * as nodeHttp from "node:http";

const OPENAI_MOCK_PORT = 59999;

process.env["JWT_SECRET"] = "test-jwt-secret-for-smoke-tests";
process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = `http://localhost:${OPENAI_MOCK_PORT}/v1`;
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = "test-openai-key";
process.env["WEBHOOK_SECRET_KEY"] = "test-webhook-secret-key-32chars!!";
process.env["NODE_ENV"] = "test";
process.env["STRIPE_SECRET_KEY"] = "sk_test_smoke_key";
process.env["STRIPE_PRICE_ID_SINGLE"] = "price_test_single";
process.env["STRIPE_PRICE_ID_TEAM"] = "price_test_team";
process.env["STRIPE_PRICE_ID_ENTERPRISE"] = "price_test_enterprise";

let openaiMockServer: nodeHttp.Server;

let openaiMockHandler: ((req: nodeHttp.IncomingMessage, body: string) => object) | null = null;

export function setOpenAIMockHandler(handler: ((req: nodeHttp.IncomingMessage, body: string) => object) | null) {
  openaiMockHandler = handler;
}

function defaultOpenAIResponse() {
  return {
    id: "chatcmpl-test-123",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "This is a mocked AI response for smoke testing.",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 50,
      completion_tokens: 20,
      total_tokens: 70,
    },
  };
}

function defaultEmbeddingResponse() {
  const vec = new Float32Array(1536);
  vec[0] = 1;
  const b64 = Buffer.from(vec.buffer).toString("base64");
  return {
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: b64 }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 1, total_tokens: 1 },
  };
}

export const anthropicHandlers = [
  http.post("https://api.anthropic.com/v1/messages", () => {
    return HttpResponse.json({
      id: "msg-test-123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Mocked Anthropic response." }],
      model: "claude-sonnet-4-20250514",
      usage: { input_tokens: 40, output_tokens: 15 },
    });
  }),
];

export const twilioHandlers = [
  http.post("https://api.twilio.com/2010-04-01/Accounts/:accountSid/Messages.json", () => {
    return HttpResponse.json({
      sid: "SM_test_smoke_123",
      status: "queued",
      to: "+15551234567",
      from: "+15559876543",
    });
  }),
  http.post("https://api.twilio.com/2010-04-01/Accounts/:accountSid/Calls.json", () => {
    return HttpResponse.json({
      sid: "CA_test_smoke_123",
      status: "queued",
      to: "+15551234567",
      from: "+15559876543",
    });
  }),
];

export const stripeHandlers: ReturnType<typeof http.post>[] = [];

export const mswServer = setupServer(
  ...anthropicHandlers,
  ...twilioHandlers,
  ...stripeHandlers,
);

beforeAll(async () => {
  openaiMockServer = nodeHttp.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (openaiMockHandler) {
        res.end(JSON.stringify(openaiMockHandler(req, body)));
      } else if (req.url?.includes("/embeddings")) {
        res.end(JSON.stringify(defaultEmbeddingResponse()));
      } else {
        res.end(JSON.stringify(defaultOpenAIResponse()));
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    openaiMockServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve();
      } else {
        reject(err);
      }
    });
    openaiMockServer.listen(OPENAI_MOCK_PORT, () => resolve());
  });

  mswServer.listen({ onUnhandledRequest: "bypass" });
});

afterEach(() => {
  openaiMockHandler = null;
  mswServer.resetHandlers();
});

afterAll(async () => {
  mswServer.close();
  await new Promise<void>((resolve) => {
    openaiMockServer?.close(() => resolve());
  });
});
