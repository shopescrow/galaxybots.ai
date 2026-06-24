import {
  db,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaGoal,
} from "@workspace/db";
import { eq, desc, and, gte } from "drizzle-orm";
import { remember } from "./memory-tiers";

// ---------------------------------------------------------------------------
// Outcome learning loop. When a goal completes (or fails), the GAA extracts a
// durable lesson into memory and feeds an outcome bias back into future goal
// selection. High-confidence reversals are flagged as anomalies.
// ---------------------------------------------------------------------------

export interface OutcomeBias {
  // Keyword/topic → signed weight. Positive = pursue more, negative = avoid.
  weights: Record<string, number>;
  successRate: number;
  sampleSize: number;
}

const TOPIC_WORDS = (g: GaaGoal): string[] =>
  `${g.title}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);

/**
 * Record the outcome of a goal: write a lesson to memory and journal it.
 */
export async function learnFromOutcome(params: {
  goalId: number;
  outcome: "completed" | "failed";
  summary: string;
}): Promise<void> {
  const [goal] = await db
    .select()
    .from(gaaGoalsTable)
    .where(eq(gaaGoalsTable.id, params.goalId));
  if (!goal) return;

  const success = params.outcome === "completed";
  const lesson = success
    ? `Worked: ${goal.title}. ${params.summary}`
    : `Failed: ${goal.title}. ${params.summary}`;

  await remember({
    key: `outcome:${goal.title.slice(0, 60)}`,
    content: params.summary,
    lesson,
    scope: goal.clientId ? "client" : "platform",
    clientId: goal.clientId,
    goalId: goal.id,
    confidence: success ? 70 : 55,
  });

  await db.insert(gaaJournalTable).values({
    goalId: goal.id,
    phase: "learn",
    eventType: "outcome_learned",
    decision: "info",
    detail: lesson,
    metadata: { outcome: params.outcome },
  });

  // Anomaly detection: a high-priority goal failing fast is worth surfacing.
  if (!success && goal.priority <= 1) {
    await db.insert(gaaJournalTable).values({
      goalId: goal.id,
      phase: "learn",
      eventType: "outcome_anomaly",
      decision: "flag",
      detail: `High-priority goal failed: ${goal.title}.`,
    });
  }
}

/**
 * Compute an outcome bias from recent goal history to inform future selection.
 */
export async function computeOutcomeBias(
  windowDays = 30,
): Promise<OutcomeBias> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const recent = await db
    .select()
    .from(gaaGoalsTable)
    .where(
      and(
        gte(gaaGoalsTable.updatedAt, since),
      ),
    )
    .orderBy(desc(gaaGoalsTable.updatedAt))
    .limit(200);

  const weights: Record<string, number> = {};
  let completed = 0;
  let finished = 0;

  for (const g of recent) {
    if (g.status !== "completed" && g.status !== "failed") continue;
    finished++;
    const delta = g.status === "completed" ? 1 : -1;
    if (g.status === "completed") completed++;
    for (const w of TOPIC_WORDS(g)) {
      weights[w] = (weights[w] ?? 0) + delta;
    }
  }

  return {
    weights,
    successRate: finished > 0 ? completed / finished : 0,
    sampleSize: finished,
  };
}

/**
 * Score a candidate goal against the current outcome bias (higher = more
 * promising). Used by the engine to prioritise selection.
 */
export function scoreWithBias(
  goal: { title: string },
  bias: OutcomeBias,
): number {
  const words = goal.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
  let score = 0;
  for (const w of words) score += bias.weights[w] ?? 0;
  return score;
}
