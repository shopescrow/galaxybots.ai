import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  assetsTable,
  assetFilesTable,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  generateImage,
  uploadBuffer,
  type ImageBackground,
  type ImageFormat,
  type ImageSize,
} from "../lib/imageGen";

// ── Shared helpers ──────────────────────────────────────────────────────────

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Visual asset tools require a client context");
  }
  return context.clientId;
}

function changedByOf(context: ToolContext): string {
  return `bot:${context.botName ?? context.botId ?? "visual-creator"}`;
}

function appendStatus(
  history: AssetStatusEvent[] | null | undefined,
  status: AssetStatus,
  changedBy: string,
  note?: string,
): AssetStatusEvent[] {
  return [
    ...(history ?? []),
    { status, changedBy, note, at: new Date().toISOString() },
  ];
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "asset"
  );
}

interface ProducedFile {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  kind: "image" | "other";
}

/**
 * Create a visual asset draft, upload + attach every produced file, store rich
 * metadata, and (by default) submit it into the human review queue. Visual
 * assets always land as drafts/in-review — they can never be auto-published.
 */
async function createVisualAssetWithFiles(
  context: ToolContext,
  params: {
    title: string;
    type?: string;
    description?: string;
    niche?: string;
    targetPlatform?: string;
    metadata: Record<string, unknown>;
    files: ProducedFile[];
    submitForReview: boolean;
  },
): Promise<{ assetId: number; status: AssetStatus; fileIds: number[] }> {
  const clientId = requireClient(context);
  const changedBy = changedByOf(context);

  const [asset] = await db
    .insert(assetsTable)
    .values({
      clientId,
      botId: context.botId ?? null,
      title: params.title,
      type: params.type ?? "visual",
      description: params.description ?? null,
      niche: params.niche ?? null,
      targetPlatform: params.targetPlatform ?? null,
      status: "draft",
      metadata: params.metadata,
      statusHistory: appendStatus([], "draft", changedBy, "drafted via visual creator"),
    })
    .returning();

  const slug = slugify(params.title);
  const fileIds: number[] = [];
  for (const file of params.files) {
    const objectPath = await uploadBuffer(
      file.buffer,
      file.contentType,
      `visual/${clientId}/${slug}`,
    );
    const [row] = await db
      .insert(assetFilesTable)
      .values({
        assetId: asset.id,
        clientId,
        kind: file.kind,
        fileName: file.fileName,
        objectPath,
        contentType: file.contentType,
        sizeBytes: file.buffer.length,
      })
      .returning();
    fileIds.push(row.id);
  }

  let status: AssetStatus = asset.status as AssetStatus;
  if (params.submitForReview) {
    const [updated] = await db
      .update(assetsTable)
      .set({
        status: "in_review",
        statusHistory: appendStatus(
          asset.statusHistory,
          "in_review",
          changedBy,
          "submitted for review by visual creator",
        ),
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, asset.id))
      .returning();
    status = updated.status as AssetStatus;
  }

  return { assetId: asset.id, status, fileIds };
}

/** Ask a cheap text model for structured JSON. Returns {} on parse failure. */
async function structuredJson(system: string, user: string): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Size presets ────────────────────────────────────────────────────────────

const ART_SIZE_PRESETS: Record<string, ImageSize> = {
  square: "1024x1024",
  landscape: "1536x1024",
  portrait: "1024x1536",
  wallpaper: "1536x1024",
  phone: "1024x1536",
};

// Print-on-demand product presets: orientation + guidance for placement.
const POD_PRODUCTS: Record<string, { size: ImageSize; note: string }> = {
  tshirt: { size: "1024x1536", note: "centered chest print, bold high-contrast subject, isolated on a transparent background" },
  hoodie: { size: "1024x1536", note: "centered front print, bold subject, transparent background" },
  mug: { size: "1536x1024", note: "wrap-around friendly horizontal composition, transparent background" },
  poster: { size: "1024x1536", note: "full-bleed poster artwork, rich detail" },
  sticker: { size: "1024x1024", note: "single die-cut subject with clean edges on a transparent background" },
  totebag: { size: "1024x1024", note: "centered square print, transparent background" },
  phonecase: { size: "1024x1536", note: "vertical composition, transparent background" },
};

// ── Tool: digital art / wallpapers ──────────────────────────────────────────

