import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import {
  db,
  assetsTable,
  assetFilesTable,
  type AssetStatus,
  type AssetStatusEvent,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  generateVideoScript,
  generateTutorialOutline,
  generateSocialPlan,
  generateVoiceover,
  generateThumbnail,
  generateSceneImages,
  assembleSlideshowVideo,
  VOICEOVER_VOICES,
  type VideoScriptPackage,
  type SocialPlan,
} from "../services/content/video-engine";

const objectStorage = new ObjectStorageService();

function requireClient(context: ToolContext): number {
  if (!context.clientId) {
    throw new Error("Video tools require a client context");
  }
  return context.clientId;
}

function changedByOf(context: ToolContext): string {
  return `bot:${context.botName ?? context.botId ?? "video-producer"}`;
}

function appendStatus(
  history: AssetStatusEvent[] | null | undefined,
  status: AssetStatus,
  changedBy: string,
  note?: string,
): AssetStatusEvent[] {
  return [...(history ?? []), { status, changedBy, note, at: new Date().toISOString() }];
}

async function loadOwnedAsset(assetId: number, clientId: number) {
  const [asset] = await db
    .select()
    .from(assetsTable)
    .where(and(eq(assetsTable.id, assetId), eq(assetsTable.clientId, clientId)));
  return asset;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "video"
  );
}

async function attachBuffer(params: {
  assetId: number;
  clientId: number;
  data: Buffer;
  fileName: string;
  kind: "image" | "audio" | "video" | "other";
  contentType: string;
}): Promise<void> {
  const objectPath = await objectStorage.uploadBytes({
    data: params.data,
    contentType: params.contentType,
    ownerPrefix: `assets/${params.clientId}`,
  });
  await db.insert(assetFilesTable).values({
    assetId: params.assetId,
    clientId: params.clientId,
    kind: params.kind,
    fileName: params.fileName,
    objectPath,
    contentType: params.contentType,
    sizeBytes: params.data.length,
  });
}

function scriptToMarkdown(pkg: VideoScriptPackage): string {
  const lines: string[] = [];
  lines.push(`# ${pkg.title}`, "");
  if (pkg.hook) lines.push(`**Hook:** ${pkg.hook}`, "");
  for (const [i, scene] of pkg.scenes.entries()) {
    lines.push(`## Scene ${i + 1}: ${scene.heading}`);
    lines.push(`*Visual:* ${scene.visual}`, "");
    lines.push(scene.voiceover, "");
  }
  if (pkg.callToAction) lines.push(`## Call to Action`, pkg.callToAction, "");
  lines.push(`## SEO`);
  lines.push(`- **Title:** ${pkg.seo.title}`);
  lines.push(`- **Description:** ${pkg.seo.description}`);
  lines.push(`- **Tags:** ${pkg.seo.tags.join(", ")}`);
  return lines.join("\n");
}

