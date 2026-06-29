import type { LLMProvider, LLMCompletionOptions, LLMCompletion } from "../ports/index.js";
import { recordSuccess, recordError, isCircuitOpen, syncCircuitFromRedis } from "../../services/ai-safety/circuit-breaker.js";
import { logLlmUsage } from "../../services/analytics/llm-usage.js";
import { ModelTier } from "../../services/ai-safety/model-fallback.js";

export const OLLAMA_CIRCUIT_KEY = "ollama";

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function: { name: string; arguments: Record<string, unknown> };
    }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaConfig {
  enabled: boolean;
  model: string;
  host: string;
}

let _config: OllamaConfig = {
  enabled: true,
  model: "llama3.2:3b",
  host: "localhost:11434",
};

let _available: boolean | null = null;
let _lastHealthCheck = 0;
const HEALTH_CHECK_TTL_MS = 60_000;

export function setOllamaConfig(config: Partial<OllamaConfig>): void {
  _config = { ..._config, ...config };
  _available = null;
  _lastHealthCheck = 0;
}

export function getOllamaConfig(): OllamaConfig {
  return { ..._config };
}

export async function checkOllamaHealth(): Promise<boolean> {
  const now = Date.now();
  if (_available !== null && now - _lastHealthCheck < HEALTH_CHECK_TTL_MS) {
    return _available;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`http://${_config.host}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    _available = response.ok;
    _lastHealthCheck = now;

    if (_available) {
      console.log(`[OllamaAdapter] Health check passed — host ${_config.host} is reachable`);
    } else {
      console.warn(`[OllamaAdapter] Health check failed — host ${_config.host} returned HTTP ${response.status}`);
    }

    return _available;
  } catch {
    _available = false;
    _lastHealthCheck = now;
    console.warn(`[OllamaAdapter] Health check failed — host ${_config.host} is unreachable`);
    return false;
  }
}

export function invalidateOllamaHealth(): void {
  _available = null;
  _lastHealthCheck = 0;
}

export class OllamaAdapter implements LLMProvider {
  isAvailable(): boolean {
    if (!_config.enabled) return false;
    if (isCircuitOpen(OLLAMA_CIRCUIT_KEY)) return false;
    if (_available === null) return true;
    return _available;
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletion> {
    // Sync circuit state from Redis before proceeding so that a breaker tripped
    // on any other instance is respected here even if the local cache is stale.
    await syncCircuitFromRedis(OLLAMA_CIRCUIT_KEY);
    if (isCircuitOpen(OLLAMA_CIRCUIT_KEY)) {
      throw new Error(`[OllamaAdapter] Circuit breaker open for ${OLLAMA_CIRCUIT_KEY}`);
    }

    const model = _config.model;
    const callStart = Date.now();

    const messages: OllamaMessage[] = options.messages.map((m) => ({
      role: m.role as OllamaMessage["role"],
      content: typeof m.content === "string" ? m.content : "",
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    }));

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      options: {
        num_predict: options.maxTokens ?? 1000,
        temperature: 0.2,
      },
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`http://${_config.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => `HTTP ${response.status}`);
      throw new Error(`Ollama API error: ${text}`);
    }

    const data = await response.json() as OllamaResponse;
    const latencyMs = Date.now() - callStart;
    const promptTokens = data.prompt_eval_count ?? 0;
    const completionTokens = data.eval_count ?? 0;

    const tool_calls = data.message.tool_calls?.map((tc, i) => ({
      id: tc.id ?? `call_${i}`,
      type: tc.type ?? "function",
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments),
      },
    }));

    if (options.clientId) {
      logLlmUsage({
        clientId: options.clientId,
        botId: options.botId,
        sessionId: options.sessionId ? Number(options.sessionId) : null,
        conversationId: options.conversationId ? Number(options.conversationId) : null,
        model,
        promptTokens,
        completionTokens,
        latencyMs,
        modelTier: ModelTier.LOCAL,
      }).catch(() => {});
    }

    recordSuccess(OLLAMA_CIRCUIT_KEY).catch((e) => console.warn("[OllamaAdapter] circuit record failed:", (e as Error).message));

    return {
      content: data.message.content ?? null,
      tool_calls: tool_calls && tool_calls.length > 0 ? tool_calls : undefined,
      promptTokens,
      completionTokens,
      costCents: 0,
      model,
    };
  }
}

export const ollamaAdapter = new OllamaAdapter();
