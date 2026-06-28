import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, assetsTable, type AssetStatusEvent } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  generateMicroSaasSpec,
  buildSubscriptionPlaceholder,
  type MicroSaasSpec,
} from "../services/micro-saas/spec";
import { buildScaffoldPlan } from "../services/micro-saas/scaffold";

/**
 * Micro-SaaS builder bot tools (task #264).
 *
 * `design_micro_saas` turns a concept into a structured spec (via the shared,
 * governed model path) and records it as an Asset Studio asset at the idea
 * stage. `scaffold_micro_saas` turns an approved spec into a reviewable scaffold
 * plan stored on the asset. Neither tool publishes or creates an artifact
 * autonomously — a human stays in the loop (publishing is approval-gated in the
 * assets route, and scaffolding only produces a plan).
 */

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Micro-SaaS tools require a client context");
  }
  return context.clientId;
}

function appendStatus(
  history: AssetStatusEvent[] | null | undefined,
  status: "idea",
  changedBy: string,
  note?: string,
): AssetStatusEvent[] {
  return [
    ...(history ?? []),
    { status, changedBy, note, at: new Date().toISOString() },
  ];
}

registerTool({
  name: "design_micro_saas",
  description:
    "Turn a micro-SaaS tool concept into a structured spec (core feature, target user, the AI prompt/logic behind it, input fields, and a pricing idea) and record it as a Micro-SaaS asset in the Asset Studio (idea stage). Use this to design a small single-purpose AI subscription tool. Returns the created asset id and the generated spec.",
  inputSchema: z.object({
    concept: z
      .string()
      .describe("Free-form description of the tool idea, e.g. 'an AI tool that turns a job description into tailored resume bullet points'"),
    niche: z
      .string()
      .optional()
      .describe("Optional niche/audience focus for the tool"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const spec: MicroSaasSpec = await generateMicroSaasSpec(input.concept, {
      clientId,
      botId: context.botId,
    });

    const subscription = buildSubscriptionPlaceholder(spec);
    const changedBy = `bot:${context.botName ?? context.botId ?? "builder"}`;

    const [asset] = await db
      .insert(assetsTable)
      .values({
        clientId,
        botId: context.botId ?? null,
        title: spec.name,
        type: "micro_saas",
        description: spec.tagline,
        niche: input.niche ?? spec.targetUser,
        targetPlatform: "Standalone web app",
        status: "idea",
        metadata: {
          spec,
          subscription,
          revenue: { placeholder: true, totalUsd: 0, lastEventAt: null },
        },
        statusHistory: appendStatus([], "idea", changedBy, "designed via builder bot"),
      })
      .returning();

    return {
      assetId: asset.id,
      status: asset.status,
      spec,
      message: `Micro-SaaS spec "${spec.name}" recorded as asset ${asset.id} (idea stage). Approve and scaffold it next.`,
    };
  },
});

registerTool({
  name: "scaffold_micro_saas",
  description:
    "Produce a reviewable scaffold plan for an approved Micro-SaaS asset: the standalone web artifact slug, the public AI endpoint (wired to shared model access), and the files to create. This does NOT create the artifact — a human reviews the plan first. Returns the scaffold plan and stores it on the asset.",
  inputSchema: z.object({
    assetId: z.number().describe("The Micro-SaaS asset to scaffold"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const [asset] = await db
      .select()
      .from(assetsTable)
      .where(and(eq(assetsTable.id, input.assetId), eq(assetsTable.clientId, clientId)));
    if (!asset) throw new Error("Asset not found for this client");
    if (asset.type !== "micro_saas") {
      throw new Error("scaffold_micro_saas only applies to micro_saas assets");
    }

    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;
    const spec = metadata.spec as MicroSaasSpec | undefined;
    if (!spec) {
      throw new Error("Asset has no spec — run design_micro_saas first");
    }

    const plan = buildScaffoldPlan(spec);

    await db
      .update(assetsTable)
      .set({
        metadata: { ...metadata, scaffold: plan },
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, input.assetId));

    return {
      assetId: input.assetId,
      plan,
      message: `Scaffold plan ready for asset ${input.assetId}. Review it, then create the "${plan.slug}" artifact and its endpoint.`,
    };
  },
});
