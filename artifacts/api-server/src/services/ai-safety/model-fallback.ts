import type { OpenAI } from "@workspace/integrations-openai-ai-server";
type ChatCompletionMessageParam = OpenAI.ChatCompletionMessageParam;
import { openai } from "@workspace/integrations-openai-ai-server";
import { isRateLimitError } from "@workspace/integrations-openai-ai-server";
import { adaptOpenAIToAnthropic } from "./prompt-adapter";
import { recordSuccess, recordError, recordRateLimit, isCircuitOpen, isCircuitOpenAsync } from "./circuit-breaker";
import { logLlmUsage, estimateCost } from "../analytics/llm-usage";
import { GLM52Adapter, GLM_CIRCUIT_KEY, isGlmModel, isGlmRateLimitError } from "../../agent-core/adapters/glm52-adapter";
import { pickGlmKey, glmPoolHasKeys } from "./provider-key-pool";
import { checkTokenQuotaAdmission, reconcileTokenUsage, rollbackTokenReservation } from "./tenant-quota";
import {
  checkBudgetAdmission,
  checkGlobalBudgetAdmission,
  reconcileBudgetSpend,
  rollbackBudgetReservation,
} from "./budget-enforcer";
import { getTracer, setSpanError, SpanStatusCode } from "../../lib/tracing.js";

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
 * now draws keys from a multi-key pool (ZHIPU_API_KEY, ZHIPU_API_KEY_1, …).
 * GLM has its own circuit-breaker provider key ("glm") so its health is tracked
 * independently of openai/anthropic.
 *
 * Rate-limit (429) responses from any provider are handled distinctly from
 * true outages: they back off the specific key / back off and retry rather
 * than tripping the global circuit breaker for that provider.
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

// EFFICIENT fallback chains — these start from cheap models only so admission
// enforcement that forces EFFICIENT tier doesn't re-enter the FRONTIER chain.
const EFFICIENT_FALLBACK_CHAINS: Record<string, string[]> = {
  "gpt-5-mini": ["gpt-5-mini", "claude-haiku-4-6"],
  "claude-haiku-4-6": ["claude-haiku-4-6", "gpt-5-mini"],
};

function getProvider(model: string): string {
  if (isGlmModel(model)) return GLM_CIRCUIT_KEY;
  if (model.startsWith("claude")) return "anthropic";
  return "openai";
}

/**
 * Distinguish rate-limit signals from true outages.
 *
 * Rate-limit (429): the backend is reachable but throttling this key/tenant.
 *   → back off the specific key; do NOT trip the global circuit breaker.
 * True outage (5xx, timeout, network): the backend may be down.
 *   → recordError() and potentially trip the breaker.
 */
function isRateLimitSignal(err: unknown): boolean {
  if (isRateLimitError(err)) return true;
  if (isGlmRateLimitError(err)) return true;
  const statusCode = (err as { status?: number })?.status;
  if (statusCode === 429) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("quota exceeded")) return true;
  }
  return false;
}

function isRetryableError(err: unknown): boolean {
  if (isRateLimitSignal(err)) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("500")) return true;
    if (msg.includes("overloaded") || msg.includes("capacity")) return true;
  }
  const statusCode = (err as { status?: number })?.status;
  if (statusCode && statusCode >= 500) return true;
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
  quotaDegraded?: boolean;
  budgetDegraded?: boolean;
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/**
 * Internal call implementation shared by FRONTIER, EFFICIENT, and LOCAL paths.
 *
 * Accepts an explicit `modelChain` so forced-tier paths can pass in a pre-built
 * efficient-only chain without re-running admission checks (which would recurse).
 */
