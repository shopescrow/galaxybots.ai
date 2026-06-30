import { spawn } from "child_process";
import { mkdtemp, rm, writeFile, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  generateImageBuffer,
  textToSpeech,
} from "@workspace/integrations-openai-ai-server";
import { callWithFallback } from "../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../ai-safety/model-router";

/**
 * Faceless video & social content engine (task #263).
 *
 * Pure production helpers used by the Video Producer creator bot's tools. Each
 * function does one job — script, voiceover, thumbnail, scene imagery, video
 * assembly, short-form/tutorial variants, and a social posting plan — so the
 * orchestrating tool can compose a complete package and report partial
 * failures explicitly rather than silently substituting placeholder media.
 *
 * Text generation routes through `callWithFallback` (the single safe model
 * path with circuit breakers + usage logging). Voiceover uses the gpt-audio
 * TTS helper and thumbnails/scene imagery use gpt-image-1 — the same media
 * generators the platform already provisions.
 */

// ── Model routing ───────────────────────────────────────────────────────────
// Frontier lead model resolved via model-router; callWithFallback degrades through its safe chain.
const SCRIPT_MODEL = resolveCapability(ModelCapability.REASONING_PREMIUM);

export type VideoOrientation = "landscape" | "vertical";
export type VideoScriptFormat = "long" | "short";

export const VOICEOVER_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
export type VoiceoverVoice = (typeof VOICEOVER_VOICES)[number];

export interface VideoScene {
  heading: string;
  /** Spoken narration for this scene. */
  voiceover: string;
  /** Visual direction — used as the scene's image-generation prompt. */
  visual: string;
}

export interface VideoSeo {
  title: string;
  description: string;
  tags: string[];
}

export interface VideoScriptPackage {
  title: string;
  hook: string;
  scenes: VideoScene[];
  /** Full narration (every scene's voiceover joined) ready for TTS. */
  narration: string;
  callToAction: string;
  seo: VideoSeo;
  estimatedDurationSeconds: number;
}

export interface TutorialOutline {
  title: string;
  narrationScript: string;
  /** Ordered on-screen recording steps a human performs while narrating. */
  screenRecordingOutline: { step: number; action: string; onScreen: string }[];
  seo: VideoSeo;
}

export interface SocialPost {
  platform: string;
  caption: string;
  hashtags: string[];
  /** ISO timestamp the post is scheduled for. */
  scheduledAt: string;
}

export interface SocialPlan {
  posts: SocialPost[];
  generatedAt: string;
}

// ── JSON extraction ──────────────────────────────────────────────────────────
function extractJson<T>(raw: string): T {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(match[0]) as T;
}

async function completeJson<T>(params: {
  system: string;
  user: string;
  clientId?: number;
  botId?: number;
  maxTokens?: number;
}): Promise<T> {
  const result = await callWithFallback({
    model: SCRIPT_MODEL,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    maxCompletionTokens: params.maxTokens ?? 1600,
    clientId: params.clientId,
    botId: params.botId,
  });
  const content = result.completion.choices[0]?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error("Model returned an empty response");
  }
  return extractJson<T>(content);
}

