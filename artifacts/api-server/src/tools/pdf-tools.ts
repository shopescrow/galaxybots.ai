import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { openai } from "@workspace/integrations-openai-ai-server";
import { PDFParse } from "pdf-parse";

async function fetchAndParse(url: string): Promise<{ text: string; numPages: number }> {
  const res = await fetch(url, { headers: { "User-Agent": "GalaxyBots-PDF/1.0" } });
  if (!res.ok) throw new Error(`Cannot fetch PDF: HTTP ${res.status} from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const textResult = await parser.getText();
  return { text: textResult.text?.trim() || "", numPages: textResult.total || 0 };
}

registerTool({
  name: "analyze_pdf",
  description:
    "Analyze a PDF document from a public URL using AI. Returns a full intelligence report: document type, summary, key insights, action items, entities (people/orgs/dates/amounts), risk flags, and the recommended GalaxyBots director to handle it. Use this when a client shares a contract, invoice, report, or any document that needs expert review.",
  inputSchema: z.object({
    url: z.string().url().describe("Public URL of the PDF to analyze"),
    depth: z
      .enum(["standard", "deep"])
      .optional()
      .default("standard")
      .describe("Analysis depth — standard is faster (gpt-4o-mini), deep is thorough (gpt-4o)"),
  }),
  execute: async (input, _ctx: ToolContext) => {
    const { text, numPages } = await fetchAndParse(input.url);
    if (!text) return { error: "No extractable text — PDF may be scanned/image-only" };

    const model = input.depth === "deep" ? "gpt-4o" : "gpt-4o-mini";
    const truncated = text.slice(0, input.depth === "deep" ? 12000 : 6000);

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are GalaxyPDF Intelligence. Analyze documents and return structured JSON intelligence reports.",
        },
        {
          role: "user",
          content: `Analyze this document and return JSON with:
documentType (invoice|contract|resume|report|proposal|policy|financial|technical|marketing|research|compliance|hr|other),
title, summary (2-4 sentences), keyInsights (array), actionItems (array), 
entities {people, organizations, dates, amounts, locations},
riskFlags (array of risk concerns), sentiment (positive|neutral|negative|mixed), confidenceScore (0-1)

Document (${numPages} pages):
${truncated}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let analysis: Record<string, unknown>;
    try { analysis = JSON.parse(raw) as Record<string, unknown>; } catch { analysis = { summary: raw }; }

    const ROUTING: Record<string, string> = {
      invoice: "Penny Ledger (CFO)", contract: "Vault Viper (CISO/Legal)",
      resume: "Ember Heart (CHRO)", report: "Optima Prime (CEO)",
      proposal: "Brand Blaze (CMO)", policy: "Vault Viper (CISO)",
      financial: "Penny Ledger (CFO)", technical: "Neural Nexus (CTO)",
      marketing: "Brand Blaze (CMO)", research: "Optima Prime (CEO)",
      compliance: "Vault Viper (CISO)", hr: "Ember Heart (CHRO)", other: "Optima Prime (CEO)",
    };

    const docType = String(analysis.documentType || "other");
    return { ...analysis, numPages, recommendedDirector: ROUTING[docType] || ROUTING.other, analyzedUrl: input.url };
  },
});

registerTool({
  name: "extract_pdf_data",
  description:
    "Extract specific structured fields from a PDF document using AI. Provide a schema describing what to extract (e.g. invoice number, total amount, due date, party names). Returns the extracted values as structured data with confidence scores. Ideal for automating data entry from invoices, contracts, forms, and reports.",
  inputSchema: z.object({
    url: z.string().url().describe("Public URL of the PDF"),
    schema: z
      .record(z.string())
      .describe(
        'Fields to extract as key-value pairs. Key = field name, value = type hint. E.g. {"invoice_number":"string","total_amount":"number","due_date":"date"}'
      ),
  }),
  execute: async (input, _ctx: ToolContext) => {
    const { text } = await fetchAndParse(input.url);
    if (!text) return { error: "No extractable text — PDF may be scanned/image-only" };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract the requested fields and return JSON only. Use null for fields not found." },
        {
          role: "user",
          content: `Extract these fields from the document:
${JSON.stringify(input.schema, null, 2)}

Document:
${text.slice(0, 8000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let extracted: Record<string, unknown>;
    try { extracted = JSON.parse(raw) as Record<string, unknown>; } catch { extracted = {}; }

    const fieldsFound = Object.values(extracted).filter((v) => v !== null && v !== undefined).length;
    return { extracted, fieldsRequested: Object.keys(input.schema).length, fieldsFound };
  },
});

registerTool({
  name: "classify_pdf_document",
  description:
    "Quickly classify a PDF document type and get a director routing recommendation. Faster and lighter than full analysis — use this when you only need to know what kind of document it is and which director should handle it.",
  inputSchema: z.object({
    url: z.string().url().describe("Public URL of the PDF"),
  }),
  execute: async (input, _ctx: ToolContext) => {
    const { text, numPages } = await fetchAndParse(input.url);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Classify the document type and return JSON only." },
        {
          role: "user",
          content: `Classify this document:
{"documentType":"invoice|contract|resume|report|proposal|policy|financial|technical|marketing|research|compliance|hr|other","confidence":0.95,"reasoning":"brief explanation"}

Text:
${text.slice(0, 2000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let result: Record<string, unknown>;
    try { result = JSON.parse(raw) as Record<string, unknown>; } catch { result = { documentType: "other", confidence: 0.5 }; }

    const ROUTING: Record<string, string> = {
      invoice: "Penny Ledger (CFO)", contract: "Vault Viper (CISO/Legal)",
      resume: "Ember Heart (CHRO)", report: "Optima Prime (CEO)",
      proposal: "Brand Blaze (CMO)", financial: "Penny Ledger (CFO)",
      technical: "Neural Nexus (CTO)", marketing: "Brand Blaze (CMO)",
      compliance: "Vault Viper (CISO)", hr: "Ember Heart (CHRO)", other: "Optima Prime (CEO)",
    };

    const docType = String(result.documentType || "other");
    return { ...result, numPages, recommendedDirector: ROUTING[docType] || ROUTING.other };
  },
});
