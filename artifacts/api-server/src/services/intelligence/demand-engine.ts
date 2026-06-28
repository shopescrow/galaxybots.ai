import {
  db,
  demandOpportunitiesTable,
  botsTable,
  type DemandEvidence,
  type DemandOpportunity,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

export const DEMAND_RESEARCH_BOT_NAME = "Demand Oracle";

/**
 * Blend a demand signal (0-100) against competition (0-100) into a single
 * opportunity score (0-100). High demand + low competition wins. We weight
 * demand at 60% and the inverse of competition at 40% so a strong but crowded
 * niche still ranks below a strong, open one.
 */
export function scoreOpportunity(
  demandScore: number,
  competitionScore: number,
): number {
  const demand = Math.max(0, Math.min(100, demandScore));
  const competition = Math.max(0, Math.min(100, competitionScore));
  const blended = demand * 0.6 + (100 - competition) * 0.4;
  return Math.round(blended * 10) / 10;
}

/**
 * Ensure the global demand-research bot persona exists in the roster. Bots are
 * global personas; clients receive assignments separately. Returns its id.
 */
export async function ensureDemandResearchBot(): Promise<number> {
  const [existing] = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(eq(botsTable.name, DEMAND_RESEARCH_BOT_NAME))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(botsTable)
    .values({
      name: DEMAND_RESEARCH_BOT_NAME,
      title: "Demand Intelligence Analyst",
      department: "Sales & Marketing",
      category: "Sales & Marketing",
      description:
        "Researches market demand vs. competition for niches and feeds the creator bots a prioritized creation queue, so effort flows to what people actually search for and buy.",
      responsibilities: [
        "Researches search, trend, and competition signals for a category",
        "Scores niche opportunities by demand vs. competition",
        "Maintains a ranked creation queue for the asset creator bots",
      ],
      personality:
        "Sharp, evidence-driven, and ruthlessly prioritizing. Never guesses — every recommendation is backed by signals.",
      rank: "analyst",
      isAvailable: true,
    })
    .returning({ id: botsTable.id });

  return created.id;
}

interface RawNicheIdea {
  niche: string;
  title: string;
  suggestedAngle: string;
  suggestedAssetType?: string;
  demandScore: number;
  competitionScore: number;
  evidence: DemandEvidence;
}

function normalizeEvidence(raw: unknown): DemandEvidence {
  const e = (raw ?? {}) as Partial<DemandEvidence>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    searchSignals: arr(e.searchSignals),
    trendSignals: arr(e.trendSignals),
    competitorExamples: arr(e.competitorExamples),
    sources: arr(e.sources),
  };
}

/**
 * Use the LLM to synthesize niche opportunities for a category from gathered
 * context. The caller provides any scraped/competitor context to ground it.
 */