// ── Script generation ────────────────────────────────────────────────────────
export async function generateVideoScript(params: {
  topic: string;
  niche?: string;
  format?: VideoScriptFormat;
  clientId?: number;
  botId?: number;
}): Promise<VideoScriptPackage> {
  const format = params.format ?? "long";
  const isShort = format === "short";
  const sceneGuidance = isShort
    ? "3 to 4 punchy scenes for a 30-60 second vertical short. Total narration under 150 words."
    : "5 to 7 scenes for a 4-8 minute faceless YouTube video. Total narration 500-900 words.";

  const system =
    "You are an elite faceless-video scriptwriter and YouTube SEO strategist. " +
    "You write retention-optimized scripts: a scroll-stopping hook in the first 3 seconds, " +
    "tight pacing, pattern interrupts, and a clear call to action. You never appear on camera, " +
    "so every scene needs strong visual direction for B-roll or generated imagery. " +
    "Respond with ONLY a JSON object, no prose.";

  const user =
    `Create a faceless video script.\n` +
    `Topic: ${params.topic}\n` +
    (params.niche ? `Niche/audience: ${params.niche}\n` : "") +
    `Format: ${sceneGuidance}\n\n` +
    `Return JSON shaped exactly like:\n` +
    `{\n` +
    `  "title": "string (compelling video title)",\n` +
    `  "hook": "string (first spoken line, <=2 sentences)",\n` +
    `  "scenes": [{ "heading": "string", "voiceover": "string (spoken lines)", "visual": "string (image/b-roll direction)" }],\n` +
    `  "callToAction": "string",\n` +
    `  "seo": { "title": "string (<=70 chars)", "description": "string (2-3 sentences with keywords)", "tags": ["string", ...] }\n` +
    `}`;

  const parsed = await completeJson<Partial<VideoScriptPackage>>({
    system,
    user,
    clientId: params.clientId,
    botId: params.botId,
    maxTokens: isShort ? 1200 : 2200,
  });

  const scenes: VideoScene[] = Array.isArray(parsed.scenes)
    ? parsed.scenes
        .filter((s) => s && (s.voiceover || s.heading))
        .map((s) => ({
          heading: String(s.heading ?? "Scene"),
          voiceover: String(s.voiceover ?? ""),
          visual: String(s.visual ?? params.topic),
        }))
    : [];

  if (scenes.length === 0) {
    throw new Error("Script generation produced no usable scenes");
  }

  const hook = String(parsed.hook ?? "").trim();
  const narration = [hook, ...scenes.map((s) => s.voiceover)]
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const wordCount = narration.split(/\s+/).filter(Boolean).length;

  return {
    title: String(parsed.title ?? params.topic),
    hook,
    scenes,
    narration,
    callToAction: String(parsed.callToAction ?? ""),
    seo: {
      title: String(parsed.seo?.title ?? parsed.title ?? params.topic).slice(0, 100),
      description: String(parsed.seo?.description ?? ""),
      tags: Array.isArray(parsed.seo?.tags)
        ? parsed.seo!.tags.map((t) => String(t)).slice(0, 20)
        : [],
    },
    // ~150 spoken words per minute.
    estimatedDurationSeconds: Math.max(15, Math.round((wordCount / 150) * 60)),
  };
}

export async function generateTutorialOutline(params: {
  topic: string;
  niche?: string;
  clientId?: number;
  botId?: number;
}): Promise<TutorialOutline> {
  const system =
    "You are a senior technical educator who writes AI-assisted tutorial scripts " +
    "paired with a precise screen-recording outline. A human records their screen " +
    "while narrating your script. Respond with ONLY a JSON object.";

  const user =
    `Create an AI-assisted tutorial package.\n` +
    `Topic: ${params.topic}\n` +
    (params.niche ? `Audience: ${params.niche}\n` : "") +
    `Return JSON shaped exactly like:\n` +
    `{\n` +
    `  "title": "string",\n` +
    `  "narrationScript": "string (the full spoken script, paragraphs)",\n` +
    `  "screenRecordingOutline": [{ "step": 1, "action": "what the recorder does", "onScreen": "what should be visible" }],\n` +
    `  "seo": { "title": "string", "description": "string", "tags": ["string", ...] }\n` +
    `}`;

  const parsed = await completeJson<Partial<TutorialOutline>>({
    system,
    user,
    clientId: params.clientId,
    botId: params.botId,
    maxTokens: 2200,
  });

  const outline = Array.isArray(parsed.screenRecordingOutline)
    ? parsed.screenRecordingOutline.map((s, i) => ({
        step: Number(s?.step ?? i + 1),
        action: String(s?.action ?? ""),
        onScreen: String(s?.onScreen ?? ""),
      }))
    : [];

  if (!parsed.narrationScript || outline.length === 0) {
    throw new Error("Tutorial generation produced an incomplete outline");
  }

  return {
    title: String(parsed.title ?? params.topic),
    narrationScript: String(parsed.narrationScript),
    screenRecordingOutline: outline,
    seo: {
      title: String(parsed.seo?.title ?? parsed.title ?? params.topic).slice(0, 100),
      description: String(parsed.seo?.description ?? ""),
      tags: Array.isArray(parsed.seo?.tags)
        ? parsed.seo!.tags.map((t) => String(t)).slice(0, 20)
        : [],
    },
  };
}

export async function generateSocialPlan(params: {
  title: string;
  summary: string;
  platforms: string[];
  startAt?: Date;
  cadenceHours?: number;
  clientId?: number;
  botId?: number;
}): Promise<SocialPlan> {
  const platforms = params.platforms.length > 0 ? params.platforms : ["YouTube", "TikTok", "Instagram", "X"];
  const system =
    "You are a social media manager. You write platform-native captions (tone and " +
    "length tuned per platform) and pick relevant hashtags. Respond with ONLY a JSON object.";

  const user =
    `Draft launch captions for this video across platforms: ${platforms.join(", ")}.\n` +
    `Video title: ${params.title}\n` +
    `Summary: ${params.summary}\n` +
    `Return JSON shaped like:\n` +
    `{ "posts": [{ "platform": "string", "caption": "string", "hashtags": ["#tag", ...] }] }`;

  const parsed = await completeJson<{ posts?: Array<Partial<SocialPost>> }>({
    system,
    user,
    clientId: params.clientId,
    botId: params.botId,
    maxTokens: 1400,
  });

  const start = params.startAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const cadenceMs = (params.cadenceHours ?? 24) * 60 * 60 * 1000;

  const rawPosts = Array.isArray(parsed.posts) ? parsed.posts : [];
  const posts: SocialPost[] = rawPosts
    .filter((p) => p && p.caption)
    .map((p, i) => ({
      platform: String(p.platform ?? platforms[i % platforms.length]),
      caption: String(p.caption ?? ""),
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.map((h) => String(h)) : [],
      scheduledAt: new Date(start.getTime() + i * cadenceMs).toISOString(),
    }));

  if (posts.length === 0) {
    throw new Error("Social plan generation produced no posts");
  }

  return { posts, generatedAt: new Date().toISOString() };
}

