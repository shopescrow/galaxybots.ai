import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  assetsTable,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";

/**
 * Web3 / AI-agent asset tools (task #267 — exploratory).
 *
 * HARD SAFETY BOUNDARY: these tools only ever produce *structured specs and
 * catalog records* stored as Asset Studio assets (type "web3"). They never
 * touch wallets, custody, funds, smart contracts, or any on-chain/financial
 * primitive. Every external/on-chain/financial step is surfaced as a
 * human-performed "manual action" and the asset is created in a non-published
 * state so it must pass the existing human-approval gate before going live.
 */

export const WEB3_ASSET_KINDS = [
  "agent_token",
  "virtual_influencer",
  "tradable_model",
] as const;
export type Web3AssetKind = (typeof WEB3_ASSET_KINDS)[number];

/**
 * Baseline guardrails appended to every web3 asset, regardless of what the
 * model proposes. These can never be removed by the LLM and make the
 * human-in-the-loop / no-autonomous-funds boundary explicit on every record.
 */
const BASELINE_MANUAL_ACTIONS: Record<Web3AssetKind, string[]> = {
  agent_token: [
    "Token issuance and smart-contract deployment must be performed manually by a human — bots never deploy contracts.",
    "Any wallet creation, custody, or fund movement is a manual human action; this system holds no keys and moves no funds.",
    "Listing the token on any exchange, DEX, or marketplace requires explicit human approval.",
  ],
  virtual_influencer: [
    "Connecting or posting to any social/platform account is a manual human action requiring account-owner approval.",
    "Any monetization, paid promotion, or on-chain tipping/token tie-in is a manual human-performed step.",
  ],
  tradable_model: [
    "Uploading model weights and publishing to any model marketplace is a manual human action.",
    "Any sale, licensing transaction, or on-chain provenance/minting step must be performed manually by a human.",
  ],
};

const DISCLAIMER =
  "Exploratory spec only. No on-chain, wallet, custody, trading, or fund-handling action has been or will be taken autonomously. All external/financial steps are flagged as manual human actions and the asset must pass human approval before publishing.";

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Web3 asset tools require a client context");
  }
  return context.clientId;
}

function changedByLabel(context: ToolContext): string {
  return `bot:${context.botName ?? context.botId ?? "web3-architect"}`;
}

function initialStatusHistory(
  status: AssetStatus,
  changedBy: string,
  note: string,
): AssetStatusEvent[] {
  return [{ status, changedBy, note, at: new Date().toISOString() }];
}

/** Call the model and parse a JSON object, tolerating non-JSON fallbacks. */
async function generateJson(
  systemPrompt: string,
  userPrompt: string,
  model = "gpt-4o",
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

/** De-duplicate, trim, and drop empty strings from a string list. */
function normalizeActions(...lists: unknown[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const item of list) {
        const s = typeof item === "string" ? item.trim() : "";
        if (s && !out.includes(s)) out.push(s);
      }
    }
  }
  return out;
}

/** Shared insert path: every web3 asset lands as a non-published draft. */
async function insertWeb3Asset(params: {
  context: ToolContext;
  clientId: number;
  kind: Web3AssetKind;
  title: string;
  description: string | null;
  niche: string | null;
  targetPlatform: string | null;
  spec: Record<string, unknown>;
  manualActions: string[];
}) {
  const changedBy = changedByLabel(params.context);
  const [asset] = await db
    .insert(assetsTable)
    .values({
      clientId: params.clientId,
      botId: params.context.botId ?? null,
      type: "web3",
      title: params.title,
      description: params.description,
      niche: params.niche,
      targetPlatform: params.targetPlatform,
      status: "draft",
      metadata: {
        web3Kind: params.kind,
        spec: params.spec,
        manualActions: params.manualActions,
        requiresHumanApproval: true,
        generatedBy: "Web3 Asset Architect",
        generatedAt: new Date().toISOString(),
        disclaimer: DISCLAIMER,
      },
      statusHistory: initialStatusHistory(
        "draft",
        changedBy,
        "web3 spec drafted via tool",
      ),
    })
    .returning();
  return asset;
}

