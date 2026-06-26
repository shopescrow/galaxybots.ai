/**
 * Consequence Gate — consequence-grounded alignment enforcement.
 *
 * Before any non-idempotent (write) tool call, the agentic loop calls
 * checkConsequenceRisk(). If the trained risk classifier predicts ≥ 70%
 * harm probability, the call is gated to Pending Approvals.
 *
 * Risk scores are trained monthly by consequence-model-trainer.ts and stored
 * in consequence_risk_scores. Falls back to allow (risk=0) when no score
 * is available (cold-start safe).
 *
 * Lookup uses an action hash derived from:
 *   djb2(toolName::contextType) — same algorithm as consequence-model-trainer.ts
 * for specificity, then falls back progressively to toolName-only matches.
 */

import { db, consequenceRiskScoresTable, clientsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { ConsequenceEvidence } from "@workspace/db";

export const CONSEQUENCE_RISK_THRESHOLD = 0.7;

// Tools that are read-only / idempotent — never gate these
const IDEMPOTENT_TOOLS = new Set([
  "web_search",
  "scrape_url",
  "read_platform_data",
  "read_world_state",
  "read_email",
  "read_slack_channel",
  "list_calendar_events",
  "read_document",
  "delegate_to_bot",
  "delegate_task",
  "report_results",
  "read_crm",
  "list_contacts",
  "get_company_info",
  "search_crm",
  "moltbook_read_feed",
]);

export function isNonIdempotentTool(toolName: string): boolean {
  return !IDEMPOTENT_TOOLS.has(toolName);
}

/**
 * Derive a broad context type from the tool name.
 * Used as part of the action hash for a more precise risk lookup.
 */
export function getToolContextType(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes("email") || n.includes("send_message") || n.includes("slack") || n.includes("notify")) return "communication";
  if (n.includes("crm") || n.includes("contact") || n.includes("lead") || n.includes("deal")) return "crm_update";
  if (n.includes("calendar") || n.includes("schedule") || n.includes("meeting") || n.includes("event")) return "scheduling";
  if (n.includes("file") || n.includes("document") || n.includes("upload") || n.includes("write_file")) return "document_management";
  if (n.includes("payment") || n.includes("invoice") || n.includes("charge") || n.includes("billing")) return "financial";
  if (n.includes("delete") || n.includes("remove") || n.includes("archive")) return "destructive_write";
  if (n.includes("create") || n.includes("insert") || n.includes("add_") || n.includes("new_")) return "record_creation";
  if (n.includes("update") || n.includes("patch") || n.includes("edit") || n.includes("modify")) return "record_update";
  if (n.includes("post") || n.includes("publish") || n.includes("tweet") || n.includes("social")) return "social_publish";
  return "general";
}

/**
 * Compute the action hash used to look up consequence risk scores.
 * Uses the SAME djb2-style algorithm as consequence-model-trainer.ts so gate
 * lookups match the hashes written during training.
 * Hash = djb2(toolName::contextType) — industry/tier are separate WHERE filters.
 */
