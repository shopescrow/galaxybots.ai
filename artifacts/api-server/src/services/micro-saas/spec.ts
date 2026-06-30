import { z } from "zod";
import { callWithFallback, ModelTier } from "../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";

/**
 * Micro-SaaS spec service (task #264).
 *
 * The Micro-SaaS builder bot turns a free-form tool concept into a STRUCTURED
 * spec: core feature, target user, the AI prompt/logic behind it, and a pricing
 * idea. The spec is what gets recorded as an Asset Studio asset and, once a
 * human approves it, fed to the scaffold pipeline (scaffold.ts).
 *
 * Generation runs through `callWithFallback` — the single shared, governed AI
 * access path (circuit breakers, fallback chains, usage logging). This module
 * never talks to a provider directly.
 */

export const PRICING_MODELS = [
  "subscription_monthly",
  "subscription_annual",
  "usage_based",
  "freemium",
  "one_time",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const microSaasSpecSchema = z.object({
  name: z.string().min(1).describe("Short product name for the tool"),
  tagline: z.string().min(1).describe("One-line value proposition"),
  coreFeature: z
    .string()
    .min(1)
    .describe("The single thing this tool does for its user"),
  targetUser: z
    .string()
    .min(1)
    .describe("Who pays for and uses this tool"),
  aiPromptLogic: z
    .string()
    .min(1)
    .describe("The AI prompt/logic behind the tool — what the model is asked to do"),
  inputFields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        placeholder: z.string().optional(),
        type: z.enum(["text", "textarea", "select"]).default("text"),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .describe("Form fields the end user fills in to drive the tool"),
  pricing: z.object({
    model: z.enum(PRICING_MODELS),
    monthlyPriceUsd: z.number().nonnegative(),
    rationale: z.string().min(1),
  }),
  exampleInputs: z
    .array(z.string())
    .default([])
    .describe("A couple of example prompts/inputs to seed the tool"),
});

export type MicroSaasSpec = z.infer<typeof microSaasSpecSchema>;

/**
 * Placeholder subscription/revenue tracking record stored alongside an asset's
 * spec. Real billing integration is out of scope for this phase (tracked as a
 * follow-up); these fields stub the numbers the Asset Studio surfaces.
 */
export interface SubscriptionTrackingPlaceholder {
  enabled: boolean;
  model: PricingModel;
  monthlyPriceUsd: number;
  activeSubscribers: number;
  mrrUsd: number;
  /** Marks the figures as not-yet-wired to a real billing provider. */
  placeholder: true;
}

export function buildSubscriptionPlaceholder(
  spec: MicroSaasSpec,
): SubscriptionTrackingPlaceholder {
  return {
    enabled: false,
    model: spec.pricing.model,
    monthlyPriceUsd: spec.pricing.monthlyPriceUsd,
    activeSubscribers: 0,
    mrrUsd: 0,
    placeholder: true,
  };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json ... ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI response did not contain a JSON object");
  }
  return JSON.parse(body.slice(start, end + 1));
}

const SPEC_SYSTEM_PROMPT = `You are a Micro-SaaS product architect. Given a tool concept, design a small, single-purpose AI tool that could be sold as a low-priced subscription.

Return ONLY a JSON object (no prose, no markdown) with exactly these keys:
- name: short product name
- tagline: one-line value proposition
- coreFeature: the single thing the tool does
- targetUser: who pays for and uses it
- aiPromptLogic: the prompt/logic the AI runs to produce the output
- inputFields: array of { key, label, placeholder, type ("text"|"textarea"|"select"), options? } — the fields the end user fills in
- pricing: { model ("subscription_monthly"|"subscription_annual"|"usage_based"|"freemium"|"one_time"), monthlyPriceUsd (number), rationale }
- exampleInputs: array of 1-3 example input strings

Keep it focused and realistic. Prefer one clear core feature over many.`;

export interface GenerateSpecOptions {
  /** Optional client scope for usage logging (no effect on output). */
  clientId?: number;
  botId?: number;
  /** Which tier to run generation at. Defaults to EFFICIENT (spec gen is small). */
  tier?: ModelTier;
}

/**
 * Generate a structured Micro-SaaS spec from a free-form concept using the
 * shared, governed model access path. Throws if the model output cannot be
 * parsed/validated into a spec (explicit failure, no silent fallback).
 */
export async function generateMicroSaasSpec(
  concept: string,
  opts: GenerateSpecOptions = {},
): Promise<MicroSaasSpec> {
  const trimmed = concept.trim();
  if (!trimmed) throw new Error("A non-empty tool concept is required");

  const result = await callWithFallback({
    model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
    preferredTier: opts.tier ?? ModelTier.EFFICIENT,
    clientId: opts.clientId,
    botId: opts.botId,
    maxCompletionTokens: 1200,
    messages: [
      { role: "system", content: SPEC_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Tool concept: ${trimmed}\n\nDesign the spec as JSON.`,
      },
    ],
  });

  const content = result.completion.choices[0]?.message?.content ?? "";
  const parsed = extractJson(content);
  return microSaasSpecSchema.parse(parsed);
}