registerTool({
  name: "produce_video_package",
  description:
    "Produce a complete faceless video package from a topic and attach it to a NEW Asset Studio asset (type 'video'), then submit it for human review. Generates: a retention-optimized script, voiceover audio, an assembled slideshow video, a thumbnail, and YouTube SEO metadata. Optionally also produces a vertical short-form variant, an AI-assisted tutorial script + screen-recording outline, and a social posting plan (captions + schedule). The asset never auto-publishes — it lands in review awaiting human approval. Returns the created asset id and a summary of what was produced. This is a long-running tool (image/audio/video generation).",
  inputSchema: z.object({
    topic: z.string().describe("The video topic or niche idea to build the package around"),
    niche: z.string().optional().describe("Target audience/niche for tone and SEO"),
    targetPlatform: z.string().optional().describe("Primary platform, e.g. YouTube"),
    orientation: z
      .enum(["landscape", "vertical"])
      .optional()
      .describe("Main video orientation; defaults to landscape (16:9)"),
    voice: z.enum(VOICEOVER_VOICES).optional().describe("Voiceover voice; defaults to 'onyx'"),
    sceneImageCount: z
      .number()
      .optional()
      .describe("How many scene images to generate for the slideshow (1-6, default 3)"),
    includeShortForm: z.boolean().optional().describe("Also produce a vertical short-form cut"),
    includeTutorial: z
      .boolean()
      .optional()
      .describe("Also produce an AI-assisted tutorial script + screen-recording outline"),
    includeSocialPlan: z
      .boolean()
      .optional()
      .describe("Also draft social captions and a posting schedule"),
    socialPlatforms: z
      .array(z.string())
      .optional()
      .describe("Platforms for the social plan, e.g. ['YouTube','TikTok','Instagram','X']"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const changedBy = changedByOf(context);
    const warnings: string[] = [];
    const produced: string[] = [];

    // 1. Script + SEO (essential — abort the whole package if this fails).
    const script = await generateVideoScript({
      topic: input.topic,
      niche: input.niche,
      format: "long",
      clientId,
      botId: context.botId,
    });
    produced.push("script", "seo");

    // 2. Create the asset record (idea stage).
    const [asset] = await db
      .insert(assetsTable)
      .values({
        clientId,
        botId: context.botId ?? null,
        title: script.title,
        type: "video",
        description: script.seo.description || `Faceless video about ${input.topic}`,
        niche: input.niche ?? null,
        targetPlatform: input.targetPlatform ?? "YouTube",
        status: "idea",
        statusHistory: appendStatus([], "idea", changedBy, "produced via video engine"),
        metadata: {},
      })
      .returning();
    const assetId = asset.id;
    const slug = slugify(script.title);

    // Attach the script as a markdown file.
    try {
      await attachBuffer({
        assetId,
        clientId,
        data: Buffer.from(scriptToMarkdown(script), "utf-8"),
        fileName: `${slug}-script.md`,
        kind: "other",
        contentType: "text/markdown",
      });
    } catch (err) {
      warnings.push(`script file: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Voiceover audio.
    let voiceover: Buffer | null = null;
    try {
      voiceover = await generateVoiceover({ narration: script.narration, voice: input.voice });
      await attachBuffer({
        assetId,
        clientId,
        data: voiceover,
        fileName: `${slug}-voiceover.mp3`,
        kind: "audio",
        contentType: "audio/mpeg",
      });
      produced.push("voiceover");
    } catch (err) {
      warnings.push(`voiceover: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4. Thumbnail.
    try {
      const thumb = await generateThumbnail({ prompt: `${script.title}. ${input.topic}` });
      await attachBuffer({
        assetId,
        clientId,
        data: thumb,
        fileName: `${slug}-thumbnail.png`,
        kind: "image",
        contentType: "image/png",
      });
      produced.push("thumbnail");
    } catch (err) {
      warnings.push(`thumbnail: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 5. Assembled slideshow video (needs scene images + voiceover).
    if (voiceover) {
      try {
        const images = await generateSceneImages({
          scenes: script.scenes,
          max: input.sceneImageCount ?? 3,
        });
        const video = await assembleSlideshowVideo({
          images,
          audio: voiceover,
          orientation: input.orientation ?? "landscape",
        });
        await attachBuffer({
          assetId,
          clientId,
          data: video,
          fileName: `${slug}-video.mp4`,
          kind: "video",
          contentType: "video/mp4",
        });
        produced.push("video");
      } catch (err) {
        warnings.push(`video assembly: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      warnings.push("video assembly: skipped (no voiceover audio)");
    }

    const metadata: Record<string, unknown> = {
      videoPackage: {
        topic: input.topic,
        orientation: input.orientation ?? "landscape",
        hook: script.hook,
        scenes: script.scenes.map((s) => ({ heading: s.heading, visual: s.visual })),
        callToAction: script.callToAction,
        seo: script.seo,
        estimatedDurationSeconds: script.estimatedDurationSeconds,
        generatedAt: new Date().toISOString(),
      },
    };

    // 6. Short-form variant.
    if (input.includeShortForm) {
      try {
        const short = await generateVideoScript({
          topic: input.topic,
          niche: input.niche,
          format: "short",
          clientId,
          botId: context.botId,
        });
        await attachBuffer({
          assetId,
          clientId,
          data: Buffer.from(scriptToMarkdown(short), "utf-8"),
          fileName: `${slug}-short-script.md`,
          kind: "other",
          contentType: "text/markdown",
        });
        let shortVo: Buffer | null = null;
        try {
          shortVo = await generateVoiceover({ narration: short.narration, voice: input.voice });
          await attachBuffer({
            assetId,
            clientId,
            data: shortVo,
            fileName: `${slug}-short-voiceover.mp3`,
            kind: "audio",
            contentType: "audio/mpeg",
          });
          const shortImages = await generateSceneImages({ scenes: short.scenes, max: 3 });
          const shortVideo = await assembleSlideshowVideo({
            images: shortImages,
            audio: shortVo,
            orientation: "vertical",
          });
          await attachBuffer({
            assetId,
            clientId,
            data: shortVideo,
            fileName: `${slug}-short.mp4`,
            kind: "video",
            contentType: "video/mp4",
          });
        } catch (err) {
          warnings.push(`short-form media: ${err instanceof Error ? err.message : String(err)}`);
        }
        (metadata.videoPackage as Record<string, unknown>).shortForm = {
          title: short.title,
          hook: short.hook,
          seo: short.seo,
        };
        produced.push("short-form");
      } catch (err) {
        warnings.push(`short-form: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 7. AI-assisted tutorial variant.
    if (input.includeTutorial) {
      try {
        const tutorial = await generateTutorialOutline({
          topic: input.topic,
          niche: input.niche,
          clientId,
          botId: context.botId,
        });
        const md = [
          `# ${tutorial.title} (Tutorial)`,
          "",
          "## Narration Script",
          tutorial.narrationScript,
          "",
          "## Screen Recording Outline",
          ...tutorial.screenRecordingOutline.map(
            (s) => `${s.step}. **${s.action}** — _on screen:_ ${s.onScreen}`,
          ),
        ].join("\n");
        await attachBuffer({
          assetId,
          clientId,
          data: Buffer.from(md, "utf-8"),
          fileName: `${slug}-tutorial.md`,
          kind: "other",
          contentType: "text/markdown",
        });
        (metadata.videoPackage as Record<string, unknown>).tutorial = {
          title: tutorial.title,
          steps: tutorial.screenRecordingOutline.length,
          seo: tutorial.seo,
        };
        produced.push("tutorial");
      } catch (err) {
        warnings.push(`tutorial: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 8. Social posting plan.
    if (input.includeSocialPlan) {
      try {
        const plan = await generateSocialPlan({
          title: script.title,
          summary: script.seo.description || input.topic,
          platforms: input.socialPlatforms ?? [],
          clientId,
          botId: context.botId,
        });
        metadata.socialPlan = plan;
        produced.push("social-plan");
      } catch (err) {
        warnings.push(`social plan: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 9. Finalize: persist metadata and submit for human review.
    await db
      .update(assetsTable)
      .set({
        metadata,
        status: "in_review",
        statusHistory: appendStatus(
          asset.statusHistory,
          "in_review",
          changedBy,
          "video package produced; awaiting human review",
        ),
        updatedAt: new Date(),
      })
      .where(eq(assetsTable.id, assetId));

    return {
      assetId,
      status: "in_review",
      title: script.title,
      produced,
      warnings,
      message:
        `Produced video package "${script.title}" (${produced.join(", ")}) on asset ${assetId}. ` +
        `It is in review awaiting your approval before publishing/export.` +
        (warnings.length ? ` Warnings: ${warnings.length}.` : ""),
    };
  },
});

registerTool({
  name: "draft_social_plan",
  description:
    "Draft a social posting plan (platform-native captions + a staggered posting schedule) for an EXISTING asset and store it on the asset so it surfaces in the Asset Studio. Use after a video package exists, or to (re)plan distribution. Does not publish anything.",
  inputSchema: z.object({
    assetId: z.number().describe("The asset to draft a social plan for"),
    platforms: z
      .array(z.string())
      .optional()
      .describe("Target platforms, e.g. ['YouTube','TikTok','Instagram','X']"),
    startAt: z
      .string()
      .optional()
      .describe("ISO timestamp for the first post; defaults to 24h from now"),
    cadenceHours: z
      .number()
      .optional()
      .describe("Hours between scheduled posts; defaults to 24"),
  }),
  execute: async (input, context: ToolContext) => {
    const clientId = requireClient(context);
    const asset = await loadOwnedAsset(input.assetId, clientId);
    if (!asset) throw new Error("Asset not found for this client");

    const summary =
      asset.description ||
      ((asset.metadata as Record<string, unknown> | null)?.videoPackage as
        | { seo?: { description?: string } }
        | undefined)?.seo?.description ||
      asset.title;

    const plan: SocialPlan = await generateSocialPlan({
      title: asset.title,
      summary,
      platforms: input.platforms ?? [],
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      cadenceHours: input.cadenceHours,
      clientId,
      botId: context.botId,
    });

    const metadata = { ...(asset.metadata ?? {}), socialPlan: plan } as Record<string, unknown>;
    await db
      .update(assetsTable)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(assetsTable.id, input.assetId));

    return {
      assetId: input.assetId,
      postCount: plan.posts.length,
      schedule: plan.posts.map((p) => ({ platform: p.platform, scheduledAt: p.scheduledAt })),
      message: `Drafted ${plan.posts.length} scheduled social post(s) for asset ${input.assetId}.`,
    };
  },
});