registerTool({
  name: "generate_visual_asset",
  description:
    "Generate digital art or wallpapers in a requested style and size, stored as a draft in the Asset Studio (type 'visual') with the image files attached and awaiting human review. Use for wall art, desktop/phone wallpapers, illustrations, and decorative visuals.",
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title for the asset"),
    prompt: z.string().describe("What to depict — subject, scene, mood"),
    style: z
      .string()
      .optional()
      .describe("Art style, e.g. 'minimalist line art', 'synthwave', 'watercolor'"),
    sizePreset: z
      .enum(["square", "landscape", "portrait", "wallpaper", "phone"])
      .optional()
      .describe("Output dimensions preset; defaults to 'square'"),
    count: z.number().optional().describe("How many variations to generate (1-4, default 1)"),
    niche: z.string().optional().describe("Target audience/niche"),
    keywords: z.array(z.string()).optional().describe("Descriptive keywords for listing"),
    targetPlatform: z.string().optional().describe("Where it will be distributed, e.g. Etsy, Society6"),
    submitForReview: z.boolean().optional().describe("Submit to the review queue (default true)"),
  }),
  execute: async (input, context: ToolContext) => {
    requireClient(context);
    const count = Math.min(Math.max(input.count ?? 1, 1), 4);
    const size = ART_SIZE_PRESETS[input.sizePreset ?? "square"];
    const styleClause = input.style ? `, in a ${input.style} style` : "";
    const files: ProducedFile[] = [];
    for (let i = 0; i < count; i++) {
      const variation = count > 1 ? ` (variation ${i + 1} of ${count}, distinct composition)` : "";
      const { buffer, contentType, format } = await generateImage({
        prompt: `${input.prompt}${styleClause}${variation}. High-quality digital art suitable for display and download.`,
        size,
        format: "png",
        quality: "high",
      });
      files.push({
        buffer,
        contentType,
        fileName: `${slugify(input.title)}-${i + 1}.${format}`,
        kind: "image",
      });
    }

    const result = await createVisualAssetWithFiles(context, {
      title: input.title,
      type: "visual",
      description: input.prompt,
      niche: input.niche,
      targetPlatform: input.targetPlatform,
      metadata: {
        kind: "digital_art",
        style: input.style ?? null,
        sizePreset: input.sizePreset ?? "square",
        dimensions: size,
        keywords: input.keywords ?? [],
      },
      files,
      submitForReview: input.submitForReview ?? true,
    });

    return {
      ...result,
      message: `Generated ${files.length} art file(s) for "${input.title}" (${result.status}).`,
    };
  },
});

// ── Tool: print-on-demand designs ───────────────────────────────────────────

registerTool({
  name: "generate_pod_design",
  description:
    "Produce a print-on-demand (merch) design at the correct dimensions and with a transparent background, stored as a draft Asset Studio asset awaiting review. Use for t-shirts, hoodies, mugs, stickers, posters, tote bags, and phone cases.",
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title for the design"),
    prompt: z.string().describe("The design concept — subject, slogan, motif"),
    product: z
      .enum(["tshirt", "hoodie", "mug", "poster", "sticker", "totebag", "phonecase"])
      .describe("The merch product the design is intended for"),
    style: z.string().optional().describe("Design style, e.g. 'retro', 'kawaii', 'typographic'"),
    niche: z.string().optional().describe("Target audience/niche"),
    keywords: z.array(z.string()).optional().describe("Descriptive keywords for listing"),
    targetPlatform: z.string().optional().describe("Where it will be sold, e.g. Printful, Redbubble"),
    submitForReview: z.boolean().optional().describe("Submit to the review queue (default true)"),
  }),
  execute: async (input, context: ToolContext) => {
    requireClient(context);
    const preset = POD_PRODUCTS[input.product];
    const styleClause = input.style ? `, ${input.style} style` : "";
    const transparent = input.product !== "poster";
    const { buffer, contentType, format } = await generateImage({
      prompt: `Print-on-demand ${input.product} design: ${input.prompt}${styleClause}. ${preset.note}. Crisp, print-ready artwork with no mockup, no product photo, no background scenery.`,
      size: preset.size,
      background: transparent ? "transparent" : "opaque",
      format: "png",
      quality: "high",
    });

    const result = await createVisualAssetWithFiles(context, {
      title: input.title,
      type: "visual",
      description: input.prompt,
      niche: input.niche,
      targetPlatform: input.targetPlatform,
      metadata: {
        kind: "print_on_demand",
        product: input.product,
        style: input.style ?? null,
        dimensions: preset.size,
        transparentBackground: transparent,
        keywords: input.keywords ?? [],
        printReady: true,
      },
      files: [
        {
          buffer,
          contentType,
          fileName: `${slugify(input.title)}-${input.product}.${format}`,
          kind: "image",
        },
      ],
      submitForReview: input.submitForReview ?? true,
    });

    return {
      ...result,
      product: input.product,
      transparentBackground: transparent,
      message: `Generated print-ready ${input.product} design "${input.title}" (${result.status}).`,
    };
  },
});