async function generateNicheIdeas(
  category: string,
  groundingContext: string,
  count: number,
): Promise<RawNicheIdea[]> {
  const prompt = `You are a demand-intelligence analyst. For the category "${category}", identify ${count} niche content/product opportunities scored by DEMAND vs. COMPETITION.

${groundingContext ? `## Research context (scraped signals)\n${groundingContext}\n` : ""}
For each niche:
- demandScore (0-100): how much people search for / want this right now (consider seasonality and trends)
- competitionScore (0-100): how saturated the niche already is (higher = more crowded)
- a sharp suggested angle that differentiates from what already exists
- suggestedAssetType: one of printable, video, micro_saas, data, visual, web3, other
- evidence: concrete supporting signals

Respond with JSON:
{
  "opportunities": [
    {
      "niche": "specific niche",
      "title": "short opportunity title",
      "suggestedAngle": "the differentiated angle to take",
      "suggestedAssetType": "printable|video|micro_saas|data|visual|web3|other",
      "demandScore": 0-100,
      "competitionScore": 0-100,
      "evidence": {
        "searchSignals": ["..."],
        "trendSignals": ["..."],
        "competitorExamples": ["..."],
        "sources": ["..."]
      }
    }
  ]
}

Only return genuine opportunities grounded in the signals. Prefer high-demand, low-competition niches.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 2500,
      messages: [
        {
          role: "system",
          content:
            "You identify niche demand opportunities scored by demand vs competition. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const list: unknown[] = Array.isArray(parsed)
      ? parsed
      : (parsed.opportunities ?? []);
    return list
      .map((item): RawNicheIdea | null => {
        const o = item as Record<string, unknown>;
        if (typeof o.niche !== "string" || typeof o.title !== "string")
          return null;
        return {
          niche: o.niche,
          title: o.title,
          suggestedAngle:
            typeof o.suggestedAngle === "string" ? o.suggestedAngle : "",
          suggestedAssetType:
            typeof o.suggestedAssetType === "string"
              ? o.suggestedAssetType
              : undefined,
          demandScore: Number(o.demandScore) || 0,
          competitionScore: Number(o.competitionScore) || 0,
          evidence: normalizeEvidence(o.evidence),
        };
      })
      .filter((x): x is RawNicheIdea => x !== null)
      .slice(0, count);
  } catch (err) {
    console.error("[demand-engine] generateNicheIdeas failed:", err);
    return [];
  }
}

export interface ResearchResult {
  category: string;
  created: number;
  opportunities: DemandOpportunity[];
}

/**
 * Research demand for a category and persist scored, ranked opportunity records.
 */
export async function researchDemandForCategory(
  clientId: number,
  category: string,
  opts: { botId?: number; count?: number; groundingContext?: string } = {},
): Promise<ResearchResult> {
  const count = Math.max(1, Math.min(10, opts.count ?? 5));
  const botId = opts.botId ?? (await ensureDemandResearchBot());

  const ideas = await generateNicheIdeas(
    category,
    opts.groundingContext ?? "",
    count,
  );

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const created: DemandOpportunity[] = [];

  for (const idea of ideas) {
    const opportunityScore = scoreOpportunity(
      idea.demandScore,
      idea.competitionScore,
    );
    const [row] = await db
      .insert(demandOpportunitiesTable)
      .values({
        clientId,
        botId,
        category,
        niche: idea.niche,
        title: idea.title,
        suggestedAngle: idea.suggestedAngle,
        suggestedAssetType: idea.suggestedAssetType ?? null,
        demandScore: idea.demandScore,
        competitionScore: idea.competitionScore,
        opportunityScore,
        evidence: idea.evidence,
        status: "pending",
        expiresAt,
      })
      .returning();
    created.push(row);
  }

  await recomputeRanks(clientId);

  return { category, created: created.length, opportunities: created };
}

/**
 * Recompute the `rank` field across a client's live (non-rejected, non-produced)
 * opportunities. Pinned items always sort first, then by opportunity score.
 */
export async function recomputeRanks(clientId: number): Promise<void> {
  const live = await db
    .select()
    .from(demandOpportunitiesTable)
    .where(
      and(
        eq(demandOpportunitiesTable.clientId, clientId),
        inArray(demandOpportunitiesTable.status, [
          "pending",
          "queued",
          "approved",
        ]),
      ),
    );

  const ordered = [...live].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.opportunityScore - a.opportunityScore;
  });

  let rank = 1;
  for (const opp of ordered) {
    if (opp.rank !== rank) {
      await db
        .update(demandOpportunitiesTable)
        .set({ rank, updatedAt: new Date() })
        .where(eq(demandOpportunitiesTable.id, opp.id));
    }
    rank++;
  }
}

/**
 * The prioritized creation queue the asset creator bots pull from. Returns
 * approved (and pinned) opportunities first, then high-scoring pending ones.
 */
export async function getCreationQueue(
  clientId: number,
  opts: { category?: string; limit?: number; includePending?: boolean } = {},
): Promise<DemandOpportunity[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 25));
  const statuses: DemandOpportunity["status"][] = opts.includePending
    ? ["approved", "queued", "pending"]
    : ["approved", "queued"];

  const conditions = [
    eq(demandOpportunitiesTable.clientId, clientId),
    inArray(demandOpportunitiesTable.status, statuses),
  ];
  if (opts.category) {
    conditions.push(eq(demandOpportunitiesTable.category, opts.category));
  }

  return db
    .select()
    .from(demandOpportunitiesTable)
    .where(and(...conditions))
    .orderBy(
      desc(demandOpportunitiesTable.pinned),
      desc(demandOpportunitiesTable.opportunityScore),
    )
    .limit(limit);
}

export type ReviewAction = "approve" | "reject" | "pin" | "unpin" | "requeue";

