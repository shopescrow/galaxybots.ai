import {
  db,
  assetsTable,
  assetFilesTable,
  assetListingsTable,
  type AssetStatusEvent,
} from "@workspace/db";
import {
  selectModelForTask,
  recordModelSelection,
  recordModelOutcome,
  estimateDifficultyFromInput,
} from "../ai-safety/model-router";
import { callWithFallback, ModelTier } from "../ai-safety/model-fallback";
import { estimateCost } from "../analytics/llm-usage";
import { ObjectStorageService } from "../../lib/objectStorage";

/**
 * Document-asset creator engine (task #262).
 *
 * Turns a niche brief into a print-ready, deliverable document asset —
 * hyper-niche printables/planners, curated prompt packs, or short e-books —
 * plus marketplace listing copy. Every produced asset lands in the Asset Studio
 * at the `in_review` stage with its PDF attached, so it always passes through
 * the existing human approval gate before it can be published.
 *
 * Generation routes through the standard safe path: `selectModelForTask` picks
 * the model (honoring per-bot policy, cost-relief, and difficulty routing) and
 * `callWithFallback` executes it (circuit breakers, fallback chains, usage
 * logging). Outcomes feed back into the bandit via `recordModelOutcome`.
 */

const objectStorage = new ObjectStorageService();

export const DOCUMENT_ASSET_KINDS = ["printable", "prompt_pack", "ebook"] as const;
export type DocumentAssetKind = (typeof DOCUMENT_ASSET_KINDS)[number];

export interface DocumentAssetBrief {
  kind: DocumentAssetKind;
  /** The hyper-niche this targets, e.g. "ADHD daily planner for remote workers". */
  niche: string;
  /** Optional explicit title; otherwise the model proposes one. */
  title?: string;
  audience?: string;
  tone?: string;
  /** Page hint for printables/e-books. */
  pageCount?: number;
  /** Prompt count hint for prompt packs. */
  promptCount?: number;
  /** Where it will be listed, e.g. Etsy, Gumroad, KDP. */
  targetPlatform?: string;
  notes?: string;
}

export interface ListingCopy {
  title: string;
  tags: string[];
  description: string;
  suggestedPriceUsd: number;
}

export interface ProduceContext {
  clientId: number;
  botId?: number;
  managerBotId?: number;
  sessionId?: number;
  /** Audit label for status-history events, e.g. "bot:Document Creator" or "user:7". */
  changedBy: string;
}

export interface ProduceResult {
  assetId: number;
  title: string;
  status: string;
  kind: DocumentAssetKind;
  fileName: string;
  fileId: number;
  listing: ListingCopy;
}

// ── LLM helper ──────────────────────────────────────────────────────────────
interface GenContext {
  clientId?: number;
  botId?: number;
  sessionId?: number;
}

async function runLlm(opts: {
  ctx: GenContext;
  taskCategory: string;
  system: string;
  user: string;
  tier?: ModelTier;
  fallbackModel?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const fallbackModel = opts.fallbackModel ?? "gpt-4o";
  const fallbackTier = opts.tier ?? ModelTier.FRONTIER;
  const difficultyScore = estimateDifficultyFromInput(
    Math.ceil((opts.system.length + opts.user.length) / 4),
  );

  const decision = await selectModelForTask({
    taskCategory: opts.taskCategory,
    clientId: opts.ctx.clientId,
    botId: opts.ctx.botId,
    difficultyScore,
    fallbackModel,
    fallbackTier,
  });

  const telemetryId = await recordModelSelection({
    clientId: opts.ctx.clientId,
    botId: opts.ctx.botId,
    sessionId: opts.ctx.sessionId,
    taskCategory: opts.taskCategory,
    model: decision.model,
    modelTier: decision.tier,
    difficultyBucket: decision.difficultyBucket,
    selectionMode: decision.mode,
  });

  const start = Date.now();
  try {
    const res = await callWithFallback({
      model: decision.model,
      preferredTier: decision.tier,
      temperature: opts.temperature ?? 0.6,
      maxCompletionTokens: opts.maxTokens ?? 3500,
      clientId: opts.ctx.clientId,
      botId: opts.ctx.botId,
      sessionId: opts.ctx.sessionId,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    const content = res.completion.choices?.[0]?.message?.content ?? "";
    const promptTokens = res.completion.usage?.prompt_tokens ?? 0;
    const completionTokens = res.completion.usage?.completion_tokens ?? 0;
    await recordModelOutcome(telemetryId, {
      quality: content.trim().length > 0 ? 0.85 : 0.3,
      costUsd: estimateCost(res.model, promptTokens, completionTokens),
      latencyMs: Date.now() - start,
      taskDifficulty: difficultyScore,
    });
    return content;
  } catch (err) {
    await recordModelOutcome(telemetryId, {
      quality: 0,
      costUsd: 0,
      latencyMs: Date.now() - start,
    });
    throw err;
  }
}

function extractJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    }
    throw new Error("Model did not return valid JSON content");
  }
}

