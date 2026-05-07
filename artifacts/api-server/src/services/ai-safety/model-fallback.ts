import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { adaptOpenAIToAnthropic } from "./prompt-adapter";
import { recordSuccess, recordError, isCircuitOpen } from "./circuit-breaker";
import { logLlmUsage } from "../analytics/llm-usage";

/**
 * The Replit AI integration proxy (`@workspace/integrations-openai-ai-server`)
 * routes requests to different providers based on the model name:
 * - "gpt-*" models → OpenAI's API
 * - "claude-*" models → Anthropic's API
 *
 * This means the single `openai` client is the gateway to multiple
 * independent provider backends. Circuit breaker states track "openai" vs
 * "anthropic" as separate providers — if Anthropic's API is down, only
 * claude-* calls fail while gpt-* calls continue working through the
 * same proxy.
 */

export interface CompletionResult {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function toCompletionResult(raw: Awaited<ReturnType<typeof openai.chat.completions.create>>): CompletionResult {
  const obj = raw as Record<string, unknown>;
  const choices = (obj.choices ?? []) as CompletionResult["choices"];
  const usage = obj.usage as CompletionResult["usage"] | undefined;
  return { choices, usage };
}

const FALLBACK_CHAINS: Record<string, string[]> = {
  "gpt-5.4": ["gpt-5.4", "gpt-4o", "claude-sonnet-4-6"],
  "gpt-4o": ["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-6"],
  "gpt-4o-mini": ["gpt-4o-mini", "gpt-4o", "claude-sonnet-4-6"],
  "claude-sonnet-4-6": ["claude-sonnet-4-6", "gpt-4o"],
};

function getProvider(model: string): string {
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

function isRetryableError(err: unknown): boolean {
  if (isRateLimitError(err)) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("500")) return true;
    if (msg.includes("rate") || msg.includes("overloaded") || msg.includes("capacity")) return true;
  }
  const statusCode = (err as { status?: number })?.status;
  if (statusCode && (statusCode === 429 || statusCode >= 500)) return true;
  return false;
}

export interface FallbackCallResult {
  completion: CompletionResult;
  model: string;
  provider: string;
  fallbackUsed: boolean;
  degraded: boolean;
}

export async function callWithFallback(options: {
  model: string;
  messages: ChatCompletionMessageParam[];
  maxCompletionTokens?: number;
  tools?: unknown[];
  temperature?: number;
  clientId?: number;
  botId?: number;
  sessionId?: number;
  conversationId?: number;
}): Promise<FallbackCallResult> {
  const chain = FALLBACK_CHAINS[options.model] ?? [options.model];
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const provider = getProvider(model);

    if (isCircuitOpen(provider)) {
      console.log(`[ModelFallback] Skipping ${model} (${provider} circuit open)`);
      continue;
    }

    try {
      const callStart = Date.now();
      let completion: CompletionResult;

      if (provider === "anthropic") {
        const adapted = adaptOpenAIToAnthropic(options.messages);
        const anthropicMessages = adapted.messages.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));

        const allMessages: ChatCompletionMessageParam[] = [];
        if (adapted.system) {
          allMessages.push({ role: "system", content: adapted.system });
        }
        allMessages.push(...anthropicMessages);

        const raw = await openai.chat.completions.create({
          model,
          messages: allMessages,
          max_completion_tokens: options.maxCompletionTokens,
          ...(options.tools && options.tools.length > 0 ? { tools: options.tools as Parameters<typeof openai.chat.completions.create>[0]["tools"] } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        });
        completion = toCompletionResult(raw);
      } else {
        const raw = await openai.chat.completions.create({
          model,
          messages: options.messages,
          max_completion_tokens: options.maxCompletionTokens,
          ...(options.tools && options.tools.length > 0 ? { tools: options.tools as Parameters<typeof openai.chat.completions.create>[0]["tools"] } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        });
        completion = toCompletionResult(raw);
      }

      const latencyMs = Date.now() - callStart;
      recordSuccess(provider);

      if (completion.usage && options.clientId) {
        logLlmUsage({
          clientId: options.clientId,
          botId: options.botId,
          sessionId: options.sessionId ? Number(options.sessionId) : null,
          conversationId: options.conversationId ? Number(options.conversationId) : null,
          model,
          promptTokens: completion.usage.prompt_tokens ?? 0,
          completionTokens: completion.usage.completion_tokens ?? 0,
          latencyMs,
        });
      }

      return {
        completion,
        model,
        provider,
        fallbackUsed: i > 0,
        degraded: false,
      };
    } catch (err) {
      lastError = err;
      recordError(provider);
      console.error(`[ModelFallback] ${model} (${provider}) failed:`, err instanceof Error ? err.message : err);

      if (!isRetryableError(err) && i === 0) {
        throw err;
      }
    }
  }

  throw new Error(
    `All models in fallback chain failed. Last error: ${lastError instanceof Error ? lastError.message : "Unknown error"}. The AI service is temporarily experiencing issues — please try again in a few moments.`
  );
}
