import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  zh: "Mandarin Chinese",
  ar: "Arabic",
  pt: "Brazilian Portuguese",
  ja: "Japanese",
  hi: "Hindi",
  ru: "Russian",
  it: "Italian",
  ko: "Korean",
  nl: "Dutch",
  tr: "Turkish",
  sv: "Swedish",
};

router.post("/translate", async (req, res) => {
  try {
    const { texts, targetLanguage } = req.body;

    if (!texts || !targetLanguage) {
      res.status(400).json({ error: "texts and targetLanguage are required" }); return;
    }

    if (!SUPPORTED_LANGUAGES[targetLanguage]) {
      res.status(400).json({ error: `Unsupported language: ${targetLanguage}` }); return;
    }

    if (targetLanguage === "en") {
      const arr = Array.isArray(texts) ? texts : [texts];
      res.json({ translations: arr, language: "en" }); return;
    }

    const langName = SUPPORTED_LANGUAGES[targetLanguage];
    const arr: string[] = Array.isArray(texts) ? texts : [texts];

    const numbered = arr.map((t, i) => `${i + 1}. ${t}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini", // high-volume translation, cost-efficient
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following numbered list of texts into ${langName}. 
Return ONLY a JSON array of translated strings in the same order, with no extra text or explanation.
Preserve formatting, capitalization style, and tone. Corporate/professional tone should be maintained.
Example output: ["Translation 1", "Translation 2", "Translation 3"]`,
        },
        {
          role: "user",
          content: numbered,
        },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    let translations: string[];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      translations = jsonMatch ? JSON.parse(jsonMatch[0]) : arr;
    } catch {
      translations = arr;
    }

    res.json({ translations, language: targetLanguage, languageName: langName });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

router.get("/translate/languages", (_req, res) => {
  res.json(SUPPORTED_LANGUAGES);
});

export default router;
