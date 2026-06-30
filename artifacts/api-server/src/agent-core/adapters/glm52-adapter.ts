import type { LLMProvider, LLMCompletionOptions, LLMCompletion } from "../ports/index.js";
import { pickGlmKey, glmPoolHasKeys, markGlmKeyRateLimited } from "../../services/ai-safety/provider-key-pool.js";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

/** Circuit-breaker provider key for the GLM/Zhipu backend (independent of openai/anthropic). */
export const GLM_CIRCUIT_KEY = "glm";

/** True when the model name targets the GLM family (routed through Zhipu's BigModel API). */
export function isGlmModel(model: string): boolean {
  return model.startsWith("glm-");
}

// Maps the system's logical glm-5.2* names onto the concrete models the Zhipu
// BigModel API currently serves. The legacy glm-4-flash/glm-4-long/glm-4 names
// were retired by Zhipu; the live model family is glm-4.6 / glm-4.5* / glm-4-plus.
const GLM_MODEL_ROUTING: Record<string, string> = {
  "glm-5.2": "glm-4.6",
  "glm-5.2-flash": "glm-4.5-flash",
  "glm-5.2-plus": "glm-4.5",
  "glm-5.2-long": "glm-4-plus",
  "glm-5.2-ultra": "glm-4.6",
};

// Blended USD cost per 1k *total* tokens for each live Zhipu model, used for the
// injected-provider cost (applied to prompt+completion combined). These are the
// account's actual direct-Zhipu/BigModel rates, NOT OpenRouter list prices:
//   glm-4.6 / glm-4.5    z.ai $0.60/M in, $2.20/M out
//   glm-4.5-air          z.ai $0.20/M in, $1.10/M out
//   glm-4.5-flash        z.ai free
//   glm-4-plus           BigModel ¥5/M single blended rate (~$0.70/M)
// Because this map carries a single rate over total tokens (the central router's
// per-token map in services/analytics/llm-usage.ts keeps input/output split),
// the frontier rates here are blended assuming a representative 3:1 input:output
// token mix, e.g. glm-4.6 = (3*0.60 + 2.20)/4 = $1.00/M. Keep both maps in sync.
const MODEL_COST_PER_1K_TOKENS: Record<string, number> = {
  "glm-4.6": 0.001,
  "glm-4.5": 0.001,
  "glm-4.5-air": 0.000425,
  "glm-4.5-flash": 0,
  "glm-4-plus": 0.0007,
};

interface GLMResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GLMErrorResponse {
  error?: { message?: string; code?: string };
}

/** True when the HTTP status or error message signals a rate-limit (not an outage). */
export function isGlmRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("429") || msg.includes("rate limit") || msg.includes("rate_limit") || msg.includes("quota")) return true;
  }
  const status = (err as { status?: number })?.status;
  return status === 429;
}

async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable = err instanceof Error && (
        err.message.includes("503") ||
        err.message.includes("timeout")
      );
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function recoverJsonMode(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class GLM52Adapter implements LLMProvider {
  private readonly apiKey: string;
  private readonly keyLabel: string;
  private _available = true;

  /**
   * Construct the adapter.
   *
   * When called without arguments the adapter picks the best available key from
   * the multi-key pool (ZHIPU_API_KEY, ZHIPU_API_KEY_1, …). You can pass an
   * explicit key to pin to a specific pool entry (used by model-fallback when it
   * needs to know which key was used for rate-limit attribution).
   */
  constructor(apiKey?: string, keyLabel?: string) {
    if (apiKey) {
      this.apiKey = apiKey;
      this.keyLabel = keyLabel ?? "explicit";
    } else {
      const picked = pickGlmKey();
      this.apiKey = picked?.key ?? process.env.ZHIPU_API_KEY ?? "";
      this.keyLabel = picked?.label ?? "ZHIPU_API_KEY";
    }
  }

  isAvailable(): boolean {
    return this._available && (this.apiKey.length > 0 || glmPoolHasKeys());
  }

  static isPoolAvailable(): boolean {
    return glmPoolHasKeys();
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletion> {
    if (!this.apiKey) {
      throw new Error("GLM 5.2 adapter is not available: no API key available in pool");
    }

    const routedModel = GLM_MODEL_ROUTING[options.model] ?? "glm-4.5-flash";

    const body: Record<string, unknown> = {
      model: routedModel,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 1000,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const keyLabel = this.keyLabel;
    const apiKey = this.apiKey;

    return withExponentialBackoff(async () => {
      const response = await fetch(`${GLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as GLMErrorResponse;
        const msg = errBody?.error?.message ?? `HTTP ${response.status}`;

        if (response.status === 429) {
          markGlmKeyRateLimited(apiKey);
          const rateLimitErr = new Error(`GLM API rate limit (${keyLabel}): ${msg}`);
          Object.assign(rateLimitErr, { status: 429 });
          throw rateLimitErr;
        }

        throw new Error(`GLM API error: ${msg}`);
      }

      const data = await response.json() as GLMResponse;
      const choice = data.choices[0];
      const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      const costPer1k = MODEL_COST_PER_1K_TOKENS[routedModel] ?? 0.01;
      const costCents = Math.ceil((usage.total_tokens / 1000) * costPer1k * 100);

      return {
        content: choice?.message.content ?? null,
        tool_calls: choice?.message.tool_calls,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        costCents,
        model: routedModel,
      };
    });
  }

  static recoverJsonMode = recoverJsonMode;
}