// ── Content shapes ───────────────────────────────────────────────────────────
interface PrintablePage {
  heading: string;
  kind?: "checklist" | "schedule" | "tracker" | "notes" | "prompts" | "list";
  intro?: string;
  items: string[];
}
interface PrintableContent {
  title: string;
  subtitle?: string;
  intro?: string;
  pages: PrintablePage[];
}

interface PromptCategory {
  name: string;
  prompts: string[];
}
interface PromptPackContent {
  title: string;
  subtitle?: string;
  intro?: string;
  categories: PromptCategory[];
}

interface EbookChapter {
  heading: string;
  paragraphs: string[];
  keyTakeaways?: string[];
}
interface EbookContent {
  title: string;
  subtitle?: string;
  intro?: string;
  chapters: EbookChapter[];
}

// ── Generators ───────────────────────────────────────────────────────────────
async function generatePrintable(
  brief: DocumentAssetBrief,
  ctx: GenContext,
): Promise<PrintableContent> {
  const pages = Math.min(Math.max(brief.pageCount ?? 8, 3), 20);
  const raw = await runLlm({
    ctx,
    taskCategory: "document_asset_printable",
    system:
      "You are a best-selling designer of hyper-niche printables and planners sold on Etsy and Gumroad. " +
      "You design practical, beautifully structured, immediately usable print-ready documents. " +
      "Respond ONLY with JSON.",
    user: `Design a print-ready printable/planner for this niche brief.

Niche: ${brief.niche}
${brief.title ? `Preferred title: ${brief.title}` : ""}
${brief.audience ? `Audience: ${brief.audience}` : ""}
${brief.tone ? `Tone: ${brief.tone}` : ""}
${brief.notes ? `Notes: ${brief.notes}` : ""}

Produce roughly ${pages} content pages. Return JSON of shape:
{
  "title": string,
  "subtitle": string,
  "intro": string,
  "pages": [
    { "heading": string, "kind": "checklist"|"schedule"|"tracker"|"notes"|"prompts"|"list", "intro": string, "items": string[] }
  ]
}
Each page must have 5-12 concrete, fillable items tailored to the niche. Make it genuinely useful, not generic.`,
    maxTokens: 4000,
  });
  return extractJson<PrintableContent>(raw);
}

async function generatePromptPack(
  brief: DocumentAssetBrief,
  ctx: GenContext,
): Promise<PromptPackContent> {
  const count = Math.min(Math.max(brief.promptCount ?? 100, 20), 250);
  const raw = await runLlm({
    ctx,
    taskCategory: "document_asset_prompt_pack",
    system:
      "You are an expert prompt engineer who curates premium, deduplicated prompt packs sold to professionals. " +
      "Every prompt must be specific, copy-paste ready, and distinct. Respond ONLY with JSON.",
    user: `Create a curated prompt pack of about ${count} prompts for this niche.

Niche: ${brief.niche}
${brief.audience ? `Audience: ${brief.audience}` : ""}
${brief.notes ? `Notes: ${brief.notes}` : ""}

Group prompts into 5-10 themed categories. Return JSON of shape:
{
  "title": string,
  "subtitle": string,
  "intro": string,
  "categories": [ { "name": string, "prompts": string[] } ]
}
Prompts must be unique across the whole pack (no near-duplicates) and written as ready-to-use instructions.`,
    maxTokens: 4000,
  });
  const parsed = extractJson<PromptPackContent>(raw);
  return dedupePromptPack(parsed);
}

