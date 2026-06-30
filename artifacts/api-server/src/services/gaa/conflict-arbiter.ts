import {
  db,
  gaaGoalsTable,
  gaaJournalTable,
  type GaaGoal,
} from "@workspace/db";
import { eq, inArray, ne, and } from "drizzle-orm";
import { executeSequentialDebate } from "../conductor/strategies";
import { broadcastSSEToAll } from "../platform/sse.js";

// ---------------------------------------------------------------------------
// Goal conflict arbiter. Detects pairs of active goals that compete for the
// same resource or pull in opposite directions, then resolves them — via an
// LLM debate when available, otherwise via deterministic priority rules —
// logging the decision and rationale.
// ---------------------------------------------------------------------------

export interface GoalConflict {
  goalA: GaaGoal;
  goalB: GaaGoal;
  conflictType: string;
  overlap: number; // 0..1
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "by",
  "is",
  "all",
  "our",
  "goal",
  "client",
  "clients",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export async function detectConflicts(): Promise<GoalConflict[]> {
  const goals = await db
    .select()
    .from(gaaGoalsTable)
    .where(inArray(gaaGoalsTable.status, ["pending", "active"]));

  const conflicts: GoalConflict[] = [];
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const a = goals[i];
      const b = goals[j];

      // Same-client resource contention or semantic overlap.
      const sameClient =
        a.clientId != null && a.clientId === b.clientId;
      const overlap = jaccard(
        tokens(`${a.title} ${a.description ?? ""}`),
        tokens(`${b.title} ${b.description ?? ""}`),
      );

      if (overlap >= 0.45) {
        conflicts.push({
          goalA: a,
          goalB: b,
          conflictType: sameClient ? "resource_contention" : "semantic_overlap",
          overlap,
        });
      }
    }
  }
  return conflicts;
}

export interface ArbitrationResult {
  winnerId: number;
  loserId: number;
  reason: string;
  method: "llm_debate" | "priority_rule";
}

/**
 * Resolve a conflict by routing it through the existing Conductor's Sequential
 * Debate strategy (the same multi-agent debate path the rest of the platform
 * uses), rather than a bespoke single LLM call. An advocate champions each
 * goal and a constitutional arbiter delivers the binding verdict.
 */
async function arbitrateViaDebate(
  conflict: GoalConflict,
): Promise<ArbitrationResult | null> {
  try {
    const { goalA, goalB } = conflict;
    const debate = await executeSequentialDebate({
      taskDescription: "Galaxy Autonomous Agent goal conflict arbitration",
      userContent:
        `Two active goals conflict (${conflict.conflictType}, overlap ${(conflict.overlap * 100).toFixed(0)}%).\n` +
        `Goal A (#${goalA.id}, priority ${goalA.priority}): ${goalA.title} — ${goalA.description ?? ""}\n` +
        `Goal B (#${goalB.id}, priority ${goalB.priority}): ${goalB.title} — ${goalB.description ?? ""}\n` +
        "Decide which goal takes precedence based on client value, reversibility, urgency and constitutional alignment.",
      agents: [
        {
          name: "Advocate-A",
          systemPrompt:
            "You are the advocate for Goal A. Argue persuasively why Goal A should take precedence, citing client value, urgency and strategic alignment.",
        },
        {
          name: "Advocate-B",
          systemPrompt:
            "You are the advocate for Goal B. Critically rebut the case for Goal A and argue why Goal B should take precedence instead.",
        },
        {
          name: "Constitutional-Arbiter",
          systemPrompt:
            "You are the Galaxy Autonomous Agent's constitutional arbiter. Weigh both advocates' positions and deliver a binding verdict. " +
            'End your response with a single JSON line exactly in this form: {"winner":"A"|"B","reason":"<one sentence>"}.',
        },
      ],
    });

    const match = debate.content.match(/\{[\s\S]*"winner"[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { winner: string; reason: string };
    const winner = parsed.winner === "A" ? goalA : goalB;
    const loser = parsed.winner === "A" ? goalB : goalA;
    return {
      winnerId: winner.id,
      loserId: loser.id,
      reason: parsed.reason || "Sequential debate verdict.",
      method: "llm_debate",
    };
  } catch {
    return null;
  }
}

function arbitrateViaPriority(conflict: GoalConflict): ArbitrationResult {
  const { goalA, goalB } = conflict;
  // Lower priority number wins; tie-break on higher reversibility, then newer.
  let winner = goalA;
  let loser = goalB;
  if (goalB.priority < goalA.priority) {
    winner = goalB;
    loser = goalA;
  } else if (goalB.priority === goalA.priority) {
    const ra = goalA.reversibilityScore ?? 50;
    const rb = goalB.reversibilityScore ?? 50;
    if (rb > ra) {
      winner = goalB;
      loser = goalA;
    }
  }
  return {
    winnerId: winner.id,
    loserId: loser.id,
    reason: `Priority rule: goal #${winner.id} outranks #${loser.id}.`,
    method: "priority_rule",
  };
}

/**
 * Resolve a single conflict: loser is suspended (deferred), winner proceeds.
 * Emits a gaa_conflict_resolved SSE event to all admin-connected clients.
 */
export async function resolveConflict(
  conflict: GoalConflict,
): Promise<ArbitrationResult> {
  const result =
    (await arbitrateViaDebate(conflict)) ?? arbitrateViaPriority(conflict);

  await db
    .update(gaaGoalsTable)
    .set({
      status: "suspended",
      blockedReason: `Deferred by conflict arbiter in favour of goal #${result.winnerId}.`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gaaGoalsTable.id, result.loserId),
        ne(gaaGoalsTable.status, "completed"),
      ),
    );

  await db.insert(gaaJournalTable).values({
    goalId: result.winnerId,
    phase: "conflict",
    eventType: "conflict_resolved",
    decision: "proceed",
    detail: `${result.reason} (${result.method})`,
    metadata: {
      winnerId: result.winnerId,
      loserId: result.loserId,
      conflictType: conflict.conflictType,
      overlap: conflict.overlap,
    },
  });

  broadcastSSEToAll("gaa_conflict_resolved", {
    winnerId: result.winnerId,
    loserId: result.loserId,
    goalAId: conflict.goalA.id,
    goalATitle: conflict.goalA.title,
    goalBId: conflict.goalB.id,
    goalBTitle: conflict.goalB.title,
    conflictType: conflict.conflictType,
    method: result.method,
    reason: result.reason,
    at: new Date().toISOString(),
  });

  return result;
}

export async function detectAndResolveConflicts(): Promise<number> {
  const conflicts = await detectConflicts();
  let resolved = 0;
  const touched = new Set<number>();

  if (conflicts.length > 0) {
    broadcastSSEToAll("gaa_conflicts_detected", {
      count: conflicts.length,
      conflicts: conflicts.map((c) => ({
        goalAId: c.goalA.id,
        goalATitle: c.goalA.title,
        goalBId: c.goalB.id,
        goalBTitle: c.goalB.title,
        conflictType: c.conflictType,
        overlap: c.overlap,
      })),
      at: new Date().toISOString(),
    });
  }

  for (const c of conflicts) {
    // Skip if either goal already deferred in this pass.
    if (touched.has(c.goalA.id) || touched.has(c.goalB.id)) continue;
    const r = await resolveConflict(c);
    touched.add(r.loserId);
    resolved++;
  }
  return resolved;
}
