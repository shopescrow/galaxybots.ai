import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { adaptOpenAIToAnthropic } from "./prompt-adapter";
import { recordSuccess, recordError, isCircuitOpen } from "./circuit-breaker";
import { logLlmUsage } from "../analytics/llm-usage";
import { GLM52Adapter, GLM_CIRCUIT_KEY, isGlmModel } from "../../agent-core/adapters/glm52-adapter";

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
 *
 * GLM ("glm-5.2*") models are NOT served by the Replit proxy — they are
 * dispatched through the dedicated GLM52Adapter (Zhipu BigModel API) which
 * is the single integration point for that backend. GLM has its own
 * circuit-breaker provider key ("glm") so its health is tracked
 * independently of openai/anthropic, and it participates in fallback in both
 * directions (degrading to GPT/Claude, and serving as a fallback option for
 * the GPT/Claude chains).
 */

/**
 * ModelTier defines which cost/capability tier a call should use:
 *  - LOCAL     : Ollama self-hosted (cost $0). Used for coordinator/conductor reasoning.
 *  - EFFICIENT : Cheaper cloud models (gpt-5-mini / claude-haiku). Fallback from LOCAL.
 *  - FRONTIER  : Best cloud models (gpt-4o / claude-sonnet). Reserved for actual agent work.
 */
export enum ModelTier {
  LOCAL = "local",
  EFFICIENT = "efficient",
  FRONTIER = "frontier",
}

const TIER_EFFICIENT_MODELS = ["gpt-5-mini", "claude-haiku-4-6"];
const TIER_FRONTIER_MODELS = ["gpt-4o", "claude-sonnet-4-6"];

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
  const obj = raw as unknown as Record<string, unknown>;
  const choices = (obj.choices ?? []) as CompletionResult["choices"];
  const usage = obj.usage as CompletionResult["usage"] | undefined;
  return { choices, usage };
}

const FALLBACK_CHAINS: Record<string, string[]> = {
  // GLM 5.2 is the lead frontier model: a request for any frontier model tries
  // GLM first, then degrades to GPT-5.4 / GPT-4o / Claude if Zhipu is down or
  // the key is absent. (gpt-5-mini stays the cheap EFFICIENT-tier workhorse.)
  "gpt-5.4": ["glm-5.2-ultra", "gpt-5.4", "gpt-4o", "claude-sonnet-4-6"],
  "gpt-4o": ["glm-5.2-plus", "gpt-4o", "claude-sonnet-4-6", "gpt-5-mini"],
  "claude-sonnet-4-6": ["glm-5.2-plus", "claude-sonnet-4-6", "gpt-4o"],
  "gpt-5-mini": ["gpt-5-mini", "gpt-4o", "claude-sonnet-4-6", "glm-5.2-flash"],
  // GLM models fail over to GPT/Claude if Zhipu is unavailable.
  "glm-5.2": ["glm-5.2", "gpt-4o", "claude-sonnet-4-6"],
  "glm-5.2-flash": ["glm-5.2-flash", "gpt-5-mini", "claude-sonnet-4-6"],
  "glm-5.2-plus": ["glm-5.2-plus", "gpt-4o", "claude-sonnet-4-6"],
  "glm-5.2-long": ["glm-5.2-long", "gpt-4o", "claude-sonnet-4-6"],
  "glm-5.2-ultra": ["glm-5.2-ultra", "gpt-5.4", "gpt-4o", "claude-sonnet-4-6"],
};