async function generateEbook(
  brief: DocumentAssetBrief,
  ctx: GenContext,
): Promise<EbookContent> {
  const chapters = Math.min(Math.max(brief.pageCount ?? 6, 3), 12);
  const raw = await runLlm({
    ctx,
    taskCategory: "document_asset_ebook",
    system:
      "You are a non-fiction author who writes concise, high-value niche guides and short e-books. " +
      "You write substantive, specific, well-structured prose — not filler. Respond ONLY with JSON.",
    user: `Write a short, high-value e-book/guide for this niche brief.

Niche: ${brief.niche}
${brief.title ? `Preferred title: ${brief.title}` : ""}
${brief.audience ? `Audience: ${brief.audience}` : ""}
${brief.tone ? `Tone: ${brief.tone}` : ""}
${brief.notes ? `Notes: ${brief.notes}` : ""}

Produce about ${chapters} chapters. Return JSON of shape:
{
  "title": string,
  "subtitle": string,
  "intro": string,
  "chapters": [ { "heading": string, "paragraphs": string[], "keyTakeaways": string[] } ]
}
Each chapter should have 3-6 substantive paragraphs and 2-4 key takeaways. Be concrete and actionable.`,
    maxTokens: 5000,
  });
  return extractJson<EbookContent>(raw);
}

function dedupePromptPack(pack: PromptPackContent): PromptPackContent {
  const seen = new Set<string>();
  const categories: PromptCategory[] = [];
  for (const cat of pack.categories ?? []) {
    const prompts: string[] = [];
    for (const p of cat.prompts ?? []) {
      const norm = p.trim().toLowerCase().replace(/\s+/g, " ");
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      prompts.push(p.trim());
    }
    if (prompts.length > 0) categories.push({ name: cat.name, prompts });
  }
  return { ...pack, categories };
}

async function generateListingCopy(
  brief: DocumentAssetBrief,
  title: string,
  ctx: GenContext,
): Promise<ListingCopy> {
  const raw = await runLlm({
    ctx,
    taskCategory: "document_asset_listing",
    system:
      "You are a marketplace listing copywriter optimizing for Etsy/Gumroad/KDP search and conversion. " +
      "Respond ONLY with JSON.",
    tier: ModelTier.EFFICIENT,
    fallbackModel: "gpt-5-mini",
    temperature: 0.5,
    user: `Write marketplace listing metadata for this digital product.

Product title: ${title}
Type: ${brief.kind}
Niche: ${brief.niche}
${brief.targetPlatform ? `Platform: ${brief.targetPlatform}` : ""}

Return JSON of shape:
{
  "title": string,        // <= 140 chars, keyword-rich
  "tags": string[],       // 8-13 search tags
  "description": string,  // 2-4 short paragraphs, benefit-led
  "suggestedPriceUsd": number
}`,
    maxTokens: 900,
  });
  const parsed = extractJson<Partial<ListingCopy>>(raw);
  return {
    title: parsed.title?.trim() || title,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 13) : [],
    description: parsed.description?.trim() || "",
    suggestedPriceUsd:
      typeof parsed.suggestedPriceUsd === "number" && isFinite(parsed.suggestedPriceUsd)
        ? Math.round(parsed.suggestedPriceUsd * 100) / 100
        : 0,
  };
}

