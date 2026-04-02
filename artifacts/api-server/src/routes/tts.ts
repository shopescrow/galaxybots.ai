import { Router } from "express";
import crypto from "crypto";
import { authenticate } from "../middleware/auth.js";
import { db, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

const PAID_PLANS = ["starter", "pro", "scale", "team", "enterprise"];

interface CacheEntry {
  audio: string;
  contentType: string;
  cachedAt: number;
}

const audioCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCacheKey(voiceId: string, text: string): string {
  const hash = crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
  return `${voiceId}:${hash}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of audioCache.entries()) {
    if (now - entry.cachedAt > CACHE_TTL_MS) {
      audioCache.delete(key);
    }
  }
}

router.post("/tts/generate", authenticate, async (req, res): Promise<void> => {
  if (!ELEVENLABS_API_KEY) {
    res.status(503).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  const user = req.user!;
  const isPaid = user.bypassPayment || (user.plan && PAID_PLANS.includes(user.plan));
  if (!isPaid) {
    res.status(402).json({
      error: "upgrade_required",
      message: "Upgrade to hear your executive team",
    });
    return;
  }

  const { text, voiceId: bodyVoiceId, botId } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  let voice = DEFAULT_VOICE_ID;
  let resolvedBotId: number | null = botId ? Number(botId) : null;

  if (resolvedBotId) {
    try {
      const [bot] = await db
        .select({ voiceId: botsTable.voiceId })
        .from(botsTable)
        .where(eq(botsTable.id, resolvedBotId));
      if (bot?.voiceId) {
        voice = bot.voiceId;
      }
    } catch (err) {
      console.error("[TTS] Bot lookup error:", err);
    }
  } else if (bodyVoiceId) {
    voice = bodyVoiceId;
  }

  const cacheKeyId = resolvedBotId ?? voice;
  const cacheKey = getCacheKey(String(cacheKeyId), text);
  const cached = audioCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    res.json({ audio: cached.audio, contentType: cached.contentType, fromCache: true });
    return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("[TTS] ElevenLabs error:", response.status, errText);
      res.status(response.status).json({ error: "TTS generation failed", details: errText });
      return;
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");

    const entry: CacheEntry = {
      audio: base64Audio,
      contentType: "audio/mpeg",
      cachedAt: Date.now(),
    };
    audioCache.set(cacheKey, entry);

    if (audioCache.size % 50 === 0) {
      pruneCache();
    }

    res.json({ audio: base64Audio, contentType: "audio/mpeg", fromCache: false });
  } catch (err) {
    console.error("[TTS] Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tts/voices", async (_req, res): Promise<void> => {
  if (!ELEVENLABS_API_KEY) {
    res.status(503).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Failed to fetch voices" });
      return;
    }

    const data = await response.json() as { voices: Array<{ voice_id: string; name: string; category: string }> };
    const voices = (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
    }));

    res.json({ voices });
  } catch (err) {
    console.error("[TTS] Voices error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