function getProvider(model: string): string {
  if (isGlmModel(model)) return GLM_CIRCUIT_KEY;
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

function inferTierForModel(model: string): ModelTier {
  // GLM variants: flash/base are cheap (EFFICIENT), plus/long/ultra are FRONTIER-class.
  if (isGlmModel(model)) {
    if (model === "glm-5.2" || model.startsWith("glm-5.2-flash")) return ModelTier.EFFICIENT;
    return ModelTier.FRONTIER;
  }
  if (TIER_EFFICIENT_MODELS.some((m) => model.startsWith(m.split("-").slice(0, 2).join("-")))) return ModelTier.EFFICIENT;
  if (TIER_FRONTIER_MODELS.some((m) => model.startsWith(m.split("-").slice(0, 2).join("-")))) return ModelTier.FRONTIER;
  if (model.startsWith("gpt-5-mini") || model.includes("haiku")) return ModelTier.EFFICIENT;
  return ModelTier.FRONTIER;
}

export interface FallbackCallResult {
  completion: CompletionResult;
  model: string;
  provider: string;
  fallbackUsed: boolean;
  degraded: boolean;
  tier: ModelTier;
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
  preferredTier?: ModelTier;
}): Promise<FallbackCallResult> {
  const { preferredTier } = options;

  if (preferredTier === ModelTier.LOCAL) {
    const { checkOllamaHealth, ollamaAdapter, OLLAMA_CIRCUIT_KEY } = await import("../../agent-core/adapters/ollama-adapter.js");
    const { isCircuitOpen: cbOpen } = await import("./circuit-breaker.js");

    const localAvailable = !cbOpen(OLLAMA_CIRCUIT_KEY) && await checkOllamaHealth();

    if (localAvailable) {
      try {
        const portMessages = options.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant" | "tool",
          content: typeof m.content === "string" ? m.content : (m.content == null ? "" : String(m.content)),
          ...(("tool_calls" in m && m.tool_calls) ? { tool_calls: m.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> } : {}),
          ...(("tool_call_id" in m && m.tool_call_id) ? { tool_call_id: m.tool_call_id as string } : {}),
        }));

        const result = await ollamaAdapter.complete({
          model: options.model,
          messages: portMessages,
          maxTokens: options.maxCompletionTokens,
          tools: options.tools as Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined,
          clientId: options.clientId,
          botId: options.botId,
          sessionId: options.sessionId,
          conversationId: options.conversationId,
        });

        return {
          completion: {
            choices: [{
              message: {
                content: result.content,
                tool_calls: result.tool_calls,
              },
              finish_reason: "stop",
            }],
            usage: { prompt_tokens: result.promptTokens, completion_tokens: result.completionTokens, total_tokens: result.promptTokens + result.completionTokens },
          },
          model: result.model,
          provider: "ollama",
          fallbackUsed: false,
          degraded: false,
          tier: ModelTier.LOCAL,
        };
      } catch (err) {
        const { recordError } = await import("./circuit-breaker.js");
        recordError(OLLAMA_CIRCUIT_KEY);
        console.warn("[ModelFallback] LOCAL tier (Ollama) failed, falling back to EFFICIENT:", err instanceof Error ? err.message : err);
      }
    } else {
      console.log("[ModelFallback] LOCAL tier requested but Ollama unavailable — falling back to EFFICIENT tier");
    }

    const efficientModel = TIER_EFFICIENT_MODELS[0] ?? "gpt-5-mini";
    const result = await callWithFallback({ ...options, model: efficientModel, preferredTier: ModelTier.EFFICIENT });
    return { ...result, fallbackUsed: true, degraded: true, tier: ModelTier.EFFICIENT };
  }

  const chain = FALLBACK_CHAINS[options.model] ?? [options.model];
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const provider = getProvider(model);

    if (isCircuitOpen(provider)) {
      console.log(`[ModelFallback] Skipping ${model} (${provider} circuit open)`);
      continue;
    }

    // GLM key absent → skip silently so the chain degrades to GPT/Claude exactly
    // as it would today (GLM never makes the system less reliable).
    if (provider === GLM_CIRCUIT_KEY && !new GLM52Adapter().isAvailable()) {
      console.log(`[ModelFallback] Skipping ${model} (GLM key not configured)`);
      continue;
    }

    try {
      const callStart = Date.now();
      let completion: CompletionResult;

      if (provider === GLM_CIRCUIT_KEY) {
        const glm = new GLM52Adapter();
        const glmMessages = options.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant" | "tool",
          content: typeof m.content === "string" ? m.content : (m.content == null ? null : String(m.content)),
          ...(("tool_calls" in m && m.tool_calls) ? { tool_calls: m.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> } : {}),
          ...(("tool_call_id" in m && m.tool_call_id) ? { tool_call_id: m.tool_call_id as string } : {}),
        }));

        const glmResult = await glm.complete({
          model,
          messages: glmMessages,
          maxTokens: options.maxCompletionTokens,
          tools: options.tools as Parameters<GLM52Adapter["complete"]>[0]["tools"],
          clientId: options.clientId,
          botId: options.botId,
          sessionId: options.sessionId ? Number(options.sessionId) : undefined,
          conversationId: options.conversationId ? Number(options.conversationId) : undefined,
        });

        completion = {
          choices: [{
            message: { content: glmResult.content, tool_calls: glmResult.tool_calls },
            finish_reason: "stop",
          }],
          usage: {
            prompt_tokens: glmResult.promptTokens,
            completion_tokens: glmResult.completionTokens,
            total_tokens: glmResult.promptTokens + glmResult.completionTokens,
          },
        };
      } else if (provider === "anthropic") {
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

      const tier = preferredTier ?? inferTierForModel(model);

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
          modelTier: tier,
        });
      }

      return {
        completion,
        model,
        provider,
        fallbackUsed: i > 0,
        degraded: false,
        tier,
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