// ── Tool: logos + brand kit ─────────────────────────────────────────────────

registerTool({
  name: "generate_logo_brand_kit",
  description:
    "Generate a logo plus a basic brand kit (color palette, typography suggestions, voice) from a business brief. Produces multiple logo variants (primary, monochrome, icon mark) and a brand-guide document, all stored as a draft Asset Studio asset awaiting review.",
  inputSchema: z.object({
    businessName: z.string().describe("The business/brand name"),
    brief: z.string().describe("What the business does, its audience, and desired feel"),
    industry: z.string().optional().describe("Industry/sector"),
    stylePreference: z
      .string()
      .optional()
      .describe("Visual direction, e.g. 'modern minimal', 'playful', 'luxury'"),
    submitForReview: z.boolean().optional().describe("Submit to the review queue (default true)"),
  }),
  execute: async (input, context: ToolContext) => {
    requireClient(context);

    const kit = await structuredJson(
      "You are a senior brand designer. Return ONLY valid JSON.",
      `Create a brand kit for a business.
Business name: ${input.businessName}
Brief: ${input.brief}
Industry: ${input.industry ?? "unspecified"}
Style preference: ${input.stylePreference ?? "unspecified"}

Return JSON:
{
  "palette": [{"name": "string", "hex": "#RRGGBB", "usage": "string"}],
  "typography": {"heading": "font family name", "body": "font family name", "rationale": "string"},
  "logoConcept": "one-sentence visual concept for the logo",
  "tagline": "short tagline",
  "voice": "2-3 words describing brand voice"
}`,
    );

    const logoConcept =
      typeof kit.logoConcept === "string" && kit.logoConcept
        ? kit.logoConcept
        : `a clean, memorable logo for ${input.businessName}`;
    const styleClause = input.stylePreference ? `, ${input.stylePreference} aesthetic` : "";

    const variants: Array<{ label: string; prompt: string }> = [
      {
        label: "primary",
        prompt: `Primary logo for "${input.businessName}": ${logoConcept}${styleClause}. Full-color vector-style logo, flat, centered, isolated on a transparent background, no mockup.`,
      },
      {
        label: "monochrome",
        prompt: `Monochrome (solid black) version of the logo for "${input.businessName}": ${logoConcept}. Single-color, flat, centered, transparent background.`,
      },
      {
        label: "icon",
        prompt: `Icon/mark only (no text) derived from the logo for "${input.businessName}": ${logoConcept}${styleClause}. Simple square app-icon-style mark, flat, centered, transparent background.`,
      },
    ];

    const files: ProducedFile[] = [];
    for (const variant of variants) {
      const { buffer, contentType, format } = await generateImage({
        prompt: variant.prompt,
        size: variant.label === "icon" ? "1024x1024" : "1536x1024",
        background: "transparent",
        format: "png",
        quality: "high",
      });
      files.push({
        buffer,
        contentType,
        fileName: `${slugify(input.businessName)}-logo-${variant.label}.${format}`,
        kind: "image",
      });
    }

    // Attach a human-readable brand guide as a markdown deliverable.
    const palette = Array.isArray(kit.palette) ? (kit.palette as Array<Record<string, unknown>>) : [];
    const typography = (kit.typography as Record<string, unknown>) ?? {};
    const guideLines = [
      `# ${input.businessName} — Brand Kit`,
      "",
      input.brief,
      "",
      "## Logo concept",
      logoConcept,
      "",
      "## Color palette",
      ...(palette.length
        ? palette.map((c) => `- **${c.name ?? "Color"}** \`${c.hex ?? ""}\` — ${c.usage ?? ""}`)
        : ["- (none generated)"]),
      "",
      "## Typography",
      `- Heading: ${typography.heading ?? "—"}`,
      `- Body: ${typography.body ?? "—"}`,
      `- Rationale: ${typography.rationale ?? "—"}`,
      "",
      "## Voice & tagline",
      `- Voice: ${kit.voice ?? "—"}`,
      `- Tagline: ${kit.tagline ?? "—"}`,
      "",
      "## Logo variants",
      "- Primary (full color)",
      "- Monochrome (solid black)",
      "- Icon / mark",
      "",
      "_Generated by the Visual Assets creator. Awaiting human review._",
    ];
    files.push({
      buffer: Buffer.from(guideLines.join("\n"), "utf-8"),
      contentType: "text/markdown",
      fileName: `${slugify(input.businessName)}-brand-guide.md`,
      kind: "other",
    });

    const result = await createVisualAssetWithFiles(context, {
      title: `Brand kit: ${input.businessName}`,
      type: "visual",
      description: input.brief,
      niche: input.industry,
      metadata: {
        kind: "logo_brand_kit",
        businessName: input.businessName,
        stylePreference: input.stylePreference ?? null,
        palette,
        typography,
        logoConcept,
        tagline: kit.tagline ?? null,
        voice: kit.voice ?? null,
        variants: variants.map((v) => v.label),
      },
      files,
      submitForReview: input.submitForReview ?? true,
    });

    return {
      ...result,
      brandKit: { palette, typography, tagline: kit.tagline ?? null, voice: kit.voice ?? null },
      message: `Generated logo (${variants.length} variants) + brand kit for "${input.businessName}" (${result.status}).`,
    };
  },
});

