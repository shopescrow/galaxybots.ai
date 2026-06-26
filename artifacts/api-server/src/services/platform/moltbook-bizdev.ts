/**
 * Moltbook business-development layer (Task #207, Phase 2).
 *
 * Gives eligible Moltbook agents a FIXED, owner-approved cross-product catalog
 * to reference in conversation, and turns genuine interest signals observed in
 * the feed into product-tagged leads in the existing prospecting Review Queue
 * (`prospects` with `source = "moltbook"`, `status = "review_needed"`).
 *
 * Hard boundaries (enforced here):
 *  - The catalog is a constant. Agents never invent products, prices or terms.
 *  - Agents NEVER close deals or take payments autonomously — interest only ever
 *    produces a human-reviewed lead. No autonomous commercial commitments.
 *  - Leads are de-duplicated per counterparty handle so a chatty thread cannot
 *    spam the Review Queue.
 */

import { db, prospectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type MoltbookProductTag = "pirate_monster" | "galaxybots" | "kilopro";

export interface MoltbookCatalogEntry {
  productTag: MoltbookProductTag;
  name: string;
  /** One-line, brand-safe value proposition the agent may reference. */
  pitch: string;
  /** Lower-cased keywords that, when seen in a thread, indicate this product fits. */
  signals: string[];
  /** Relative priority when more than one product matches (higher wins). */
  priority: number;
}

/**
 * The approved cross-product catalog. PirateMonster (AEO) and GalaxyBots
 * (AI workforce) lead; KiloPro is only surfaced when the conversation is
 * explicitly about secure/compliant infrastructure.
 */
export const MOLTBOOK_PRODUCT_CATALOG: readonly MoltbookCatalogEntry[] = [
  {
    productTag: "pirate_monster",
    name: "PirateMonster",
    pitch:
      "PirateMonster makes your brand the answer AI engines cite — Answer Engine Optimization (AEO/GEO) so you show up in ChatGPT, Perplexity and AI search.",
    signals: [
      "aeo",
      "geo",
      "answer engine",
      "ai search",
      "ai visibility",
      "llm ranking",
      "citation",
      "cited",
      "chatgpt",
      "perplexity",
      "search visibility",
      "show up in ai",
      "generative engine",
    ],
    priority: 30,
  },
  {
    productTag: "galaxybots",
    name: "GalaxyBots",
    pitch:
      "GalaxyBots gives you an AI workforce — specialist AI agents that handle marketing, sales and ops so your team scales without headcount.",
    signals: [
      "ai workforce",
      "ai agent",
      "ai agents",
      "ai employee",
      "ai team",
      "automate",
      "automation",
      "delegate",
      "hire an ai",
      "virtual assistant",
      "scale my team",
      "do the work",
    ],
    priority: 25,
  },
  {
    productTag: "kilopro",
    name: "KiloPro",
    pitch:
      "KiloPro is the secure, compliant backbone for AI operations — built for teams with strict security, audit and data-governance requirements.",
    signals: [
      "soc 2",
      "soc2",
      "iso 27001",
      "hipaa",
      "gdpr",
      "compliance",
      "compliant",
      "security review",
      "data governance",
      "audit log",
      "on-prem",
      "enterprise security",
    ],
    priority: 20,
  },
] as const;

/** Generic phrases that signal a human is expressing buying/engagement intent. */
const INTEREST_PHRASES: readonly string[] = [
  "interested",
  "how much",
  "pricing",
  "price",
  "cost",
  "quote",
  "demo",
  "trial",
  "sign up",
  "get started",
  "looking for",
  "need help",
  "any recommendations",
  "recommend",
  "who can help",
  "anyone know",
  "how do i",
  "can you help",
  "want to",
  "we need",
  "i need",
  "solution for",
];

export interface InterestSignal {
  interested: boolean;
  productTag: MoltbookProductTag;
  /** Catalog entry chosen for the lead. */
  catalog: MoltbookCatalogEntry;
  /** A short, human-readable summary of what the counterparty seems to need. */
  expressedNeed: string;
}

/**
 * Inspect a (already-sanitized) feed item's text for a genuine interest signal.
 * Returns null when there's no actionable signal. When several products match,
 * the highest-priority catalog entry wins; PirateMonster is the default tag for
 * a generic interest signal with no product-specific keywords.
 */
export function detectInterestSignal(text: string | undefined | null): InterestSignal | null {
  if (!text) return null;
  const haystack = text.toLowerCase();

  const hasInterest = INTEREST_PHRASES.some((p) => haystack.includes(p));
  const matches = MOLTBOOK_PRODUCT_CATALOG.filter((entry) =>
    entry.signals.some((s) => haystack.includes(s)),
  );

  // No actionable signal at all.
  if (!hasInterest && matches.length === 0) return null;

  // Pick the best-fitting product; default to the PirateMonster (AEO)-led entry.
  const best =
    matches.length > 0
      ? matches.reduce((a, b) => (b.priority > a.priority ? b : a))
      : MOLTBOOK_PRODUCT_CATALOG.find((e) => e.productTag === "pirate_monster")!;

  // Require either an explicit interest phrase OR a strong product-specific
  // keyword match before we treat it as a lead (avoids passing chatter).
  if (!hasInterest && matches.length === 0) return null;

  const expressedNeed = text.replace(/\s+/g, " ").trim().slice(0, 500);
  return { interested: true, productTag: best.productTag, catalog: best, expressedNeed };
}

export interface CreateMoltbookLeadParams {
  /** The agent (bot) that surfaced the lead. */
  botId: number;
  /** The Moltbook handle of the interested counterparty. */
  counterpartyHandle: string;
  /** Permalink / URL of the thread where interest was expressed. */
  contextUrl?: string | null;
  /** Short summary of the expressed need. */
  expressedNeed: string;
  productTag: MoltbookProductTag;
  /** Owning client, when the agent belongs to a tenant; null for first-party. */
  clientId?: number | null;
}

export interface CreateMoltbookLeadResult {
  created: boolean;
  prospectId?: number;
  /** Set when the lead was skipped because an open one already exists. */
  deduped?: boolean;
}

/**
 * Create a product-tagged lead in the existing prospecting Review Queue. Reuses
 * the `prospects` table (source = "moltbook", status = "review_needed"). Never
 * creates a deal or charge — this is a human-review hand-off only.
 */
export async function createMoltbookLead(
  params: CreateMoltbookLeadParams,
): Promise<CreateMoltbookLeadResult> {
  const handle = params.counterpartyHandle.trim();
  if (!handle) return { created: false };

  // De-dupe: don't re-file a counterparty that already has an open Moltbook lead.
  const existing = await db
    .select({ id: prospectsTable.id })
    .from(prospectsTable)
    .where(
      and(
        eq(prospectsTable.source, "moltbook"),
        eq(prospectsTable.counterpartyHandle, handle),
        eq(prospectsTable.status, "review_needed"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { created: false, deduped: true, prospectId: existing[0].id };
  }

  const [lead] = await db
    .insert(prospectsTable)
    .values({
      clientId: params.clientId ?? null,
      companyName: handle,
      sourceUrl: params.contextUrl ?? "https://www.moltbook.com",
      source: "moltbook",
      status: "review_needed",
      productTag: params.productTag,
      counterpartyHandle: handle,
      contextUrl: params.contextUrl ?? null,
      expressedNeed: params.expressedNeed.slice(0, 1000),
      confidenceScore: 0.5,
      extractionNotes: `Lead captured by Moltbook agent (bot #${params.botId}).`,
    })
    .returning({ id: prospectsTable.id });

  return { created: true, prospectId: lead.id };
}
