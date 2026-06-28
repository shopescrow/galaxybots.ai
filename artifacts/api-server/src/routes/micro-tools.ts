import { Router, type IRouter } from "express";
import { callWithFallback, ModelTier } from "../services/ai-safety/model-fallback";

/**
 * Public Micro-SaaS tool endpoints (task #264).
 *
 * These power standalone single-purpose AI tools (their own web artifacts) and
 * are intentionally PUBLIC — "/micro-tools/" is listed in PUBLIC_PREFIX_SUFFIXES
 * in app.ts so unauthenticated subscribers of a standalone tool can reach them.
 * Every endpoint runs through `callWithFallback`, the single shared, governed AI
 * access path (circuit breakers, fallback chains, usage logging).
 *
 * The bundled example tool is the caption writer, which validates the builder →
 * scaffold → standalone-artifact pipeline end to end.
 */

const router: IRouter = Router();

const MAX_INPUT_CHARS = 600;

const CAPTION_TONES = [
  "professional",
  "playful",
  "bold",
  "inspirational",
  "minimal",
  "witty",
] as const;
type CaptionTone = (typeof CAPTION_TONES)[number];

const CAPTION_PLATFORMS = [
  "instagram",
  "linkedin",
  "x",
  "tiktok",
  "facebook",
] as const;
type CaptionPlatform = (typeof CAPTION_PLATFORMS)[number];

function stripJsonFences(text: string): string {
  const fenced = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// ---- Catalog (info / health) ------------------------------------------------
router.get("/micro-tools/catalog", (_req, res): void => {
  res.json({
    tools: [
      {
        slug: "caption-writer",
        name: "Caption Forge",
        endpoint: "/api/v1/micro-tools/caption-writer",
        description:
          "Generate scroll-stopping social media captions from a topic, tone and platform.",
      },
    ],
  });
});

// ---- Caption writer (example micro-SaaS tool) -------------------------------
router.post("/micro-tools/caption-writer", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as {
    topic?: unknown;
    tone?: unknown;
    platform?: unknown;
    count?: unknown;
  };

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) {
    res.status(400).json({ error: "A 'topic' is required." });
    return;
  }
  if (topic.length > MAX_INPUT_CHARS) {
    res.status(400).json({ error: `Topic must be under ${MAX_INPUT_CHARS} characters.` });
    return;
  }

  const tone: CaptionTone = CAPTION_TONES.includes(body.tone as CaptionTone)
    ? (body.tone as CaptionTone)
    : "professional";
  const platform: CaptionPlatform = CAPTION_PLATFORMS.includes(
    body.platform as CaptionPlatform,
  )
    ? (body.platform as CaptionPlatform)
    : "instagram";
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 8);

  const systemPrompt = `You are Caption Forge, an expert social media copywriter. Write ${count} distinct, scroll-stopping ${tone} captions for ${platform}.
Rules:
- Each caption is self-contained and ready to post.
- Match the ${tone} tone and ${platform} conventions.
- Include 2-4 relevant hashtags where the platform expects them (skip hashtags for LinkedIn long-form).
- Vary the angle across captions (hook, story, question, CTA, etc.).
Return ONLY a JSON array of strings (the captions), no prose, no markdown.`;

  try {
    const result = await callWithFallback({
      model: "gpt-5-mini",
      preferredTier: ModelTier.EFFICIENT,
      maxCompletionTokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Topic: ${topic}` },
      ],
    });

    const content = result.completion.choices[0]?.message?.content ?? "";
    let captions: string[];
    try {
      const parsed = JSON.parse(stripJsonFences(content));
      captions = Array.isArray(parsed)
        ? parsed.map((c) => String(c)).filter(Boolean)
        : [];
    } catch {
      // Model didn't return clean JSON — split into non-empty lines as a
      // last resort so the user still gets usable output.
      captions = content
        .split("\n")
        .map((l) => l.replace(/^\s*[-*\d.]+\s*/, "").trim())
        .filter(Boolean);
    }

    if (captions.length === 0) {
      res.status(502).json({ error: "The AI service returned no captions. Please try again." });
      return;
    }

    res.json({ tone, platform, captions: captions.slice(0, count) });
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error
          ? err.message
          : "The AI service is temporarily unavailable. Please try again.",
    });
  }
});

export function registerMicroToolsRoutes(parent: IRouter) {
  parent.use(router);
}

export default router;
