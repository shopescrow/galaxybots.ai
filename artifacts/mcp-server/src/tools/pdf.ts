import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "";

async function callPdfApi(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(INTERNAL_SECRET ? { Authorization: `Bearer ${INTERNAL_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GalaxyPDF API error (${res.status}): ${err}`);
  }
  return res.json();
}

export function registerPdfTools(server: McpServer): void {
  server.tool(
    "analyze_pdf",
    "Analyze a PDF document from a public URL using GalaxyBots AI intelligence. Returns document type, summary, key insights, action items, extracted entities (people/organizations/dates/amounts/locations), risk flags, sentiment, and a recommended GalaxyBots director to handle the document. Supports standard (fast) and deep (thorough) analysis modes.",
    {
      url: z.string().url().describe("Public HTTPS URL of the PDF document to analyze"),
      depth: z
        .enum(["standard", "deep"])
        .optional()
        .default("standard")
        .describe("Analysis depth: standard (faster, gpt-4o-mini) or deep (thorough, gpt-4o)"),
    },
    async ({ url, depth }) => {
      console.log(`[MCP] analyze_pdf: url="${url}", depth=${depth}`);
      try {
        const result = await callPdfApi("pdf/analyze", { url, depth });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PDF analysis failed";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  server.tool(
    "extract_pdf_data",
    "Extract specific structured fields from a PDF document. Provide a schema describing the fields to extract (e.g. invoice_number, total_amount, due_date, party_name). Returns extracted values as structured JSON with field-level confidence scores. Ideal for automating data entry from invoices, contracts, purchase orders, and forms.",
    {
      url: z.string().url().describe("Public HTTPS URL of the PDF document"),
      schema: z
        .record(z.string())
        .describe(
          'Fields to extract. Key = field name, value = type hint. Example: {"invoice_number":"string","total_amount":"number","due_date":"date","vendor_name":"string"}'
        ),
    },
    async ({ url, schema }) => {
      console.log(`[MCP] extract_pdf_data: url="${url}", fields=${Object.keys(schema).join(",")}`);
      try {
        const result = await callPdfApi("pdf/extract", { url, schema });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PDF extraction failed";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  server.tool(
    "classify_pdf_document",
    "Quickly classify a PDF document by type and get a director routing recommendation. Returns document type (invoice, contract, resume, report, proposal, policy, financial, technical, marketing, research, compliance, hr, or other), confidence score, reasoning, and the recommended GalaxyBots director to handle the document. Use this before analyze_pdf when you only need classification.",
    {
      url: z.string().url().describe("Public HTTPS URL of the PDF document"),
    },
    async ({ url }) => {
      console.log(`[MCP] classify_pdf_document: url="${url}"`);
      try {
        const result = await callPdfApi("pdf/classify", { url });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PDF classification failed";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );

  server.tool(
    "batch_analyze_pdfs",
    "Analyze multiple PDF documents at once (up to 20). Each PDF is classified, summarized, and intelligence-extracted in parallel. Returns an array of analysis results with success/error status per document. Useful for processing document collections, due diligence packages, or compliance bundles.",
    {
      urls: z
        .array(z.string().url())
        .min(1)
        .max(20)
        .describe("Array of public HTTPS PDF URLs to analyze (max 20)"),
      depth: z
        .enum(["standard", "deep"])
        .optional()
        .default("standard")
        .describe("Analysis depth for all documents in the batch"),
    },
    async ({ urls, depth }) => {
      console.log(`[MCP] batch_analyze_pdfs: ${urls.length} PDFs, depth=${depth}`);
      try {
        const result = await callPdfApi("pdf/batch", { urls, depth });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Batch PDF analysis failed";
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }] };
      }
    }
  );
}