async function executeChain(options: {
  model: string;
  modelChain: string[];
  messages: ChatCompletionMessageParam[];
  maxCompletionTokens?: number;
  tools?: unknown[];
  temperature?: number;
  clientId?: number;
  botId?: number;
  sessionId?: number;
  conversationId?: number;
  effectiveTier: ModelTier;
  quotaDegraded: boolean;
  budgetDegraded: boolean;
}): Promise<FallbackCallResult> {
  const chain = options.modelChain;
  let lastError: unknown;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const provider = getProvider(model);

    if (await isCircuitOpenAsync(provider)) {
      console.log(`[ModelFallback] Skipping ${model} (${provider} circuit open)`);
      continue;
    }

    // GLM key pool absent → skip silently so the chain degrades to GPT/Claude.
    if (provider === GLM_CIRCUIT_KEY && !glmPoolHasKeys()) {
      console.log(`[ModelFallback] Skipping ${model} (GLM key pool empty)`);
      continue;
    }

    const callStart = Date.now();
    const tracer = getTracer();

    try {
      let completion: CompletionResult;

      if (provider === GLM_CIRCUIT_KEY) {
        // Inner key-rotation loop: exhaust ALL healthy GLM keys before advancing
        // to GPT/Claude. A single 429 from one key does not mean the model is down —
        // other keys in the pool may still be healthy.
        const glmMessages = options.messages.map((m) => ({
          role: m.role as "system" | "user" | "assistant" | "tool",
          content: typeof m.content === "string" ? m.content : (m.content == null ? null : String(m.content)),
          ...(("tool_calls" in m && m.tool_calls) ? { tool_calls: m.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }> } : {}),
          ...(("tool_call_id" in m && m.tool_call_id) ? { tool_call_id: m.tool_call_id as string } : {}),
        }));

        let glmKeyEntry = pickGlmKey();
        if (!glmKeyEntry) {
          console.log(`[ModelFallback] Skipping ${model} (all GLM keys rate-limited)`);
          continue; // advance outer chain to GPT/Claude
        }

        let glmCompletion: CompletionResult | undefined;
        while (glmKeyEntry && !glmCompletion) {
          const currentKey = glmKeyEntry;
          try {
            const glm = new GLM52Adapter(currentKey.key, currentKey.label);
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

            glmCompletion = {
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
          } catch (keyErr) {
            if (isRateLimitSignal(keyErr) || isGlmRateLimitError(keyErr)) {
              // Mark this key rate-limited and try the next healthy one.
              const { markGlmKeyRateLimited } = await import("./provider-key-pool.js");
              markGlmKeyRateLimited(currentKey.key);
              recordRateLimit(provider);
              console.warn(`[ModelFallback] GLM key ${currentKey.label} rate-limited on ${model} — trying next key in pool`);
              glmKeyEntry = pickGlmKey(); // may return null if no more healthy keys
            } else {
              // Non-rate-limit error (e.g. API error, malformed response) — treat as
              // outage for this model and let the outer chain advance to GPT/Claude.
              throw keyErr;
            }
          }
        }

        if (!glmCompletion) {
          // All GLM keys were rate-limited — let the outer loop advance to GPT/Claude.
          console.warn(`[ModelFallback] All GLM keys rate-limited for ${model} — falling through to next provider`);
          recordRateLimit(provider);
          lastError = new Error(`All GLM keys rate-limited for ${model}`);
          continue; // outer loop: advance to next model/provider in chain
        }
        completion = glmCompletion;
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
      recordSuccess(provider).catch((e) => console.warn("[ModelFallback] circuit record failed:", (e as Error).message));

      const promptTokens = completion.usage?.prompt_tokens ?? 0;
      const completionTokens = completion.usage?.completion_tokens ?? 0;

      if (completion.usage && options.clientId) {
        logLlmUsage({
          clientId: options.clientId,
          botId: options.botId,
          sessionId: options.sessionId ? Number(options.sessionId) : null,
          conversationId: options.conversationId ? Number(options.conversationId) : null,
          model,
          promptTokens,
          completionTokens,
          latencyMs,
          modelTier: options.effectiveTier,
        });
      }

      tracer.startActiveSpan("llm.completion", (llmSpan) => {
        llmSpan.setAttributes({
          "llm.model": model,
          "llm.provider": provider,
          "llm.prompt_tokens": promptTokens,
          "llm.completion_tokens": completionTokens,
          "llm.latency_ms": latencyMs,
          "llm.fallback_used": i > 0,
          "llm.success": true,
          "llm.tier": options.effectiveTier,
        });
        llmSpan.setStatus({ code: SpanStatusCode.OK });
        llmSpan.end();
      });


      return {
        completion,
        model,
        provider,
        fallbackUsed: i > 0,
        degraded: false,
        tier: options.effectiveTier,
        quotaDegraded: options.quotaDegraded,
        budgetDegraded: options.budgetDegraded,
      };
    } catch (err) {
      lastError = err;

      if (isRateLimitSignal(err)) {
        // Rate-limit: back off this key/provider but do NOT trip the global breaker.
        recordRateLimit(provider);
        console.warn(`[ModelFallback] ${model} (${provider}) rate-limited — advancing fallback chain`);
      } else {
        // True outage: count against circuit-breaker threshold.
        recordError(provider).catch((e) => console.warn("[ModelFallback] circuit record failed:", (e as Error).message));
        console.error(`[ModelFallback] ${model} (${provider}) failed:`, err instanceof Error ? err.message : err);
      }

      if (!isRetryableError(err) && i === 0) {
        throw err;
      }
    }
  }

  throw new Error(
    `All models in fallback chain failed. Last error: ${lastError instanceof Error ? lastError.message : "Unknown error"}. The AI service is temporarily experiencing issues — please try again in a few moments.`
  );
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
  const { preferredTier, clientId } = options;

  // ── LOCAL tier: skip paid-budget admission — Ollama is self-hosted, $0 cost ─
  // Running quota/budget checks against free local inference would incorrectly
  // block or degrade calls that have no provider spend impact whatsoever.
  if (preferredTier === ModelTier.LOCAL) {
    const { checkOllamaHealth, ollamaAdapter, OLLAMA_CIRCUIT_KEY } = await import("../../agent-core/adapters/ollama-adapter.js");
    const { isCircuitOpenAsync: cbOpenAsync } = await import("./circuit-breaker.js");

    const localAvailable = !(await cbOpenAsync(OLLAMA_CIRCUIT_KEY)) && await checkOllamaHealth();

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

        const totalTokens = result.promptTokens + result.completionTokens;
        // Local (Ollama) inference has no shared-provider cost — do NOT burn tenant quota.

        return {
          completion: {
            choices: [{ message: { content: result.content, tool_calls: result.tool_calls }, finish_reason: "stop" }],
            usage: { prompt_tokens: result.promptTokens, completion_tokens: result.completionTokens, total_tokens: totalTokens },
          },
          model: result.model,
          provider: "ollama",
          fallbackUsed: false,
          degraded: false,
          tier: ModelTier.LOCAL,
          quotaDegraded: false,
          budgetDegraded: false,
        };
      } catch (err) {
        const { recordError } = await import("./circuit-breaker.js");
        recordError(OLLAMA_CIRCUIT_KEY).catch((e) => console.warn("[ModelFallback] circuit record failed:", (e as Error).message));
        console.warn("[ModelFallback] LOCAL tier (Ollama) failed, falling back to EFFICIENT:", err instanceof Error ? err.message : err);
      }
    } else {
      console.log("[ModelFallback] LOCAL tier requested but Ollama unavailable — falling back to EFFICIENT tier");
    }

    // LOCAL failed → fall through to cloud EFFICIENT chain.
    // Apply paid admission for cloud fallback and track reservations so they can be
    // reconciled on success or rolled back on total failure.
    const fallbackEfficientModel = TIER_EFFICIENT_MODELS[0] ?? "gpt-5-mini";
    const cloudMsgChars = options.messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0);
    const cloudEstimatedPromptTokens = Math.ceil(cloudMsgChars / 4);
    const cloudEstimatedCompletionTokens = options.maxCompletionTokens ?? 500;
    const cloudEstimatedTokens = cloudEstimatedPromptTokens + cloudEstimatedCompletionTokens;
    // Use efficient fallback model for model-aware admission estimate.
    const cloudEstimatedCostUsd = estimateCost(fallbackEfficientModel, cloudEstimatedPromptTokens, cloudEstimatedCompletionTokens);

    let cloudForcedTier: ModelTier | undefined;
    let cloudQuotaDegraded = false;
    let cloudBudgetDegraded = false;
    let cloudReservedMonthly = 0;
    let cloudReservedMinute = 0;
    let cloudReservedTenantMicroUsd = 0;
    let cloudReservedGlobalMicroUsd = 0;

    if (clientId) {
      // checkBudgetAdmission handles global cap internally — no separate global call.
      const [quotaResult, budgetResult] = await Promise.all([
        checkTokenQuotaAdmission(clientId, cloudEstimatedTokens),
        checkBudgetAdmission(clientId, cloudEstimatedCostUsd),
      ]);
      if (!quotaResult.allowed) throw new QuotaExceededError(quotaResult.reason ?? "Monthly token quota exhausted");
      if (!budgetResult.allowed) {
        rollbackTokenReservation(clientId, quotaResult.reservedMonthlyTokens, quotaResult.reservedMinuteTokens);
        throw new BudgetExceededError(budgetResult.reason ?? "Monthly spend cap reached");
      }
      cloudReservedMonthly = quotaResult.reservedMonthlyTokens;
      cloudReservedMinute = quotaResult.reservedMinuteTokens;
      cloudReservedTenantMicroUsd = budgetResult.reservedTenantMicroUsd;
      cloudReservedGlobalMicroUsd = budgetResult.reservedGlobalMicroUsd;
      if (quotaResult.degradedTier || budgetResult.degradedTier) {
        cloudForcedTier = ModelTier.EFFICIENT;
        cloudQuotaDegraded = !!quotaResult.degradedTier;
        cloudBudgetDegraded = !!budgetResult.degradedTier;
      }
    } else {
      // No clientId: check global cap only.
      const globalResult = await checkGlobalBudgetAdmission(cloudEstimatedCostUsd);
      if (globalResult) {
        if (!globalResult.allowed) throw new BudgetExceededError(globalResult.reason ?? "Global LLM spend ceiling reached");
        cloudReservedGlobalMicroUsd = globalResult.reservedGlobalMicroUsd;
        if (globalResult.degradedTier) cloudForcedTier = ModelTier.EFFICIENT;
      }
    }

    const cloudChain =
      cloudForcedTier === ModelTier.EFFICIENT
        ? (EFFICIENT_FALLBACK_CHAINS[fallbackEfficientModel] ?? TIER_EFFICIENT_MODELS)
        : (FALLBACK_CHAINS[fallbackEfficientModel] ?? TIER_EFFICIENT_MODELS);

    try {
      const cloudResult = await executeChain({
        ...options,
        modelChain: cloudChain,
        effectiveTier: cloudForcedTier ?? ModelTier.EFFICIENT,
        quotaDegraded: cloudQuotaDegraded,
        budgetDegraded: cloudBudgetDegraded,
      });
      // Reconcile actual usage against reservations.
      const cloudActualTokens = (cloudResult.completion.usage?.prompt_tokens ?? 0) + (cloudResult.completion.usage?.completion_tokens ?? 0);
      const { estimateCost: ecs } = await import("../analytics/llm-usage.js");
      const cloudActualCost = ecs(cloudResult.model, cloudResult.completion.usage?.prompt_tokens ?? 0, cloudResult.completion.usage?.completion_tokens ?? 0);
      if (clientId) reconcileTokenUsage(clientId, cloudReservedMonthly, cloudActualTokens);
      reconcileBudgetSpend(clientId ?? null, cloudReservedTenantMicroUsd, cloudReservedGlobalMicroUsd, cloudActualCost);
      return cloudResult;
    } catch (cloudErr) {
      if (clientId) rollbackTokenReservation(clientId, cloudReservedMonthly, cloudReservedMinute);
      rollbackBudgetReservation(clientId ?? null, cloudReservedTenantMicroUsd, cloudReservedGlobalMicroUsd);
      throw cloudErr;
    }
  }

  // ── Admission gate for non-LOCAL paths ────────────────────────────────────
  // Estimate tokens conservatively: 1 token ≈ 4 chars.
  const msgChars = options.messages.reduce(
    (n, m) => n + (typeof m.content === "string" ? m.content.length : 0),
    0,
  );
  const estimatedPromptTokens = Math.ceil(msgChars / 4);
  const estimatedCompletionTokens = options.maxCompletionTokens ?? 500;
  const estimatedTokens = estimatedPromptTokens + estimatedCompletionTokens;
  // Use the primary model for a conservative (model-aware) admission cost estimate.
  // estimateCost uses real per-model pricing, so frontier calls are not underestimated.
  const estimatedCostUsd = estimateCost(options.model, estimatedPromptTokens, estimatedCompletionTokens);

  let forcedTier: ModelTier | undefined;
  let quotaDegraded = false;
  let budgetDegraded = false;
  let reservedMonthlyTokens = 0;
  let reservedMinuteTokens = 0;
  let reservedTenantMicroUsd = 0;
  let globalReservedMicroUsd = 0;

  if (clientId) {
    // checkBudgetAdmission handles global cap internally — avoids double reservation.
    const [quotaResult, budgetResult] = await Promise.all([
      checkTokenQuotaAdmission(clientId, estimatedTokens),
      checkBudgetAdmission(clientId, estimatedCostUsd),
    ]);

    if (!quotaResult.allowed) {
      // Roll back any budget that was atomically reserved while quota was being checked.
      rollbackBudgetReservation(clientId, budgetResult.reservedTenantMicroUsd, budgetResult.reservedGlobalMicroUsd);
      throw new QuotaExceededError(quotaResult.reason ?? "Monthly token quota exhausted");
    }
    if (!budgetResult.allowed) {
      rollbackTokenReservation(clientId, quotaResult.reservedMonthlyTokens, quotaResult.reservedMinuteTokens);
      throw new BudgetExceededError(budgetResult.reason ?? "Monthly spend cap reached");
    }

    reservedMonthlyTokens = quotaResult.reservedMonthlyTokens;
    reservedMinuteTokens = quotaResult.reservedMinuteTokens;
    reservedTenantMicroUsd = budgetResult.reservedTenantMicroUsd;
    globalReservedMicroUsd = budgetResult.reservedGlobalMicroUsd; // set by checkBudgetAdmission

    if (quotaResult.degradedTier || budgetResult.degradedTier) {
      forcedTier = ModelTier.EFFICIENT;
      if (quotaResult.degradedTier) {
        quotaDegraded = true;
        console.log(`[ModelFallback] Token quota admission: ${quotaResult.reason}`);
      }
      if (budgetResult.degradedTier) {
        budgetDegraded = true;
        console.log(`[ModelFallback] Budget admission: ${budgetResult.reason}`);
      }
    }
  } else {
    // No clientId: check global cap only (no tenant reservation).
    const globalResult = await checkGlobalBudgetAdmission(estimatedCostUsd);
    if (globalResult) {
      if (!globalResult.allowed) {
        throw new BudgetExceededError(globalResult.reason ?? "Global LLM spend ceiling reached");
      }
      globalReservedMicroUsd = globalResult.reservedGlobalMicroUsd;
      if (globalResult.degradedTier) {
        forcedTier = ModelTier.EFFICIENT;
        console.log(`[ModelFallback] Global budget: ${globalResult.reason}`);
      }
    }
  }

  // Helper to reconcile actual usage against reserved amounts (fire-and-forget).
  const reconcileReservations = async (result: FallbackCallResult): Promise<void> => {
    const actualTokens =
      (result.completion.usage?.prompt_tokens ?? 0) +
      (result.completion.usage?.completion_tokens ?? 0);
    const { estimateCost } = await import("../analytics/llm-usage.js");
    const actualCostUsd = estimateCost(
      result.model,
      result.completion.usage?.prompt_tokens ?? 0,
      result.completion.usage?.completion_tokens ?? 0,
    );
    if (clientId) reconcileTokenUsage(clientId, reservedMonthlyTokens, actualTokens);
    reconcileBudgetSpend(clientId ?? null, reservedTenantMicroUsd, globalReservedMicroUsd, actualCostUsd);
  };

  // Helper to rollback all reservations on total chain failure.
  const rollbackAllReservations = (): void => {
    if (clientId) {
      rollbackTokenReservation(clientId, reservedMonthlyTokens, reservedMinuteTokens);
    }
    rollbackBudgetReservation(clientId ?? null, reservedTenantMicroUsd, globalReservedMicroUsd);
  };

  // ── If forced to EFFICIENT by quota/budget/global, build an EFFICIENT-only chain ──
  if (forcedTier === ModelTier.EFFICIENT) {
    const efficientModel = TIER_EFFICIENT_MODELS[0] ?? "gpt-5-mini";
    const efficientChain =
      EFFICIENT_FALLBACK_CHAINS[efficientModel] ??
      EFFICIENT_FALLBACK_CHAINS[options.model] ??
      TIER_EFFICIENT_MODELS;

    try {
      const result = await executeChain({
        ...options,
        modelChain: efficientChain,
        effectiveTier: ModelTier.EFFICIENT,
        quotaDegraded,
        budgetDegraded,
      });
      reconcileReservations(result);
      return result;
    } catch (chainErr) {
      rollbackAllReservations();
      throw chainErr;
    }
  }

  // ── Normal FRONTIER / EFFICIENT path via fallback chain ───────────────────
  const effectiveTier = preferredTier ?? inferTierForModel(options.model);
  const chain = FALLBACK_CHAINS[options.model] ?? [options.model];

  try {
    const result = await executeChain({
      ...options,
      modelChain: chain,
      effectiveTier,
      quotaDegraded,
      budgetDegraded,
    });
    reconcileReservations(result);
    return result;
  } catch (chainErr) {
    rollbackAllReservations();
    throw chainErr;
  }
}
