import { db, toolActivityLogTable, toolHeuristicsTable, causalOutcomesTable } from "@workspace/db";
import { desc, gte, and, isNotNull, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

/**
 * Returns the top-N highest-success-rate tools for a given context type.
 * Used by the agentic loop engine to inject tool guidance into planning prompts.
 */
export async function getTopToolHeuristics(
  contextType: string,
  topN = 3,
): Promise<Array<{ toolName: string; successRate: number; rankInContext: number }>> {
  try {
    return await db
      .select({
        toolName: toolHeuristicsTable.toolName,
        successRate: toolHeuristicsTable.successRate,
        rankInContext: toolHeuristicsTable.rankInContext,
      })
      .from(toolHeuristicsTable)
      .where(eq(toolHeuristicsTable.contextType, contextType))
      .orderBy(toolHeuristicsTable.rankInContext)
      .limit(topN);
  } catch {
    return [];
  }
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let lastToolHeuristicsRun = 0;

const MIN_SAMPLE_SIZE = 5;

interface ToolSuccessAccum {
  successes: number;
  total: number;
  attributionSum: number;   // sum of attributionConfidence values (for causal context)
  attributionCount: number; // number of causal rows (for weighted avg)
}

export async function runToolHeuristicsUpdate() {
  const now = Date.now();
  if (now - lastToolHeuristicsRun < ONE_WEEK_MS) return;
  lastToolHeuristicsRun = now;

  console.log("[tool-heuristics] Running weekly tool heuristics update...");

  const since = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // ── Causal outcomes data (has explicit toolName, treatmentEffect, attributionConfidence) ──
  const causalData = await db
    .select()
    .from(causalOutcomesTable)
    .where(
      and(
        gte(causalOutcomesTable.measuredAt, since),
        isNotNull(causalOutcomesTable.toolName),
        isNotNull(causalOutcomesTable.attributionConfidence),
      ),
    )
    .limit(2000);

  // ── Tool activity log: read status and context from metadata JSONB ──
  // tool_activity_log schema only has: toolName, clientId, sessionId, botName, url, metadata, createdAt
  // Status and contextType are stored as metadata JSON keys by convention.
  const toolActivity = await db
    .select({
      toolName: toolActivityLogTable.toolName,
      status: sql<string | null>`${toolActivityLogTable.metadata}->>'status'`,
      contextType: sql<string | null>`COALESCE(
        ${toolActivityLogTable.metadata}->>'contextType',
        ${toolActivityLogTable.metadata}->>'context_type',
        ${toolActivityLogTable.metadata}->>'department',
        'general'
      )`,
    })
    .from(toolActivityLogTable)
    .where(gte(toolActivityLogTable.createdAt, since))
    .limit(5000);

  const accumByContext: Record<string, Record<string, ToolSuccessAccum>> = {};

  // Accumulate activity log stats (raw success/failure counts per context_type)
  for (const activity of toolActivity) {
    const context = activity.contextType ?? "general";
    const tool = activity.toolName;
    if (!tool) continue;

    if (!accumByContext[context]) accumByContext[context] = {};
    if (!accumByContext[context][tool]) {
      accumByContext[context][tool] = { successes: 0, total: 0, attributionSum: 0, attributionCount: 0 };
    }

    const accum = accumByContext[context][tool];
    accum.total++;
    if (activity.status === "success") accum.successes++;
  }

  // Accumulate causal outcome stats — weight by attributionConfidence
  // so high-confidence causal attributions dominate over uncertain ones.
  for (const causal of causalData) {
    const tool = causal.toolName;
    const context = "causal_attributed";
    if (!accumByContext[context]) accumByContext[context] = {};
    if (!accumByContext[context][tool]) {
      accumByContext[context][tool] = { successes: 0, total: 0, attributionSum: 0, attributionCount: 0 };
    }
    const accum = accumByContext[context][tool];
    accum.total++;
    const conf = causal.attributionConfidence ?? 0;
    // Count this as a "success" weighted by attribution confidence if treatment effect is positive
    if ((causal.treatmentEffect ?? 0) > 0) {
      accum.successes++;
      accum.attributionSum += conf;
    }
    accum.attributionCount++;
  }

  for (const [contextType, tools] of Object.entries(accumByContext)) {
    const isCausalContext = contextType === "causal_attributed";

    const toolsSorted = Object.entries(tools)
      .filter(([, v]) => v.total >= MIN_SAMPLE_SIZE)
      .map(([toolName, v]) => {
        let successRate: number;
        if (isCausalContext && v.attributionCount > 0) {
          // Attribution-confidence weighted success rate:
          // = weighted successes / total, where each positive-treatment row contributes
          //   its attributionConfidence to the numerator instead of a flat 1.
          const avgConf = v.attributionSum / Math.max(v.successes, 1);
          successRate = (v.successes * avgConf) / v.total;
        } else {
          successRate = v.successes / v.total;
        }
        return {
          toolName,
          successRate,
          sampleSize: v.total,
          isCounterfactual: isCausalContext,
        };
      })
      .sort((a, b) => b.successRate - a.successRate);

    for (let rank = 0; rank < Math.min(toolsSorted.length, 10); rank++) {
      const t = toolsSorted[rank];
      try {
        const existing = await db
          .select({ id: toolHeuristicsTable.id })
          .from(toolHeuristicsTable)
          .where(
            and(
              eq(toolHeuristicsTable.contextType, contextType),
              eq(toolHeuristicsTable.toolName, t.toolName),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(toolHeuristicsTable)
            .set({
              successRate: t.successRate,
              sampleSize: t.sampleSize,
              isCounterfactualAdjusted: t.isCounterfactual,
              rankInContext: rank + 1,
              lastComputedAt: new Date(),
            })
            .where(eq(toolHeuristicsTable.id, existing[0].id));
        } else {
          await db.insert(toolHeuristicsTable).values({
            contextType,
            toolName: t.toolName,
            successRate: t.successRate,
            sampleSize: t.sampleSize,
            isCounterfactualAdjusted: t.isCounterfactual,
            rankInContext: rank + 1,
          });
        }
      } catch (err) {
        console.error(`[tool-heuristics] Error updating ${contextType}/${t.toolName}:`, err);
      }
    }
  }

  console.log(`[tool-heuristics] Updated heuristics for ${Object.keys(accumByContext).length} context types.`);
}
