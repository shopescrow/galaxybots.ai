import {
  db,
  botReflectionsTable,
  sessionOutcomesTable,
  type SessionOutcome,
} from "@workspace/db";
import { eq, and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { callWithFallback } from "../../ai-safety/model-fallback";
import { remember } from "../memory-tiers";

// ---------------------------------------------------------------------------
// Deep root-cause reflection. On significant failures the agent does more than
// log "it failed" — it diagnoses WHY, classifies the root-cause type, and
// distils a durable, reusable prevention lesson. Lessons are persisted both to
// the structured reflections table and to GAA memory so they reinforce and can
// be promoted to the cold (durable) tier and distilled across agents.
// ---------------------------------------------------------------------------

const ROOT_CAUSE_TYPES = [
  "faulty_assumption",
  "wrong_tool",
  "context_gap",
  "planning_error",
  "verification_miss",
  "external_factor",
  "other",
] as const;

type RootCauseType = (typeof ROOT_CAUSE_TYPES)[number];

export interface ReflectionResult {
  reflectionId: number;
  botId: number;
  rootCauseType: RootCauseType;
  rootCause: string;
  durableLesson: string;
}

function primaryBot(outcome: SessionOutcome): { botId: number; department: string } | null {
  const bots = outcome.botsDeployed ?? [];
  if (bots.length === 0) return null;
  const first = bots[0];
  return { botId: first.botId, department: first.department ?? outcome.department ?? "general" };
}

function heuristicReflection(outcome: SessionOutcome): {
  rootCauseType: RootCauseType;
  rootCause: string;
  contributingFactors: string[];
  durableLesson: string;
  preventionRule: string;
} {
  const cat = outcome.failureCategory ?? outcome.terminationReason ?? "unknown";
  const map: Record<string, RootCauseType> = {
    tool_error: "wrong_tool",
    timeout: "planning_error",
    max_iterations: "planning_error",
    verification_failed: "verification_miss",
    missing_context: "context_gap",
    permission_denied: "external_factor",
  };
  const rootCauseType = map[cat] ?? "other";
  return {
    rootCauseType,
    rootCause: `Session failed with category "${cat}". ${outcome.outcomeSummary || "No summary."}`,
    contributingFactors: [cat],
    durableLesson: `When facing "${cat}", pause and re-validate assumptions before retrying.`,
    preventionRule: `Add an explicit pre-check for ${cat} conditions before committing to the plan.`,
  };
}

/**
 * Produce a deep reflection for a single failed session outcome and persist it.
 * Uses an LLM root-cause pass, falling back to heuristics when unavailable.
 */
export async function reflectOnOutcome(
  outcome: SessionOutcome,
): Promise<ReflectionResult | null> {
  const bot = primaryBot(outcome);
  if (!bot) return null;

  // Skip if we already reflected on this session.
  const [already] = await db
    .select({ id: botReflectionsTable.id })
    .from(botReflectionsTable)
    .where(eq(botReflectionsTable.sessionId, outcome.sessionId))
    .limit(1);
  if (already) return null;

  let diagnosis = heuristicReflection(outcome);
  let confidence = 0.55;

  try {
    const result = await callWithFallback({
      model: "gpt-5-mini",
      temperature: 0.2,
      maxCompletionTokens: 600,
      messages: [
        {
          role: "system",
          content:
            "You are the reflective post-mortem analyst for an autonomous agent. " +
            "Diagnose the ROOT CAUSE of the failure (not just symptoms) and distil ONE durable, " +
            "reusable prevention lesson. Respond ONLY as JSON: " +
            `{"rootCauseType": one of ${ROOT_CAUSE_TYPES.join("|")}, ` +
            '"rootCause": string, "contributingFactors": string[], ' +
            '"durableLesson": string, "preventionRule": string, "confidence": number 0..1}.',
        },
        {
          role: "user",
          content:
            `Failure category: ${outcome.failureCategory ?? "n/a"}\n` +
            `Termination reason: ${outcome.terminationReason ?? "n/a"}\n` +
            `Department: ${outcome.department ?? "n/a"}\n` +
            `Loop iterations: ${outcome.loopIterations ?? "n/a"}\n` +
            `Tools executed: ${JSON.stringify(outcome.toolsExecuted ?? {})}\n` +
            `Summary: ${outcome.outcomeSummary || "n/a"}`,
        },
      ],
    });
    const content = result.completion.choices[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Partial<typeof diagnosis> & {
        confidence?: number;
      };
      const rct = ROOT_CAUSE_TYPES.includes(parsed.rootCauseType as RootCauseType)
        ? (parsed.rootCauseType as RootCauseType)
        : diagnosis.rootCauseType;
      diagnosis = {
        rootCauseType: rct,
        rootCause: parsed.rootCause || diagnosis.rootCause,
        contributingFactors: Array.isArray(parsed.contributingFactors)
          ? parsed.contributingFactors
          : diagnosis.contributingFactors,
        durableLesson: parsed.durableLesson || diagnosis.durableLesson,
        preventionRule: parsed.preventionRule || diagnosis.preventionRule,
      };
      if (typeof parsed.confidence === "number") {
        confidence = Math.max(0, Math.min(1, parsed.confidence));
      }
    }
  } catch (err) {
    console.warn("[self-actualization] reflection LLM failed, using heuristic:", err);
  }

  // Persist a durable lesson into GAA memory (reinforceable → promotable to cold).
  let memoryId: number | null = null;
  try {
    const mem = await remember({
      key: `reflection:bot${bot.botId}:${diagnosis.rootCauseType}`,
      content: diagnosis.rootCause,
      lesson: diagnosis.durableLesson,
      scope: outcome.clientId ? "client" : "platform",
      clientId: outcome.clientId ?? null,
      confidence: Math.round(confidence * 100),
    });
    memoryId = mem.id;
  } catch (err) {
    console.warn("[self-actualization] reflection memory write failed:", err);
  }

  const [row] = await db
    .insert(botReflectionsTable)
    .values({
      botId: bot.botId,
      clientId: outcome.clientId ?? null,
      sessionId: outcome.sessionId,
      taskCategory: bot.department,
      failureCategory: outcome.failureCategory ?? outcome.terminationReason ?? null,
      rootCauseType: diagnosis.rootCauseType,
      rootCause: diagnosis.rootCause,
      contributingFactors: diagnosis.contributingFactors,
      durableLesson: diagnosis.durableLesson,
      preventionRule: diagnosis.preventionRule,
      confidence,
      memoryId,
    })
    .returning();

  return {
    reflectionId: row.id,
    botId: bot.botId,
    rootCauseType: diagnosis.rootCauseType,
    rootCause: diagnosis.rootCause,
    durableLesson: diagnosis.durableLesson,
  };
}

/**
 * Find recent significant failures lacking a reflection and reflect on them.
 * Significant = a failureCategory or a non-success terminationReason is present.
 */
export async function runDeepReflection(opts: {
  windowHours?: number;
  limit?: number;
} = {}): Promise<ReflectionResult[]> {
  const windowHours = opts.windowHours ?? 24;
  const limit = opts.limit ?? 10;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(sessionOutcomesTable)
    .where(
      and(
        gte(sessionOutcomesTable.createdAt, since),
        isNotNull(sessionOutcomesTable.failureCategory),
        sql`${sessionOutcomesTable.failureCategory} <> ''`,
      ),
    )
    .orderBy(desc(sessionOutcomesTable.createdAt))
    .limit(limit);

  const results: ReflectionResult[] = [];
  for (const outcome of candidates) {
    try {
      const r = await reflectOnOutcome(outcome);
      if (r) results.push(r);
    } catch (err) {
      console.warn("[self-actualization] reflection failed for session", outcome.sessionId, err);
    }
  }
  return results;
}

/** Recent reflections for the console surface. */
export async function listReflections(limit = 50) {
  return db
    .select()
    .from(botReflectionsTable)
    .orderBy(desc(botReflectionsTable.createdAt))
    .limit(limit);
}
