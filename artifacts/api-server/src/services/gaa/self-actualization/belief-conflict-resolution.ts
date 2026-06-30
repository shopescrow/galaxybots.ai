import {
  db,
  beliefConflictsTable,
  knowledgeTransfersTable,
  selfModificationsTable,
  botsTable,
  type BeliefConflict,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { callWithFallback } from "../../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { isKillSwitchActive } from "./config";

// ---------------------------------------------------------------------------
// LLM-mediated belief conflict arbitration.
//
// For each pending conflict record the arbitration model is presented with:
//   • both distilled belief texts
//   • their confidence scores and semantic similarity
//   • the task category and bot context
//
// The model returns a structured verdict:
//   synthesized_belief  — the merged truth (or the winning side's text)
//   dissenting_note     — what the minority view still contributes
//   resolution_type     — merged | first_wins | second_wins | context_dependent
//   condition_tag       — when context_dependent, the branching condition
//   reasoning           — full chain-of-thought for audit
//   source_confidence   — updated confidence for the source (incoming) belief
//   target_confidence   — updated confidence for the target (incumbent) belief
//
// Winner / loser semantics:
//   merged         → source text replaced by synthesized_belief; target archived
//   first_wins     → incoming SOURCE wins; source stays applied; target (incumbent) archived
//   second_wins    → incumbent TARGET wins; target stays applied; source (incoming) archived
//   context_dependent → both survive with condition annotations
//
// Human escalation: conflicts where BOTH sides have high confidence (> 0.85)
// AND high semantic similarity (> 0.80) — meaning they are making very similar
// but contradictory high-stakes claims — are routed to human_review and
// surfaced as self-modification proposals for governance adjudication.
// ---------------------------------------------------------------------------

const HUMAN_REVIEW_CONFIDENCE_THRESHOLD = 0.85;
const HUMAN_REVIEW_SIMILARITY_THRESHOLD = 0.80;
const ARBITRATION_BATCH = 20;
const JOB_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
let lastRun = 0;

interface ArbitrationVerdict {
  synthesized_belief: string;
  dissenting_note: string;
  resolution_type: "merged" | "first_wins" | "second_wins" | "context_dependent";
  condition_tag?: string;
  reasoning: string;
  source_confidence: number;
  target_confidence: number;
}

async function callArbitrationLLM(conflict: BeliefConflict): Promise<ArbitrationVerdict | null> {
  const botInfo = await db
    .select({ title: botsTable.title })
    .from(botsTable)
    .where(eq(botsTable.id, conflict.targetBotId))
    .limit(1);

  const botTitle = botInfo[0]?.title ?? "unknown bot";
  const simLabel =
    conflict.semanticSimilarity != null
      ? ` (semantic similarity: ${conflict.semanticSimilarity.toFixed(3)})`
      : "";

  const systemPrompt = `You are an AI arbitration model mediating a knowledge conflict between two agent beliefs.
Your task is to produce a fair, evidence-weighted resolution that preserves as much signal as possible.
Respond ONLY with a valid JSON object — no markdown fences, no prose outside JSON.`;

  const userPrompt = `Arbitrate this belief conflict for "${botTitle}" in task category "${conflict.taskCategory ?? "general"}":

BELIEF A — incoming transfer (source), confidence: ${conflict.sourceConfidence.toFixed(2)}${simLabel}:
"${conflict.sourceBeliefText}"

BELIEF B — existing incumbent (target), confidence: ${conflict.targetConfidence.toFixed(2)}:
"${conflict.targetBeliefText}"

Instructions:
1. Determine whether these beliefs are truly contradictory, partially overlapping, or only valid under different conditions.
2. Produce a merged/winning belief that captures the most accurate truth.
3. Note what the minority view still contributes (the dissenting note).
4. Choose resolution_type:
   - "merged": synthesize both into a single improved belief (source text becomes the synthesis)
   - "first_wins": incoming BELIEF A (source) is more accurate; BELIEF B (target/incumbent) should be archived
   - "second_wins": incumbent BELIEF B (target) is more accurate; BELIEF A (source/incoming) should be archived
   - "context_dependent": BOTH are valid under different conditions — specify the condition_tag
5. Update confidence scores for surviving beliefs (0.0–1.0). Boost confidence if a belief gains corroboration.

Respond with JSON exactly matching this schema:
{
  "synthesized_belief": "<compact belief text, max 60 words>",
  "dissenting_note": "<what the losing/minority view contributes, max 40 words>",
  "resolution_type": "merged|first_wins|second_wins|context_dependent",
  "condition_tag": "<only if context_dependent — e.g. 'enterprise clients'>",
  "reasoning": "<full chain-of-thought, max 200 words>",
  "source_confidence": <0.0–1.0>,
  "target_confidence": <0.0–1.0>
}`;

  try {
    const result = await callWithFallback({
      model: resolveCapability(ModelCapability.REASONING_PREMIUM),
      temperature: 0.1,
      maxCompletionTokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = result.completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as Partial<ArbitrationVerdict>;

    if (!parsed.resolution_type || !parsed.synthesized_belief) return null;

    const validTypes = ["merged", "first_wins", "second_wins", "context_dependent"];
    if (!validTypes.includes(parsed.resolution_type)) return null;

    return {
      synthesized_belief: String(parsed.synthesized_belief).slice(0, 500),
      dissenting_note: String(parsed.dissenting_note ?? "").slice(0, 400),
      resolution_type: parsed.resolution_type as ArbitrationVerdict["resolution_type"],
      condition_tag: parsed.condition_tag ? String(parsed.condition_tag).slice(0, 200) : undefined,
      reasoning: String(parsed.reasoning ?? "").slice(0, 2000),
      source_confidence: Math.max(0, Math.min(1, Number(parsed.source_confidence ?? conflict.sourceConfidence))),
      target_confidence: Math.max(0, Math.min(1, Number(parsed.target_confidence ?? conflict.targetConfidence))),
    };
  } catch (err) {
    console.warn("[belief-conflict] LLM arbitration parse failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Determine whether a conflict needs human adjudication.
 * Criteria: BOTH beliefs have high confidence AND high semantic similarity,
 * meaning they are near-identical claims that directly contradict one another —
 * the highest-stakes scenario where automated arbitration risks discarding
 * accurate information.
 */
function needsHumanReview(conflict: BeliefConflict): boolean {
  const bothHighConfidence =
    conflict.sourceConfidence >= HUMAN_REVIEW_CONFIDENCE_THRESHOLD &&
    conflict.targetConfidence >= HUMAN_REVIEW_CONFIDENCE_THRESHOLD;
  const highSimilarity =
    conflict.semanticSimilarity != null &&
    conflict.semanticSimilarity >= HUMAN_REVIEW_SIMILARITY_THRESHOLD;
  return bothHighConfidence && highSimilarity;
}

async function escalateToHumanReview(conflict: BeliefConflict): Promise<void> {
  await db
    .update(beliefConflictsTable)
    .set({ resolutionStatus: "human_review" })
    .where(eq(beliefConflictsTable.id, conflict.id));

  // Surface as a self-modification proposal so the owner can decide via the
  // existing governance flow.
  await db.insert(selfModificationsTable).values({
    botId: conflict.targetBotId,
    clientId: conflict.clientId ?? null,
    modType: "role_definition",
    title: `Belief conflict requires human review — ${conflict.taskCategory ?? "general"}`,
    rationale:
      `Both competing beliefs have high confidence (source: ${conflict.sourceConfidence.toFixed(2)}, ` +
      `target: ${conflict.targetConfidence.toFixed(2)}) and high semantic similarity ` +
      `(${conflict.semanticSimilarity?.toFixed(3) ?? "unknown"}), indicating a direct high-stakes contradiction ` +
      `where automated arbitration risks discarding accurate signal. Human judgment is required.`,
    proposal: {
      conflictId: conflict.id,
      sourceBelief: conflict.sourceBeliefText,
      targetBelief: conflict.targetBeliefText,
      taskCategory: conflict.taskCategory,
      semanticSimilarity: conflict.semanticSimilarity,
    },
    evidence: {
      sourceConfidence: conflict.sourceConfidence,
      targetConfidence: conflict.targetConfidence,
      semanticSimilarity: conflict.semanticSimilarity,
      conflictType: conflict.conflictType,
    },
    riskLevel: "high",
    humanGated: true,
    status: "proposed",
    proposedBy: "belief_conflict_arbitration",
  });
}

/**
 * Apply a resolved verdict to the knowledge_transfers rows.
 *
 * Winner / loser semantics (source = incoming, target = incumbent):
 *   merged         → source updated to synthesized text; target soft-archived
 *   first_wins     → source (incoming) wins; source stays applied; target archived
 *   second_wins    → target (incumbent) wins; target confidence updated; source archived
 *   context_dependent → both survive with condition annotations; no archival
 */
async function applyResolution(conflict: BeliefConflict, verdict: ArbitrationVerdict): Promise<void> {
  const now = new Date();

  // Persist the full arbitration output on the conflict record.
  await db
    .update(beliefConflictsTable)
    .set({
      resolutionStatus: "resolved",
      synthesizedBelief: verdict.synthesized_belief,
      dissentingNote: verdict.dissenting_note,
      resolutionType: verdict.resolution_type,
      conditionTag: verdict.condition_tag ?? null,
      arbitrationReasoning: verdict.reasoning,
      resolvedAt: now,
    })
    .where(eq(beliefConflictsTable.id, conflict.id));

  const reasonPrefix = `Arbitrated (${verdict.resolution_type}): ${verdict.reasoning.slice(0, 150)}`;

  if (verdict.resolution_type === "merged") {
    // The TARGET (incumbent) belief row is the canonical live belief for this
    // bot+category. Update it to the synthesized text and bump its confidence.
    // The SOURCE (incoming) transfer is archived since its content was distilled
    // into the synthesis — preserving it would create a duplicate.
    if (conflict.targetBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          distilledBelief: verdict.synthesized_belief,
          confidence: verdict.target_confidence,
          status: "applied",
          conflictResolution: `${reasonPrefix} — synthesized belief applied to incumbent row.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.targetBelief));
    }
    if (conflict.sourceBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          status: "rejected",
          archivedAt: now,
          conflictResolution: `${reasonPrefix} — archived; content merged into incumbent belief.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.sourceBelief));
    }
  } else if (verdict.resolution_type === "first_wins") {
    // Incoming SOURCE wins; source stays applied with updated confidence.
    // Incumbent TARGET is soft-archived.
    if (conflict.sourceBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          confidence: verdict.source_confidence,
          status: "applied",
          conflictResolution: `${reasonPrefix} — source (incoming) is the winner.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.sourceBelief));
    }
    if (conflict.targetBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          status: "rejected",
          archivedAt: now,
          conflictResolution: `${reasonPrefix} — archived; lost to incoming belief.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.targetBelief));
    }
  } else if (verdict.resolution_type === "second_wins") {
    // Incumbent TARGET wins; target stays applied with updated confidence.
    // Incoming SOURCE is soft-archived.
    if (conflict.targetBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          confidence: verdict.target_confidence,
          status: "applied",
          conflictResolution: `${reasonPrefix} — incumbent (target) is the winner.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.targetBelief));
    }
    if (conflict.sourceBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          status: "rejected",
          archivedAt: now,
          conflictResolution: `${reasonPrefix} — archived; incoming belief lost to incumbent.`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.sourceBelief));
    }
  } else if (verdict.resolution_type === "context_dependent") {
    // Both beliefs survive with condition tags. Neither is archived.
    const conditionLabel = verdict.condition_tag ?? "see conflict record";
    if (conflict.sourceBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          confidence: verdict.source_confidence,
          status: "applied",
          conflictResolution: `context_dependent: applies when NOT (${conditionLabel}). ${reasonPrefix}`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.sourceBelief));
    }
    if (conflict.targetBelief) {
      await db
        .update(knowledgeTransfersTable)
        .set({
          confidence: verdict.target_confidence,
          status: "applied",
          conflictResolution: `context_dependent: applies when (${conditionLabel}). ${reasonPrefix}`,
        })
        .where(eq(knowledgeTransfersTable.id, conflict.targetBelief));
    }
  }
}

export interface ConflictResolutionOutcome {
  conflictId: number;
  resolutionStatus: "resolved" | "human_review" | "failed";
  resolutionType?: string;
}

/**
 * Resolve pending belief conflicts. Called by the background job every 4 hours.
 * Rate-gated internally so re-entrant calls are no-ops.
 */
export async function resolveBeliefConflicts(): Promise<ConflictResolutionOutcome[]> {
  const now = Date.now();
  if (now - lastRun < JOB_INTERVAL_MS) return [];
  lastRun = now;

  if (await isKillSwitchActive()) {
    console.log("[belief-conflict] kill switch active — skipping arbitration");
    return [];
  }

  const pending = await db
    .select()
    .from(beliefConflictsTable)
    .where(eq(beliefConflictsTable.resolutionStatus, "pending"))
    .orderBy(asc(beliefConflictsTable.createdAt))
    .limit(ARBITRATION_BATCH);

  if (pending.length === 0) return [];

  const outcomes: ConflictResolutionOutcome[] = [];

  for (const conflict of pending) {
    try {
      if (needsHumanReview(conflict)) {
        await escalateToHumanReview(conflict);
        outcomes.push({ conflictId: conflict.id, resolutionStatus: "human_review" });
        continue;
      }

      const verdict = await callArbitrationLLM(conflict);
      if (!verdict) {
        // Leave as pending so the next run retries; surface the failure.
        outcomes.push({ conflictId: conflict.id, resolutionStatus: "failed" });
        continue;
      }

      await applyResolution(conflict, verdict);
      outcomes.push({
        conflictId: conflict.id,
        resolutionStatus: "resolved",
        resolutionType: verdict.resolution_type,
      });
    } catch (err) {
      console.error(`[belief-conflict] Failed to resolve conflict #${conflict.id}:`, err);
      outcomes.push({ conflictId: conflict.id, resolutionStatus: "failed" });
    }
  }

  const resolved = outcomes.filter((o) => o.resolutionStatus === "resolved").length;
  const humanReview = outcomes.filter((o) => o.resolutionStatus === "human_review").length;
  const failed = outcomes.filter((o) => o.resolutionStatus === "failed").length;
  console.log(
    `[belief-conflict] arbitration: ${resolved} resolved, ${humanReview} human_review, ${failed} failed (of ${pending.length} pending)`,
  );

  return outcomes;
}

// ---------------------------------------------------------------------------
// C-suite domain access check for the conflict history endpoint.
// ---------------------------------------------------------------------------

const CSUITE_HISTORY_KEYWORDS = ["Chief", "CEO", "CFO", "COO", "CMO", "CTO", "President"];
const CSUITE_HISTORY_DEPT_KEYWORDS = ["executive", "c-suite", "csuite", "leadership"];

/**
 * Returns true if `botId` is a C-suite bot AND it belongs to `clientId`.
 * Used to grant non-owner callers scoped access to conflict history for their domain.
 */
export async function isCsuiteInDomain(botId: number, clientId: number): Promise<boolean> {
  const [bot] = await db
    .select({ title: botsTable.title, department: botsTable.department, tenantId: botsTable.tenantId })
    .from(botsTable)
    .where(eq(botsTable.id, botId))
    .limit(1);

  // Bot must exist and belong to the caller's tenant (clientId = tenantId in bots table).
  if (!bot || bot.tenantId !== clientId) return false;

  const dept = (bot.department ?? "").toLowerCase();
  return (
    CSUITE_HISTORY_KEYWORDS.some((kw) => bot.title.includes(kw)) ||
    CSUITE_HISTORY_DEPT_KEYWORDS.some((kw) => dept.includes(kw))
  );
}

// ---------------------------------------------------------------------------
// List conflict history — supports domain-scoped access for C-suite callers.
// ---------------------------------------------------------------------------

/**
 * List conflict history for the API endpoint.
 *
 * `scopeClientId` is required for non-owner callers: when set, results are
 * restricted to conflicts belonging to that client's bots so callers cannot
 * read another tenant's belief state.
 */
export async function listBeliefConflicts(opts: {
  botId?: number;
  status?: string;
  limit?: number;
  offset?: number;
  /** When set, hard-scopes results to this clientId regardless of other filters. */
  scopeClientId?: number;
}) {
  const { botId, status, limit = 50, offset = 0, scopeClientId } = opts;

  const conditions = [];
  if (botId != null) conditions.push(eq(beliefConflictsTable.targetBotId, botId));
  if (status) conditions.push(eq(beliefConflictsTable.resolutionStatus, status));
  if (scopeClientId != null) conditions.push(eq(beliefConflictsTable.clientId, scopeClientId));

  const query = db
    .select()
    .from(beliefConflictsTable)
    .$dynamic();

  const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
    .orderBy(desc(beliefConflictsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
