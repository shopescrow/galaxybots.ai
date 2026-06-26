import { db, llmUsageLogTable, accountSubscriptionsTable, usageEventsTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { usdToCredits } from "./tree-cost-estimator.js";

/**
 * Post-run credit reconciliation for coordination runs.
 *
 * Pre-run we deduct an estimate (tree-aware). The estimate is intentionally
 * margin-safe (it over-counts: e.g. it assumes distillation always fires). Once
 * the run completes we know the *actual* cost from `llm_usage_log`, so we true
 * up the ledger: charge actual credits, refund the estimate over-charge (or bill
 * the under-charge), and record a `usage_event` for billing provenance.
 */

export interface ReconcileInput {
  clientId: number;
  /** Epoch ms captured immediately before the run started fanning out. */
  runStartMs: number;
  /** Credits pre-deducted for this run (tree estimate). */
  estimatedCredits: number;
  /** Route/source label for the usage_event audit row. */
  route?: string;
}

export interface ReconcileResult {
  actualCostUsd: number;
  actualCredits: number;
  estimatedCredits: number;
  /** actualCredits - estimatedCredits. Positive = under-estimated (billed more). */
  deltaCredits: number;
  newCreditBalance: number | null;
}

/** Sum the actual logged LLM cost attributed to a client since a point in time. */
async function sumActualCostUsd(clientId: number, runStartMs: number): Promise<number> {
  const since = new Date(runStartMs);
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${llmUsageLogTable.estimatedCostUsd}::numeric), 0)`,
    })
    .from(llmUsageLogTable)
    .where(
      and(
        eq(llmUsageLogTable.clientId, clientId),
        gte(llmUsageLogTable.calledAt, since),
      ),
    );
  return parseFloat(row?.total ?? "0");
}

export async function reconcileRunCredits(input: ReconcileInput): Promise<ReconcileResult | null> {
  const { clientId, runStartMs, estimatedCredits, route = "coordination_run" } = input;

  try {
    const actualCostUsd = await sumActualCostUsd(clientId, runStartMs);
    const actualCredits = usdToCredits(actualCostUsd);
    const deltaCredits = actualCredits - estimatedCredits;

    // Deduct the *net* difference: pre-deduction already removed `estimatedCredits`.
    // A positive delta removes more; a negative delta refunds the over-charge.
    const [sub] = await db
      .select({ id: accountSubscriptionsTable.id, creditBalance: accountSubscriptionsTable.creditBalance })
      .from(accountSubscriptionsTable)
      .where(
        and(
          eq(accountSubscriptionsTable.clientId, clientId),
          eq(accountSubscriptionsTable.status, "active"),
        ),
      )
      .limit(1);

    let newCreditBalance: number | null = null;
    if (sub) {
      newCreditBalance = Math.max(0, sub.creditBalance - deltaCredits);
      await db
        .update(accountSubscriptionsTable)
        .set({ creditBalance: newCreditBalance, updatedAt: new Date() })
        .where(eq(accountSubscriptionsTable.id, sub.id));
    }

    // Record actual usage for billing provenance (source of truth = usage_events).
    await db.insert(usageEventsTable).values({
      clientId,
      model: "coordination",
      tokens: 0,
      creditsDeducted: actualCredits,
      route,
    }).catch(() => {});

    console.log(
      `[RunReconciliation] client=${clientId} actual=$${actualCostUsd.toFixed(4)} ` +
      `(${actualCredits} cr) estimate=${estimatedCredits} cr delta=${deltaCredits} cr`,
    );

    return { actualCostUsd, actualCredits, estimatedCredits, deltaCredits, newCreditBalance };
  } catch (err) {
    console.error("[RunReconciliation] reconcileRunCredits failed:", err);
    return null;
  }
}