// ── HTML rendering (print-ready A4) ──────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a2e; margin: 0; }
  .page { padding: 56px 60px; min-height: 100vh; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .cover { display: flex; flex-direction: column; justify-content: center; min-height: 100vh; padding: 80px 70px; background: linear-gradient(160deg,#f5f3ff,#ffffff 55%); border-left: 10px solid #7c3aed; }
  .cover h1 { font-size: 42px; line-height: 1.1; margin: 0 0 16px; letter-spacing: -0.5px; }
  .cover .sub { font-size: 18px; color: #6b7280; margin-bottom: 28px; }
  .cover .intro { font-size: 14px; color: #374151; max-width: 460px; line-height: 1.6; }
  .cover .brand { margin-top: 48px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #7c3aed; font-family: -apple-system,"Segoe UI",sans-serif; }
  h2 { font-size: 24px; border-bottom: 3px solid #7c3aed; padding-bottom: 8px; margin: 0 0 18px; }
  h3 { font-size: 15px; color: #7c3aed; text-transform: uppercase; letter-spacing: 1px; font-family: -apple-system,"Segoe UI",sans-serif; margin: 22px 0 8px; }
  p { line-height: 1.65; font-size: 13px; }
  .lead { color: #4b5563; font-size: 13px; margin-bottom: 18px; }
  ol, ul { padding-left: 22px; }
  li { margin: 8px 0; line-height: 1.5; font-size: 13px; }
  .check { list-style: none; padding: 0; }
  .check li { display: flex; align-items: flex-start; gap: 10px; border-bottom: 1px dashed #d1d5db; padding: 10px 0; }
  .check li::before { content: ""; display: inline-block; width: 16px; height: 16px; border: 2px solid #7c3aed; border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
  .lines li { list-style: none; border-bottom: 1px solid #e5e7eb; padding: 14px 0; }
  .takeaways { background: #f5f3ff; border-radius: 10px; padding: 14px 18px; margin-top: 14px; }
  .takeaways h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6d28d9; font-family: -apple-system,"Segoe UI",sans-serif; }
  .prompt { border-left: 3px solid #c4b5fd; padding: 6px 0 6px 14px; margin: 12px 0; font-size: 12.5px; color: #1f2937; }
  .prompt .n { color: #7c3aed; font-weight: 700; margin-right: 6px; font-family: -apple-system,"Segoe UI",sans-serif; }
  .toc li { font-size: 13px; }
  .footer-brand { font-family: -apple-system,"Segoe UI",sans-serif; font-size: 10px; color: #9ca3af; text-align: center; margin-top: 28px; }
`;

function coverHtml(title: string, subtitle: string | undefined, intro: string | undefined): string {
  return `<section class="cover">
    <h1>${esc(title)}</h1>
    ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
    ${intro ? `<div class="intro">${esc(intro)}</div>` : ""}
    <div class="brand">Made with GalaxyBots.ai</div>
  </section>`;
}

function renderPrintableHtml(c: PrintableContent): string {
  const pages = (c.pages ?? [])
    .map((p) => {
      const checklist = p.kind === "checklist" || p.kind === "tracker";
      const lines = p.kind === "notes" || p.kind === "schedule";
      const cls = checklist ? "check" : lines ? "lines" : "";
      const items = (p.items ?? []).map((it) => `<li>${esc(it)}</li>`).join("");
      return `<section class="page">
        <h2>${esc(p.heading)}</h2>
        ${p.intro ? `<p class="lead">${esc(p.intro)}</p>` : ""}
        <ul class="${cls}">${items}</ul>
      </section>`;
    })
    .join("");
  return wrapHtml(c.title, coverHtml(c.title, c.subtitle, c.intro) + pages);
}

function renderPromptPackHtml(c: PromptPackContent): string {
  let counter = 0;
  const sections = (c.categories ?? [])
    .map((cat) => {
      const prompts = (cat.prompts ?? [])
        .map((p) => `<div class="prompt"><span class="n">${++counter}.</span>${esc(p)}</div>`)
        .join("");
      return `<section class="page"><h2>${esc(cat.name)}</h2>${prompts}</section>`;
    })
    .join("");
  return wrapHtml(c.title, coverHtml(c.title, c.subtitle, c.intro) + sections);
}

function renderEbookHtml(c: EbookContent): string {
  const toc = `<section class="page">
    <h2>Contents</h2>
    <ol class="toc">${(c.chapters ?? []).map((ch) => `<li>${esc(ch.heading)}</li>`).join("")}</ol>
  </section>`;
  const chapters = (c.chapters ?? [])
    .map((ch) => {
      const paras = (ch.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("");
      const takeaways =
        ch.keyTakeaways && ch.keyTakeaways.length > 0
          ? `<div class="takeaways"><h4>Key Takeaways</h4><ul>${ch.keyTakeaways
              .map((t) => `<li>${esc(t)}</li>`)
              .join("")}</ul></div>`
          : "";
      return `<section class="page"><h2>${esc(ch.heading)}</h2>${paras}${takeaways}</section>`;
    })
    .join("");
  return wrapHtml(c.title, coverHtml(c.title, c.subtitle, c.intro) + toc + chapters);
}

function wrapHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(
    title,
  )}</title><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const pw = await import("playwright-core");
  const executablePath = process.env["REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"] || undefined;
  const browser = await pw.chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "document"
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
/**
 * Produce a complete document asset end-to-end: generate structured content,
 * render a print-ready PDF, store it in object storage, register the asset in
 * the Asset Studio with the file attached and listing copy, and submit it for
 * human review. Returns the created asset summary.
 */
export async function produceDocumentAsset(
  brief: DocumentAssetBrief,
  ctx: ProduceContext,
): Promise<ProduceResult> {
  if (!DOCUMENT_ASSET_KINDS.includes(brief.kind)) {
    throw new Error(`Unsupported document kind: ${brief.kind}`);
  }
  if (!brief.niche || !brief.niche.trim()) {
    throw new Error("A niche/brief is required");
  }

  const genCtx: GenContext = {
    clientId: ctx.clientId,
    botId: ctx.botId,
    sessionId: ctx.sessionId,
  };

  let title: string;
  let html: string;
  let assetType: string;

  if (brief.kind === "printable") {
    const content = await generatePrintable(brief, genCtx);
    title = brief.title?.trim() || content.title;
    html = renderPrintableHtml({ ...content, title });
    assetType = "printable";
  } else if (brief.kind === "prompt_pack") {
    const content = await generatePromptPack(brief, genCtx);
    title = brief.title?.trim() || content.title;
    html = renderPromptPackHtml({ ...content, title });
    assetType = "data";
  } else {
    const content = await generateEbook(brief, genCtx);
    title = brief.title?.trim() || content.title;
    html = renderEbookHtml({ ...content, title });
    assetType = "data";
  }

  const [pdf, listing] = await Promise.all([
    htmlToPdf(html),
    generateListingCopy(brief, title, genCtx),
  ]);

  const fileName = `${slugify(title)}.pdf`;
  const { objectPath, sizeBytes } = await objectStorage.uploadBuffer(
    pdf,
    `assets/${ctx.clientId}/documents`,
    "application/pdf",
  );

  // Produced assets always land at in_review — never published autonomously.
  const now = new Date().toISOString();
  const statusHistory: AssetStatusEvent[] = [
    { status: "idea", changedBy: ctx.changedBy, note: "brief received", at: now },
    { status: "draft", changedBy: ctx.changedBy, note: "content + PDF produced", at: now },
    { status: "in_review", changedBy: ctx.changedBy, note: "submitted for human review", at: now },
  ];

  const [asset] = await db
    .insert(assetsTable)
    .values({
      clientId: ctx.clientId,
      botId: ctx.botId ?? null,
      managerBotId: ctx.managerBotId ?? null,
      type: assetType,
      title,
      description: listing.description || brief.notes || null,
      niche: brief.niche,
      targetPlatform: brief.targetPlatform ?? null,
      status: "in_review",
      statusHistory,
      metadata: {
        documentKind: brief.kind,
        brief,
        listingCopy: listing,
      },
    })
    .returning();

  const [file] = await db
    .insert(assetFilesTable)
    .values({
      assetId: asset.id,
      clientId: ctx.clientId,
      kind: "pdf",
      fileName,
      objectPath,
      contentType: "application/pdf",
      sizeBytes,
    })
    .returning();

  // Seed a planned marketplace listing with the suggested price.
  await db.insert(assetListingsTable).values({
    assetId: asset.id,
    clientId: ctx.clientId,
    platform: brief.targetPlatform || "Etsy",
    listingStatus: "planned",
    price: listing.suggestedPriceUsd > 0 ? String(listing.suggestedPriceUsd) : null,
    currency: "USD",
  });

  return {
    assetId: asset.id,
    title,
    status: asset.status,
    kind: brief.kind,
    fileName,
    fileId: file.id,
    listing,
  };
}
