import { db, clientsTable, botsTable, assetsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

/**
 * Seed the Micro-SaaS builder bot and the bundled example Micro-SaaS asset
 * ("Caption Forge") for the Asset Studio (task #264). Idempotent: re-running
 * updates the existing rows in place rather than creating duplicates.
 *
 * The example asset carries the same metadata shape the builder-bot tools
 * produce (spec + subscription + revenue placeholders + scaffold plan), so the
 * Asset Studio surfaces real subscription/revenue placeholder figures for a
 * shipped tool. Real billing is intentionally out of scope.
 */

const BUILDER_BOT = {
  name: "Micro-SaaS Architect",
  title: "Builder of Single-Purpose AI Subscription Tools",
  department: "Asset Studio",
  category: "Creator",
  description:
    "The Micro-SaaS Architect turns a tool concept into a structured product spec — core feature, target user, the AI prompt/logic behind it, the end-user input fields, and a pricing idea — and records it as a Micro-SaaS asset in the Asset Studio. Once a human approves a spec, it produces a reviewable scaffold plan for a standalone web tool wired to the platform's shared AI access. It never ships on its own: humans approve both the spec and the scaffold before anything goes live.",
  responsibilities: [
    "Turn free-form tool concepts into structured Micro-SaaS specs",
    "Record each spec as a Micro-SaaS asset at the idea stage",
    "Produce reviewable scaffold plans for approved specs",
    "Wire generated tools to the shared, governed AI access path",
    "Keep a human in the loop for spec approval and scaffolding",
  ],
  personality:
    "Product-minded, pragmatic, and focused. Prefers one sharp core feature over a sprawling feature list. Designs for a real buyer and a clear price, and respects the approval gate at every step.",
  avatar: "micro-saas-architect",
  declaration:
    "I am the Micro-SaaS Architect. I turn ideas into shippable AI tools — and I never launch without your sign-off.",
  rank: "specialist" as const,
  isAvailable: true,
  isAiGenerated: false,
};

// Deterministic spec for the bundled example tool. Mirrors the shape produced by
// services/micro-saas/spec.ts (microSaasSpecSchema) so the Asset Studio renders
// it identically to a builder-bot-designed asset.
const CAPTION_FORGE_SPEC = {
  name: "Caption Forge",
  tagline: "Scroll-stopping social captions in seconds.",
  coreFeature:
    "Generate a set of ready-to-post social media captions from a single topic, tuned to a chosen tone and platform.",
  targetUser:
    "Creators, social media managers, and small-business owners who post frequently and need on-brand captions fast.",
  aiPromptLogic:
    "Given a topic, a tone, a target platform, and a desired count, write that many distinct, platform-appropriate captions in the requested tone. Keep them concise, native to the platform, and ready to post.",
  inputFields: [
    {
      key: "topic",
      label: "Topic",
      placeholder: "e.g. launching our new oat-milk cold brew",
      type: "textarea" as const,
    },
    {
      key: "tone",
      label: "Tone",
      type: "select" as const,
      options: [
        "professional",
        "playful",
        "bold",
        "inspirational",
        "minimal",
        "witty",
      ],
    },
    {
      key: "platform",
      label: "Platform",
      type: "select" as const,
      options: ["instagram", "linkedin", "x", "tiktok", "facebook"],
    },
    {
      key: "count",
      label: "How many captions",
      type: "text" as const,
    },
  ],
  pricing: {
    model: "subscription_monthly" as const,
    monthlyPriceUsd: 9,
    rationale:
      "A low monthly price that pays for itself for anyone posting a few times a week; cheap enough to be an easy yes for solo creators.",
  },
  exampleInputs: [
    "Launching our new oat-milk cold brew",
    "Behind-the-scenes of our pottery studio",
    "End-of-summer sale, 30% off everything",
  ],
};

// Deterministic scaffold plan mirroring services/micro-saas/scaffold.ts for the
// already-built example artifact (proves the pipeline end to end).
const CAPTION_FORGE_SCAFFOLD = {
  slug: "caption-forge",
  artifactType: "react-vite" as const,
  previewPath: "/caption-forge/",
  title: "Caption Forge",
  endpoint: {
    method: "POST" as const,
    path: "/api/v1/micro-tools/caption-writer",
    aiAccess: "callWithFallback (services/ai-safety/model-fallback)",
    promptLogic: CAPTION_FORGE_SPEC.aiPromptLogic,
  },
  files: [
    {
      path: "artifacts/caption-forge/src/App.tsx",
      purpose:
        "Single-purpose tool UI: topic/tone/platform/count inputs, POST to the endpoint, render copyable captions.",
    },
    {
      path: "artifacts/caption-forge/src/index.css",
      purpose: "Tailwind theme tokens for the standalone tool.",
    },
    {
      path: "artifacts/api-server/src/routes/micro-tools.ts",
      purpose:
        "Public POST handler that runs the caption prompt logic via callWithFallback.",
    },
    {
      path: "artifacts/api-server/src/app.ts",
      purpose: "'/micro-tools/' added to PUBLIC_PREFIX_SUFFIXES.",
    },
  ],
  pricing: CAPTION_FORGE_SPEC.pricing,
  reviewNote:
    "Built example — this plan was realized by hand to prove the scaffold pipeline.",
};

function buildMetadata() {
  return {
    spec: CAPTION_FORGE_SPEC,
    subscription: {
      enabled: false,
      model: CAPTION_FORGE_SPEC.pricing.model,
      monthlyPriceUsd: CAPTION_FORGE_SPEC.pricing.monthlyPriceUsd,
      activeSubscribers: 0,
      mrrUsd: 0,
      placeholder: true as const,
    },
    revenue: { placeholder: true as const, totalUsd: 0, lastEventAt: null },
    scaffold: CAPTION_FORGE_SCAFFOLD,
  };
}

async function seedMicroSaas() {
  // 1. Builder bot (idempotent on name).
  let builderBotId: number;
  const [existingBot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.name, BUILDER_BOT.name))
    .limit(1);

  if (existingBot) {
    builderBotId = existingBot.id;
    console.log(
      `Builder bot "${BUILDER_BOT.name}" already exists (id=${builderBotId}), skipping insert.`,
    );
  } else {
    const [inserted] = await db.insert(botsTable).values(BUILDER_BOT).returning();
    builderBotId = inserted.id;
    console.log(`Inserted builder bot "${BUILDER_BOT.name}" (id=${builderBotId}).`);
  }

  // 2. Pick a client to own the example asset (lowest id = oldest client).
  const [client] = await db
    .select()
    .from(clientsTable)
    .orderBy(asc(clientsTable.id))
    .limit(1);

  if (!client) {
    console.error(
      "No clients exist — cannot seed the example Micro-SaaS asset. Seed a client first (e.g. pnpm --filter @workspace/scripts run seed-kilopro).",
    );
    process.exit(1);
  }
  const clientId = client.id;

  // 3. Example asset (idempotent on title + client).
  const metadata = buildMetadata();
  const [existingAsset] = await db
    .select()
    .from(assetsTable)
    .where(eq(assetsTable.title, CAPTION_FORGE_SPEC.name))
    .limit(1);

  if (existingAsset) {
    await db
      .update(assetsTable)
      .set({
        botId: builderBotId,
        type: "micro_saas",
        description: CAPTION_FORGE_SPEC.tagline,
        niche: CAPTION_FORGE_SPEC.targetUser,
        targetPlatform: "Standalone web app",
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, existingAsset.id));
    console.log(
      `Updated example asset "${CAPTION_FORGE_SPEC.name}" (id=${existingAsset.id}) for client ${clientId}.`,
    );
  } else {
    const now = new Date().toISOString();
    const [asset] = await db
      .insert(assetsTable)
      .values({
        clientId,
        botId: builderBotId,
        type: "micro_saas",
        title: CAPTION_FORGE_SPEC.name,
        description: CAPTION_FORGE_SPEC.tagline,
        niche: CAPTION_FORGE_SPEC.targetUser,
        targetPlatform: "Standalone web app",
        status: "published",
        metadata,
        statusHistory: [
          {
            status: "idea",
            changedBy: `bot:${BUILDER_BOT.name}`,
            note: "designed via builder bot",
            at: now,
          },
          {
            status: "published",
            changedBy: "seed:micro-saas",
            note: "bundled example tool (Caption Forge)",
            at: now,
          },
        ],
        publishedAt: new Date(),
      })
      .returning();
    console.log(
      `Inserted example asset "${CAPTION_FORGE_SPEC.name}" (id=${asset.id}) for client ${clientId}.`,
    );
  }

  console.log("Micro-SaaS seed complete.");
  process.exit(0);
}

seedMicroSaas().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