export async function reviewOpportunity(
  clientId: number,
  opportunityId: number,
  action: ReviewAction,
  userId?: number,
): Promise<DemandOpportunity | null> {
  const [opp] = await db
    .select()
    .from(demandOpportunitiesTable)
    .where(
      and(
        eq(demandOpportunitiesTable.id, opportunityId),
        eq(demandOpportunitiesTable.clientId, clientId),
      ),
    );
  if (!opp) return null;

  const updates: Partial<typeof demandOpportunitiesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  switch (action) {
    case "approve":
      updates.status = "approved";
      updates.approvedAt = new Date();
      updates.approvedByUserId = userId ?? null;
      break;
    case "reject":
      updates.status = "rejected";
      updates.rejectedAt = new Date();
      updates.pinned = false;
      break;
    case "pin":
      updates.pinned = true;
      break;
    case "unpin":
      updates.pinned = false;
      break;
    case "requeue":
      updates.status = "pending";
      updates.rejectedAt = null;
      break;
  }

  const [updated] = await db
    .update(demandOpportunitiesTable)
    .set(updates)
    .where(eq(demandOpportunitiesTable.id, opportunityId))
    .returning();

  await recomputeRanks(clientId);
  return updated;
}

/**
 * Link a produced asset back to the opportunity it came from and mark it
 * produced. Returns the updated opportunity, or null if not found.
 */
export async function linkAssetToOpportunity(
  clientId: number,
  opportunityId: number,
  assetId: number,
): Promise<DemandOpportunity | null> {
  const [updated] = await db
    .update(demandOpportunitiesTable)
    .set({
      resultingAssetId: assetId,
      status: "produced",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(demandOpportunitiesTable.id, opportunityId),
        eq(demandOpportunitiesTable.clientId, clientId),
      ),
    )
    .returning();
  if (!updated) return null;
  await recomputeRanks(clientId);
  return updated;
}

/**
 * Re-score a client's live opportunities to reflect current/seasonal trends and
 * decay aging ones. Demand naturally cools as an opportunity ages without being
 * acted on; this keeps the queue fresh without paid vendors.
 */
export async function refreshOpportunityScores(clientId: number): Promise<{
  rescored: number;
  expired: number;
}> {
  const now = Date.now();
  const live = await db
    .select()
    .from(demandOpportunitiesTable)
    .where(
      and(
        eq(demandOpportunitiesTable.clientId, clientId),
        inArray(demandOpportunitiesTable.status, ["pending", "queued"]),
      ),
    );

  let rescored = 0;
  let expired = 0;

  for (const opp of live) {
    if (opp.expiresAt && new Date(opp.expiresAt).getTime() < now) {
      await db
        .update(demandOpportunitiesTable)
        .set({ status: "rejected", rejectedAt: new Date(), updatedAt: new Date() })
        .where(eq(demandOpportunitiesTable.id, opp.id));
      expired++;
      continue;
    }

    // Seasonal/trend decay: cool unacted demand slightly as it ages so fresh
    // research naturally rises to the top of the queue.
    const ageDays =
      (now - new Date(opp.detectedAt).getTime()) / (24 * 60 * 60 * 1000);
    const decayedDemand = Math.max(0, opp.demandScore - ageDays * 0.5);
    const newScore = scoreOpportunity(decayedDemand, opp.competitionScore);
    if (Math.abs(newScore - opp.opportunityScore) >= 0.1) {
      await db
        .update(demandOpportunitiesTable)
        .set({
          demandScore: decayedDemand,
          opportunityScore: newScore,
          lastScoredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(demandOpportunitiesTable.id, opp.id));
      rescored++;
    }
  }

  await recomputeRanks(clientId);
  return { rescored, expired };
}

export async function listOpportunities(
  clientId: number,
  opts: { status?: string; category?: string; limit?: number } = {},
): Promise<DemandOpportunity[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
  const conditions = [eq(demandOpportunitiesTable.clientId, clientId)];
  if (opts.status) {
    conditions.push(eq(demandOpportunitiesTable.status, opts.status));
  }
  if (opts.category) {
    conditions.push(eq(demandOpportunitiesTable.category, opts.category));
  }
  return db
    .select()
    .from(demandOpportunitiesTable)
    .where(and(...conditions))
    .orderBy(
      desc(demandOpportunitiesTable.pinned),
      desc(demandOpportunitiesTable.opportunityScore),
    )
    .limit(limit);
}

export async function listCategories(clientId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: demandOpportunitiesTable.category })
    .from(demandOpportunitiesTable)
    .where(eq(demandOpportunitiesTable.clientId, clientId));
  return rows.map((r) => r.category).filter(Boolean);
}

export async function getActiveCategories(): Promise<
  { clientId: number; category: string }[]
> {
  const rows = await db
    .selectDistinct({
      clientId: demandOpportunitiesTable.clientId,
      category: demandOpportunitiesTable.category,
    })
    .from(demandOpportunitiesTable)
    .where(
      inArray(demandOpportunitiesTable.status, ["pending", "queued", "approved"]),
    );
  return rows;
}
