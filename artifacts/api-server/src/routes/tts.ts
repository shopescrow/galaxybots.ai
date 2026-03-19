import { Router } from "express";

const router = Router();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

router.post("/tts/generate", async (req, res): Promise<void> => {
  if (!ELEVENLABS_API_KEY) {
    res.status(503).json({ error: "ElevenLabs API key not configured" });
    return;
  }

  const { text, voiceId } = req.body;
  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const voice = voiceId || DEFAULT_VOICE_ID;
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

    res.json({
      audio: base64Audio,
      contentType: "audio/mpeg",
    });
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
