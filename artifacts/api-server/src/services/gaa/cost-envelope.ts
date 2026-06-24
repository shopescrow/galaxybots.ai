import { db, gaaGoalsTable, gaaJournalTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Per-goal cost envelopes + budget governor. Each goal carries a budget in
// cents; the governor switches to conservative behaviour at 80% burn and
// pauses + escalates at 100%.
// ---------------------------------------------------------------------------

export interface BurnState {
  goalId: number;
  envelopeCents: number;
  spentCents: number;
  remainingCents: number;
  burnRatio: number; // 0..1+
  // ok | conservative | exhausted
  level: "ok" | "conservative" | "exhausted";
}

export function evaluateBurn(
  envelopeCents: number,
  spentCents: number,
): Omit<BurnState, "goalId"> {
  const remainingCents = envelopeCents - spentCents;
  const burnRatio = envelopeCents > 0 ? spentCents / envelopeCents : 0;
  let level: BurnState["level"] = "ok";
  if (burnRatio >= 1) level = "exhausted";
  else if (burnRatio >= 0.8) level = "conservative";
  return { envelopeCents, spentCents, remainingCents, burnRatio, level };
}

export async function getBurnState(goalId: number): Promise<BurnState | null> {
  const [goal] = await db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.id, goalId));
  if (!goal) return null;
  return {
    goalId,
    ...evaluateBurn(goal.costEnvelopeCents, goal.spentCents),
  };
}

/**
 * Record cost burn against a goal and return the resulting burn state.
 * Writes a journal entry so spend is traceable.
 */
export async function recordBurn(
  goalId: number,
  cents: number,
  reason: string,
): Promise<BurnState> {
  const [goal] = await db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.id, goalId));
  if (!goal) throw new Error(`GAA goal ${goalId} not found`);

  const newSpent = goal.spentCents + Math.max(0, Math.round(cents));
  await db
    .update(gaaGoalsTable)
    .set({ spentCents: newSpent, updatedAt: new Date() })
    .where(eq(gaaGoalsTable.id, goalId));

  await db.insert(gaaJournalTable).values({
    goalId,
    phase: "execute",
    eventType: "cost_burn",
    decision: "info",
    detail: `Spent ${cents}¢ (${reason}). Total ${newSpent}/${goal.costEnvelopeCents}¢.`,
    costCents: Math.max(0, Math.round(cents)),
  });

  return { goalId, ...evaluateBurn(goal.costEnvelopeCents, newSpent) };
}

/**
 * Budget pre-check before incurring spend. Returns whether the action may
 * proceed, and at what posture (full vs conservative).
 */
export async function canAfford(
  goalId: number,
  estimatedCents: number,
): Promise<{ allowed: boolean; posture: BurnState["level"]; state: BurnState | null }> {
  const state = await getBurnState(goalId);
  if (!state) return { allowed: false, posture: "exhausted", state: null };
  if (state.level === "exhausted") {
    return { allowed: false, posture: "exhausted", state };
  }
  const wouldSpend = state.spentCents + Math.max(0, estimatedCents);
  if (wouldSpend > state.envelopeCents) {
    return { allowed: false, posture: state.level, state };
  }
  return { allowed: true, posture: state.level, state };
}