// ── Tool: stock media batches ───────────────────────────────────────────────

registerTool({
  name: "generate_stock_media_batch",
  description:
    "Generate a batch of AI stock-style photos around a theme, each with a descriptive caption and keywords ready for stock-platform listing. Stored as a single draft Asset Studio asset with all images attached and per-image metadata, awaiting review.",
  inputSchema: z.object({
    theme: z.string().describe("The stock theme, e.g. 'remote work', 'autumn coffee', 'fitness'"),
    count: z.number().optional().describe("How many images to generate (1-6, default 4)"),
    style: z.string().optional().describe("Photographic style, e.g. 'bright minimal', 'moody', 'flat lay'"),
    orientation: z
      .enum(["square", "landscape", "portrait"])
      .optional()
      .describe("Image orientation; defaults to 'landscape'"),
    targetPlatform: z.string().optional().describe("Where it will be listed, e.g. Adobe Stock, Shutterstock"),
    submitForReview: z.boolean().optional().describe("Submit to the review queue (default true)"),
  }),
  execute: async (input, context: ToolContext) => {
    requireClient(context);
    const count = Math.min(Math.max(input.count ?? 4, 1), 6);
    const size = ART_SIZE_PRESETS[input.orientation ?? "landscape"];

    const conceptsJson = await structuredJson(
      "You are a stock-photography art director. Return ONLY valid JSON.",
      `Propose ${count} distinct stock photo concepts for the theme "${input.theme}".
Style: ${input.style ?? "clean, commercial"}.
Return JSON: {"concepts": [{"caption": "short descriptive caption", "prompt": "detailed photo description", "keywords": ["k1","k2","k3","k4","k5"]}]}`,
    );
    const concepts = Array.isArray(conceptsJson.concepts)
      ? (conceptsJson.concepts as Array<Record<string, unknown>>).slice(0, count)
      : [];
    // Fallback if the model returned nothing usable.
    while (concepts.length < count) {
      concepts.push({
        caption: `${input.theme} ${concepts.length + 1}`,
        prompt: `${input.theme}, professional stock photo`,
        keywords: [input.theme],
      });
    }

    const styleClause = input.style ? `, ${input.style} style` : "";
    const files: ProducedFile[] = [];
    const batchMeta: Array<{ fileName: string; caption: string; keywords: string[] }> = [];
    for (let i = 0; i < concepts.length; i++) {
      const c = concepts[i];
      const prompt = typeof c.prompt === "string" ? c.prompt : `${input.theme} stock photo`;
      const caption = typeof c.caption === "string" ? c.caption : `${input.theme} ${i + 1}`;
      const keywords = Array.isArray(c.keywords) ? (c.keywords as string[]) : [input.theme];
      const { buffer, contentType, format } = await generateImage({
        prompt: `Professional commercial stock photograph: ${prompt}${styleClause}. Realistic, high-resolution, no text, no watermark.`,
        size,
        format: "jpeg",
        quality: "high",
      });
      const fileName = `${slugify(input.theme)}-${i + 1}.${format}`;
      files.push({ buffer, contentType, fileName, kind: "image" });
      batchMeta.push({ fileName, caption, keywords });
    }

    const result = await createVisualAssetWithFiles(context, {
      title: `Stock batch: ${input.theme}`,
      type: "visual",
      description: `AI stock-style media batch for "${input.theme}" (${files.length} images).`,
      targetPlatform: input.targetPlatform,
      metadata: {
        kind: "stock_media",
        theme: input.theme,
        style: input.style ?? null,
        orientation: input.orientation ?? "landscape",
        dimensions: size,
        items: batchMeta,
      },
      files,
      submitForReview: input.submitForReview ?? true,
    });

    return {
      ...result,
      items: batchMeta,
      message: `Generated stock batch "${input.theme}" with ${files.length} images (${result.status}).`,
    };
  },
});