registerTool({
  name: "draft_web3_asset_spec",
  description:
    "Draft a structured concept/spec for a high-risk Web3 asset — an AI-agent token, a virtual influencer, or a tradable fine-tuned model — and store it as an Asset Studio asset (type 'web3', draft stage). The spec covers purpose, persona, capabilities, and a go-to-market outline. SAFETY: this only produces a written spec. It never deploys contracts, mints tokens, moves funds, or performs any on-chain step; every such step is listed as a manual human action and the asset must pass human approval before publishing.",
  inputSchema: z.object({
    kind: z
      .enum(WEB3_ASSET_KINDS)
      .describe(
        "Which asset class to spec: agent_token, virtual_influencer, or tradable_model",
      ),
    title: z.string().describe("Short descriptive title for the asset"),
    objective: z
      .string()
      .describe("The purpose / problem this asset is meant to solve or the opportunity it captures"),
    audience: z
      .string()
      .optional()
      .describe("The target audience / niche / community"),
    notes: z
      .string()
      .optional()
      .describe("Any extra context, constraints, or direction to fold into the spec"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const generated = await generateJson(
      "You are the Web3 Asset Architect for GalaxyBots. You write disciplined, realistic concept specs for high-risk Web3 / AI-agent assets. You NEVER instruct anyone to move funds, deploy contracts, or take on-chain actions automatically — you only describe and you flag every on-chain/financial step as a manual human action. Return strict JSON.",
      `Produce a concept spec for a ${input.kind} as a JSON object with these keys:
purpose (string), persona (object: name, identity, voiceTone), capabilities (array of strings),
goToMarket (object: positioning, channels (array), phases (array), monetization (string)),
differentiators (array of strings), risks (array of strings),
complianceNotes (array of strings),
manualActions (array of strings — every external/on-chain/financial step a HUMAN must perform; bots never do these).

Title: ${input.title}
Objective: ${input.objective}
Audience: ${input.audience ?? "(unspecified)"}
Notes: ${input.notes ?? "(none)"}`,
    );

    const manualActions = normalizeActions(
      generated.manualActions,
      BASELINE_MANUAL_ACTIONS[input.kind],
    );
    const asset = await insertWeb3Asset({
      context,
      clientId,
      kind: input.kind,
      title: input.title,
      description: input.objective,
      niche: input.audience ?? null,
      targetPlatform: null,
      spec: generated,
      manualActions,
    });

    return {
      assetId: asset.id,
      kind: input.kind,
      status: asset.status,
      manualActions,
      requiresHumanApproval: true,
      message: `Drafted ${input.kind} spec "${asset.title}" as a web3 asset (draft). ${manualActions.length} step(s) flagged as manual human actions. Submit for review when ready; publishing requires your explicit approval.`,
    };
  },
});

registerTool({
  name: "generate_virtual_influencer_persona",
  description:
    "Generate a consistent virtual-influencer persona — identity, profile, and a set of sample content — and store it as an Asset Studio asset (type 'web3', draft stage). SAFETY: produces only a creative persona spec and sample posts; it does not connect to, post to, or monetize any account. Connecting/posting/monetizing is flagged as a manual human action.",
  inputSchema: z.object({
    name: z.string().describe("Desired display name for the virtual influencer"),
    niche: z.string().describe("The niche / vertical the influencer operates in"),
    platforms: z
      .array(z.string())
      .optional()
      .describe("Target platforms, e.g. ['Instagram','TikTok','X']"),
    personalityHints: z
      .string()
      .optional()
      .describe("Optional direction on personality, tone, or aesthetic"),
    sampleContentCount: z
      .number()
      .optional()
      .describe("How many sample content pieces to generate (default 3, max 6)"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const platforms = input.platforms?.length ? input.platforms : ["Instagram", "TikTok"];
    const sampleCount = Math.max(1, Math.min(6, input.sampleContentCount ?? 3));

    const generated = await generateJson(
      "You are the Web3 Asset Architect for GalaxyBots, specialized in designing virtual-influencer personas with a single, consistent identity across every piece of content. Return strict JSON. You never connect to or post to real accounts; that is a human action.",
      `Design a virtual influencer named "${input.name}" in the "${input.niche}" niche for platforms: ${platforms.join(", ")}.
Personality direction: ${input.personalityHints ?? "(use your judgment, keep it cohesive)"}
Return a JSON object:
identity (object: displayName, handle, archetype, bio, backstory, visualStyle, voiceTone),
profile (object: platforms (array), postingCadence, contentPillars (array), audience),
sampleContent (array of EXACTLY ${sampleCount} objects: { platform, format, hook, caption, hashtags (array) }).
Keep the identity, voice, and visual style perfectly consistent across all sample content.`,
    );

    const identity = (generated.identity ?? {}) as Record<string, unknown>;
    const handle = typeof identity.handle === "string" ? identity.handle : undefined;
    const manualActions = BASELINE_MANUAL_ACTIONS.virtual_influencer;

    const asset = await insertWeb3Asset({
      context,
      clientId,
      kind: "virtual_influencer",
      title: handle ? `${input.name} (${handle})` : input.name,
      description: `Virtual influencer persona for the ${input.niche} niche.`,
      niche: input.niche,
      targetPlatform: platforms.join(", "),
      spec: generated,
      manualActions,
    });

    return {
      assetId: asset.id,
      status: asset.status,
      handle,
      platforms,
      manualActions,
      requiresHumanApproval: true,
      message: `Generated virtual-influencer persona "${asset.title}" with ${sampleCount} sample content piece(s), stored as a web3 asset (draft). Connecting/posting/monetizing any account is a manual human action; publishing requires your approval.`,
    };
  },
});

registerTool({
  name: "catalog_lora_model",
  description:
    "Catalog a tradable fine-tuned model (LoRA) as an Asset Studio asset (type 'web3', draft stage) — capturing its training description, intended use, and marketplace packaging. SAFETY: this is catalog + spec only. It does not fine-tune/train anything, upload weights, or list the model for sale. Uploading weights and listing/selling are flagged as manual human actions and publishing requires human approval.",
  inputSchema: z.object({
    title: z.string().describe("Name of the model/LoRA"),
    baseModel: z
      .string()
      .describe("The base model it adapts, e.g. 'SDXL 1.0', 'Llama-3-8B', 'Flux.1-dev'"),
    trainingDescription: z
      .string()
      .describe("What it was (or would be) trained on and the training approach"),
    intendedUse: z
      .string()
      .describe("What the model is for and the intended use cases"),
    license: z
      .string()
      .optional()
      .describe("Intended license / usage terms, e.g. 'commercial', 'non-commercial', 'CreativeML'"),
    triggerWords: z
      .array(z.string())
      .optional()
      .describe("Activation/trigger words, if applicable"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);

    const generated = await generateJson(
      "You are the Web3 Asset Architect for GalaxyBots, cataloging tradable fine-tuned models (LoRAs) for a marketplace. Return strict JSON. You do not train models, upload weights, or list anything for sale — you only produce the catalog record and packaging copy.",
      `Create a marketplace catalog record for this fine-tuned model. Return a JSON object:
catalog (object: baseModel, trainingDescription, datasetSummary, capabilities (array), limitations (array), license),
packaging (object: fileFormat, triggerWords (array), recommendedSettings, examplePrompts (array)),
marketplaceListing (object: title, shortDescription, longDescription, suggestedPriceRange, tags (array)),
manualActions (array of strings — steps a HUMAN must perform: uploading weights, listing/selling, on-chain provenance, etc.).

Name: ${input.title}
Base model: ${input.baseModel}
Training: ${input.trainingDescription}
Intended use: ${input.intendedUse}
License: ${input.license ?? "(unspecified)"}
Trigger words: ${input.triggerWords?.join(", ") ?? "(none provided)"}`,
    );

    const manualActions = normalizeActions(
      generated.manualActions,
      BASELINE_MANUAL_ACTIONS.tradable_model,
    );

    const asset = await insertWeb3Asset({
      context,
      clientId,
      kind: "tradable_model",
      title: input.title,
      description: input.intendedUse,
      niche: input.baseModel,
      targetPlatform: "Model marketplace",
      spec: generated,
      manualActions,
    });

    return {
      assetId: asset.id,
      status: asset.status,
      baseModel: input.baseModel,
      manualActions,
      requiresHumanApproval: true,
      message: `Cataloged fine-tuned model "${asset.title}" (base: ${input.baseModel}) as a web3 asset (draft). Uploading weights and listing/selling are manual human actions; publishing requires your approval.`,
    };
  },
});