export function computeActionHash(toolName: string, contextType: string): string {
  const combined = `${toolName}::${contextType}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/** Derive company size tier from client plan — mirrors cross-client aggregation logic */
function planToSizeTier(plan: string | null | undefined): string {
  if (plan) {
    const p = plan.toLowerCase();
    if (p.startsWith("enterprise")) return "enterprise";
    if (p === "growth" || p === "team" || p === "business") return "mid-market";
    if (p === "single" || p === "starter" || p === "free") return "smb";
  }
  return "smb";
}

export interface ConsequenceRiskResult {
  blocked: boolean;
  riskScore: number;
  confidence: number;
  evidenceCount: number;
  reason: string;
  /** Top harmful outcome examples surfaced in pending approval payloads */
  topEvidenceExamples: ConsequenceEvidence[];
}

type RiskRow = {
  riskScore: number;
  confidenceScore: number;
  evidenceCount: number;
  topEvidenceExamples: ConsequenceEvidence[] | null;
};

const EMPTY_OK: ConsequenceRiskResult = {
  blocked: false, riskScore: 0, confidence: 0, evidenceCount: 0,
  reason: "idempotent", topEvidenceExamples: [],
};

/**
 * Check whether a tool call should be gated due to predicted harm.
 *
 * Lookup strategy (most → least specific):
 *  1. Full action hash (tool + contextType + industry + sizeTier)
 *  2. toolName + industryVertical (cross-tier fallback)
 *  3. toolName only (cross-industry fallback)
 *
 * Returns { blocked: false } on cold-start or risk < threshold.
 * Returns { blocked: true, topEvidenceExamples, ... } when risk ≥ threshold with ≥ 5 evidence records.
 *
 * @param riskThreshold - Per-bot configurable threshold (default: CONSEQUENCE_RISK_THRESHOLD = 0.7).
 *   Operators can tune this per-bot via botLoopConfig.qualityThreshold.
 */
export async function checkConsequenceRisk(
  toolName: string,
  clientId: number | null | undefined,
  contextType?: string,
  riskThreshold: number = CONSEQUENCE_RISK_THRESHOLD,
): Promise<ConsequenceRiskResult> {
  if (!isNonIdempotentTool(toolName)) return EMPTY_OK;

  try {
    let industryVertical = "unknown";
    let companySizeTier = "smb";

    if (clientId) {
      const [client] = await db
        .select({ industry: clientsTable.industry, plan: clientsTable.plan })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId))
        .limit(1);
      if (client) {
        industryVertical = client.industry ?? "unknown";
        companySizeTier = planToSizeTier(client.plan);
      }
    }

    const resolvedContextType = contextType ?? getToolContextType(toolName);
    // Industry/tier are applied as WHERE filters; hash is over (tool, contextType) only
    // to match the keys written by consequence-model-trainer.ts.
    const actionHash = computeActionHash(toolName, resolvedContextType);

    const selectCols = {
      riskScore: consequenceRiskScoresTable.riskScore,
      confidenceScore: consequenceRiskScoresTable.confidenceScore,
      evidenceCount: consequenceRiskScoresTable.evidenceCount,
      topEvidenceExamples: consequenceRiskScoresTable.topEvidenceExamples,
    };

    let riskRecord: RiskRow | null = null;

    // 1. Most specific: action hash + industry + companySizeTier (full client profile)
    if (industryVertical !== "unknown") {
      const [specific] = await db
        .select(selectCols)
        .from(consequenceRiskScoresTable)
        .where(
          and(
            eq(consequenceRiskScoresTable.actionHash, actionHash),
            eq(consequenceRiskScoresTable.industryVertical, industryVertical),
            eq(consequenceRiskScoresTable.companySizeTier, companySizeTier),
          ),
        )
        .orderBy(desc(consequenceRiskScoresTable.lastComputedAt))
        .limit(1);
      riskRecord = specific ?? null;
    }

    // 2. Fall back: toolName + industryVertical (any context type)
    if (!riskRecord && industryVertical !== "unknown") {
      const [byIndustry] = await db
        .select(selectCols)
        .from(consequenceRiskScoresTable)
        .where(
          and(
            eq(consequenceRiskScoresTable.toolName, toolName),
            eq(consequenceRiskScoresTable.industryVertical, industryVertical),
          ),
        )
        .orderBy(desc(consequenceRiskScoresTable.lastComputedAt))
        .limit(1);
      riskRecord = byIndustry ?? null;
    }

    // 3. Final fallback: toolName only (cross-industry)
    if (!riskRecord) {
      const [generic] = await db
        .select(selectCols)
        .from(consequenceRiskScoresTable)
        .where(eq(consequenceRiskScoresTable.toolName, toolName))
        .orderBy(desc(consequenceRiskScoresTable.lastComputedAt))
        .limit(1);
      riskRecord = generic ?? null;
    }

    if (!riskRecord) {
      return { ...EMPTY_OK, reason: "no_score" };
    }

    const riskScore = Number(riskRecord.riskScore);
    const confidence = Number(riskRecord.confidenceScore);
    const evidenceCount = riskRecord.evidenceCount;
    const topEvidenceExamples = (riskRecord.topEvidenceExamples ?? []).slice(0, 3);

    if (riskScore >= riskThreshold && evidenceCount >= 5) {
      return {
        blocked: true,
        riskScore,
        confidence,
        evidenceCount,
        topEvidenceExamples,
        reason: `Consequence model predicts ${(riskScore * 100).toFixed(0)}% harm probability for "${toolName}" in ${industryVertical}/${companySizeTier} (context: ${resolvedContextType}, n=${evidenceCount}, conf=${(confidence * 100).toFixed(0)}%)`,
      };
    }

    return { blocked: false, riskScore, confidence, evidenceCount, topEvidenceExamples: [], reason: "below_threshold" };
  } catch (err) {
    console.warn("[consequence-gate] Risk lookup failed, failing open:", err);
    return { ...EMPTY_OK, reason: "lookup_error" };
  }
}