// ── Media generation ─────────────────────────────────────────────────────────
export async function generateVoiceover(params: {
  narration: string;
  voice?: VoiceoverVoice;
}): Promise<Buffer> {
  const voice = params.voice ?? "onyx";
  const buffer = await textToSpeech(params.narration, voice, "mp3");
  if (!buffer || buffer.length === 0) {
    throw new Error("Voiceover generation returned empty audio");
  }
  return buffer;
}

export async function generateThumbnail(params: {
  prompt: string;
}): Promise<Buffer> {
  const prompt =
    `YouTube thumbnail, bold high-contrast composition, dramatic lighting, ` +
    `clear focal subject, vivid colors, no text: ${params.prompt}`;
  const buffer = await generateImageBuffer(prompt, "1024x1024");
  if (!buffer || buffer.length === 0) {
    throw new Error("Thumbnail generation returned empty image");
  }
  return buffer;
}

export async function generateSceneImages(params: {
  scenes: VideoScene[];
  max?: number;
}): Promise<Buffer[]> {
  const max = Math.max(1, Math.min(params.max ?? 3, 6));
  const selected = params.scenes.slice(0, max);
  const images: Buffer[] = [];
  for (const scene of selected) {
    const buffer = await generateImageBuffer(
      `Cinematic faceless-video B-roll still, no text, photorealistic: ${scene.visual}`,
      "1024x1024",
    );
    if (buffer && buffer.length > 0) images.push(buffer);
  }
  if (images.length === 0) {
    throw new Error("Scene image generation produced no usable images");
  }
  return images;
}

// ── Video assembly (ffmpeg slideshow + voiceover) ────────────────────────────
function ffprobeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("close", (code) => {
      const seconds = parseFloat(out.trim());
      if (code === 0 && Number.isFinite(seconds) && seconds > 0) resolve(seconds);
      else reject(new Error("Could not determine audio duration"));
    });
    proc.on("error", reject);
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Assemble a faceless video: a slideshow of generated scene images, each shown
 * for an equal slice of the voiceover duration, muxed with the narration audio.
 * Returns an MP4 buffer. Orientation controls the canvas (16:9 vs 9:16).
 */
export async function assembleSlideshowVideo(params: {
  images: Buffer[];
  audio: Buffer;
  orientation?: VideoOrientation;
}): Promise<Buffer> {
  if (params.images.length === 0) {
    throw new Error("Cannot assemble video without images");
  }
  const orientation = params.orientation ?? "landscape";
  const [w, h] = orientation === "vertical" ? [1080, 1920] : [1920, 1080];
  const dir = await mkdtemp(join(tmpdir(), "vid-"));

  try {
    const audioPath = join(dir, "audio.mp3");
    await writeFile(audioPath, params.audio);
    const totalDuration = await ffprobeDurationSeconds(audioPath);
    const perImage = Math.max(1.5, totalDuration / params.images.length);

    const imagePaths: string[] = [];
    for (let i = 0; i < params.images.length; i++) {
      const p = join(dir, `img${i}.png`);
      await writeFile(p, params.images[i]);
      imagePaths.push(p);
    }

    const inputArgs: string[] = [];
    for (const p of imagePaths) {
      inputArgs.push("-loop", "1", "-t", perImage.toFixed(2), "-i", p);
    }
    inputArgs.push("-i", audioPath);

    const scaleFilters = imagePaths
      .map(
        (_, i) =>
          `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
          `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
      )
      .join(";");
    const concatInputs = imagePaths.map((_, i) => `[v${i}]`).join("");
    const filter = `${scaleFilters};${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[v]`;

    const audioInputIndex = imagePaths.length;
    const outPath = join(dir, "out.mp4");
    await runFfmpeg([
      ...inputArgs,
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      `${audioInputIndex}:a`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-y",
      outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
