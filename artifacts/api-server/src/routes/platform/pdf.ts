import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import crypto from "crypto";
import { PDFParse } from "pdf-parse";

const router = Router();

const ANALYSIS_CACHE = new Map<string, { result: unknown; cachedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function cacheKey(source: string): string {
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 24);
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of ANALYSIS_CACHE.entries()) {
    if (now - v.cachedAt > CACHE_TTL_MS) ANALYSIS_CACHE.delete(k);
  }
}

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "GalaxyBots-PDF-Intelligence/1.0" },
  });
  if (!res.ok) throw new Error(`Failed to fetch PDF: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("pdf") && !url.endsWith(".pdf")) {
    const bodyText = await res.text();
    if (!bodyText.startsWith("%PDF")) throw new Error("URL does not point to a valid PDF");
    return Buffer.from(bodyText, "binary");
  }
  return Buffer.from(await res.arrayBuffer());
}

async function extractText(input: { url?: string; base64?: string }): Promise<{ text: string; numPages: number; info: Record<string, unknown> }> {
  let buf: Buffer;
  if (input.url) {
    buf = await fetchPdfBuffer(input.url);
  } else if (input.base64) {
    buf = Buffer.from(input.base64, "base64");
  } else {
    throw new Error("Provide either url or base64");
  }
  const parser = new PDFParse({ data: buf });
  const textResult = await parser.getText();
  const infoResult = await parser.getInfo();
  return {
    text: textResult.text?.trim() || "",
    numPages: textResult.total || 0,
    info: (infoResult.info || {}) as Record<string, unknown>,
  };
}

const DIRECTOR_ROUTING: Record<string, { director: string; department: string; reason: string }> = {
  invoice:     { director: "Penny Ledger",   department: "Finance",    reason: "Financial document requiring approval and payment processing" },
  contract:    { director: "Vault Viper",    department: "Legal",      reason: "Legal agreement requiring review and risk assessment" },
  resume:      { director: "Ember Heart",    department: "HR",         reason: "Candidate profile for talent acquisition review" },
  report:      { director: "Optima Prime",   department: "Executive",  reason: "Strategic report for executive review and decision-making" },
  proposal:    { director: "Brand Blaze",    department: "Marketing",  reason: "Business proposal requiring strategic positioning" },
  policy:      { director: "Vault Viper",    department: "Compliance", reason: "Policy document for compliance and governance review" },
  financial:   { director: "Penny Ledger",   department: "Finance",    reason: "Financial statement requiring CFO analysis" },
  technical:   { director: "Neural Nexus",   department: "Technology", reason: "Technical document for engineering review" },
  marketing:   { director: "Brand Blaze",    department: "Marketing",  reason: "Marketing material for brand alignment review" },
  research:    { director: "Optima Prime",   department: "Strategy",   reason: "Research document for strategic intelligence" },
  compliance:  { director: "Vault Viper",    department: "Compliance", reason: "Compliance document requiring CISO/legal review" },
  hr:          { director: "Ember Heart",    department: "HR",         reason: "HR document for people operations review" },
  other:       { director: "Optima Prime",   department: "Executive",  reason: "General document — routed to CEO for initial triage" },
};

async function llmAnalyze(text: string, depth: "standard" | "deep" = "standard"): Promise<Record<string, unknown>> {
  const truncated = text.slice(0, depth === "deep" ? 12000 : 6000);
  const model = depth === "deep" ? "gpt-4o" : "gpt-5-mini";

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are GalaxyPDF Intelligence, an expert document analyst for the GalaxyBots AI executive platform.
Analyze the document and respond with valid JSON only, no markdown.`,
      },
      {
        role: "user",
        content: `Analyze this document text and return a JSON object with these exact fields:
{
  "documentType": "invoice|contract|resume|report|proposal|policy|financial|technical|marketing|research|compliance|hr|other",
  "title": "inferred document title or best description",
  "language": "detected language code e.g. en",
  "summary": "2-4 sentence plain-English summary",
  "keyInsights": ["array", "of", "3-7", "key", "insights"],
  "actionItems": ["array", "of", "concrete", "action", "items", "if", "any"],
  "entities": {
    "people": ["named people found"],
    "organizations": ["organizations found"],
    "dates": ["dates found"],
    "amounts": ["monetary amounts found"],
    "locations": ["locations found"]
  },
  "tables": [{"description": "what this table contains", "estimatedRows": 0}],
  "riskFlags": ["any compliance, legal, financial, or operational risk flags"],
  "confidenceScore": 0.95,
  "sentiment": "positive|neutral|negative|mixed"
}

Document text:
${truncated}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { summary: raw, documentType: "other" };
  }
}

router.post("/pdf/analyze", authenticate, async (req, res): Promise<void> => {
  pruneCache();
  const { url, base64, depth = "standard" } = req.body as {
    url?: string;
    base64?: string;
    depth?: "standard" | "deep";
  };

  if (!url && !base64) {
    res.status(400).json({ error: "Provide url or base64 field" });
    return;
  }

  const key = cacheKey(url || base64 || "");
  const cached = ANALYSIS_CACHE.get(key);
  if (cached) {
    res.json({ ...cached.result, cached: true });
    return;
  }

  try {
    const { text, numPages, info } = await extractText({ url, base64 });
    if (!text) {
      res.status(422).json({ error: "Could not extract text from PDF — it may be scanned/image-only" });
      return;
    }

    const analysis = await llmAnalyze(text, depth as "standard" | "deep");
    const docType = String(analysis.documentType || "other");
    const routing = DIRECTOR_ROUTING[docType] || DIRECTOR_ROUTING.other;

    const result = {
      ...analysis,
      metadata: { numPages, info, characterCount: text.length, source: url ? "url" : "base64", depth },
      directorRouting: routing,
      cached: false,
      analyzedAt: new Date().toISOString(),
    };

    ANALYSIS_CACHE.set(key, { result, cachedAt: Date.now() });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: msg });
  }
});

router.post("/pdf/extract", authenticate, async (req, res): Promise<void> => {
  const { url, base64, schema } = req.body as {
    url?: string;
    base64?: string;
    schema: Record<string, string>;
  };

  if (!url && !base64) {
    res.status(400).json({ error: "Provide url or base64 field" });
    return;
  }
  if (!schema || typeof schema !== "object") {
    res.status(400).json({ error: "schema is required — e.g. { invoice_number: 'string', total: 'number' }" });
    return;
  }

  try {
    const { text } = await extractText({ url, base64 });
    if (!text) {
      res.status(422).json({ error: "Could not extract text from PDF" });
      return;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a precise data extraction engine. Extract only the requested fields. Return null for fields not found.",
        },
        {
          role: "user",
          content: `Extract these fields from the document and return as JSON:
${JSON.stringify(schema, null, 2)}

For each field, the value type hint is given. Return null if the field is not present in the document.

Document text:
${text.slice(0, 8000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      extracted = {};
    }

    const confidence: Record<string, number> = {};
    for (const field of Object.keys(schema)) {
      confidence[field] = extracted[field] !== null && extracted[field] !== undefined ? 0.9 : 0.0;
    }

    res.json({ extracted, confidence, fieldsRequested: Object.keys(schema).length, fieldsFound: Object.values(extracted).filter((v) => v !== null).length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    res.status(500).json({ error: msg });
  }
});

router.post("/pdf/classify", authenticate, async (req, res): Promise<void> => {
  const { url, base64 } = req.body as { url?: string; base64?: string };

  if (!url && !base64) {
    res.status(400).json({ error: "Provide url or base64 field" });
    return;
  }

  try {
    const { text, numPages } = await extractText({ url, base64 });

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Classify the document type and return JSON only.",
        },
        {
          role: "user",
          content: `Classify this document. Return JSON:
{
  "documentType": "invoice|contract|resume|report|proposal|policy|financial|technical|marketing|research|compliance|hr|other",
  "confidence": 0.95,
  "alternativeTypes": ["list", "of", "other", "possible", "types"],
  "reasoning": "brief explanation"
}

Document text (first 2000 chars):
${text.slice(0, 2000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let classification: Record<string, unknown>;
    try {
      classification = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      classification = { documentType: "other", confidence: 0.5 };
    }

    const docType = String(classification.documentType || "other");
    const routing = DIRECTOR_ROUTING[docType] || DIRECTOR_ROUTING.other;

    res.json({ ...classification, numPages, directorRouting: routing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Classification failed";
    res.status(500).json({ error: msg });
  }
});

router.post("/pdf/batch", authenticate, async (req, res): Promise<void> => {
  const { urls, depth = "standard" } = req.body as { urls: string[]; depth?: "standard" | "deep" };

  if (!Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: "urls array is required" });
    return;
  }
  if (urls.length > 20) {
    res.status(400).json({ error: "Maximum 20 PDFs per batch request" });
    return;
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const { text, numPages, info } = await extractText({ url });
      const analysis = await llmAnalyze(text, depth as "standard" | "deep");
      const docType = String(analysis.documentType || "other");
      return {
        url,
        ...analysis,
        metadata: { numPages, info, characterCount: text.length },
        directorRouting: DIRECTOR_ROUTING[docType] || DIRECTOR_ROUTING.other,
        analyzedAt: new Date().toISOString(),
      };
    })
  );

  const output = results.map((r, i) =>
    r.status === "fulfilled"
      ? { url: urls[i], status: "success", ...r.value }
      : { url: urls[i], status: "error", error: r.reason instanceof Error ? r.reason.message : "Failed" }
  );

  const succeeded = output.filter((r) => r.status === "success").length;
  res.json({ total: urls.length, succeeded, failed: urls.length - succeeded, results: output });
});

router.get("/pdf/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "GalaxyPDF Intelligence Suite",
    version: "1.0.0",
    capabilities: ["analyze", "extract", "classify", "batch"],
    cacheSize: ANALYSIS_CACHE.size,
    models: { standard: "gpt-5-mini", deep: "gpt-4o" },
  });
});

export default router;
