import {
  db,
  practiceRunsTable,
  botsTable,
  type BotCapabilityModel,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { callWithFallback } from "../../ai-safety/model-fallback";
import { ModelCapability, resolveCapability } from "../../ai-safety/model-router";
import { remember } from "../memory-tiers";
import { getWeakestCategories } from "./capability-model";
import { checkFidelity, checkMargin } from "./guardrails";
import { getPracticeBudgetCents, getPracticeMaxRunsPerCycle, isKillSwitchActive } from "./config";

// ---------------------------------------------------------------------------
// Self-directed practice loop. The agent identifies its weakest task
// categories and rehearses them in a sandbox (no real-world side effects):
// it generates a representative practice task, attempts a baseline solution,
// then a deliberately-improved attempt, and grades both. Only gains that pass
// the fidelity guardrail AND clear the margin/cost guard are adopted as a
// durable lesson. The whole loop is bounded by a per-cycle cost budget and a
// global kill switch.
// ---------------------------------------------------------------------------

// Rough cost estimate per practice run (generation + two attempts + grading).
const EST_COST_PER_RUN_CENTS = 6;

export interface PracticeOutcome {
  botId: number;
  taskCategory: string;
  baselineScore: number;
  practiceScore: number;
  improvement: number;
  adopted: boolean;
  passedFidelity: boolean;
  costCents: number;
}

interface GradedAttempt {
  task: string;
  baselineScore: number;
  practiceScore: number;
  distilledLesson: string;
  notes: string;
}

async function runSandboxPractice(
  botName: string,
  taskCategory: string,
): Promise<GradedAttempt | null> {
  try {
    const result = await callWithFallback({
      model: resolveCapability(ModelCapability.REASONING_EFFICIENT),
      temperature: 0.4,
      maxCompletionTokens: 900,
      messages: [
        {
          role: "system",
          content:
            "You are a training simulator for an autonomous business agent. " +
            `Generate ONE realistic practice task in the "${taskCategory}" domain, then produce two ` +
            "solution attempts: a 'baseline' (typical first attempt) and a 'practice' (improved, after " +
            "deliberate reflection on common mistakes). Grade BOTH attempts 0..1 on quality/correctness, " +
            "being a strict, calibrated grader. Distil the single most useful improvement as a reusable lesson. " +
            'Respond ONLY as JSON: {"task": string, "baselineScore": number, "practiceScore": number, ' +
            '"distilledLesson": string, "notes": string}.',
        },
        {
          role: "user",
          content: `Agent: ${botName}. Practice domain: ${taskCategory}. Generate and grade now.`,
        },
      ],
    });
    const content = result.completion.choices[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<GradedAttempt>;
    if (
      typeof parsed.baselineScore !== "number" ||
      typeof parsed.practiceScore !== "number"
    ) {
      return null;
    }
    return {
      task: parsed.task || `${taskCategory} practice task`,
      baselineScore: Math.max(0, Math.min(1, parsed.baselineScore)),
      practiceScore: Math.max(0, Math.min(1, parsed.practiceScore)),
      distilledLesson: parsed.distilledLesson || "",
      notes: parsed.notes || "",
    };
  } catch (err) {
    console.warn("[self-actualization] sandbox practice failed:", err);
    return null;
  }
}

async function practiceOneCategory(
  botId: number,
  botName: string,
  cap: BotCapabilityModel,
  budgetCents: number,
): Promise<PracticeOutcome | null> {
  const graded = await runSandboxPractice(botName, cap.taskCategory);
  if (!graded) return null;

  const costCents = EST_COST_PER_RUN_CENTS;
  const fidelity = checkFidelity(graded.baselineScore, graded.practiceScore);
  const margin = checkMargin({
    baseline: graded.baselineScore,
    candidate: graded.practiceScore,
    costCents,
    budgetCents,
  });
  const improvement = graded.practiceScore - graded.baselineScore;
  // Adopt only if it does not degrade fidelity AND clears the margin/cost guard.
  const adopted = fidelity.passed && margin.passed && graded.distilledLesson.length > 0;

  const [row] = await db
    .insert(practiceRunsTable)
    .values({
      botId,
      clientId: cap.clientId ?? null,
      taskCategory: cap.taskCategory,
      practiceTask: graded.task,
      source: "generated",
      baselineScore: graded.baselineScore,
      practiceScore: graded.practiceScore,
      improvement,
      costCents,
      passedFidelity: fidelity.passed,
      adopted,
      distilledLesson: graded.distilledLesson || null,
      notes: `${margin.reason}. ${graded.notes}`.trim(),
    })
    .returning();

  if (adopted) {
    try {
      await remember({
        key: `practice:bot${botId}:${cap.taskCategory}`,
        content: `Practice gain on ${cap.taskCategory}: ${graded.task}`,
        lesson: graded.distilledLesson,
        scope: cap.clientId ? "client" : "platform",
        clientId: cap.clientId ?? null,
        confidence: 60,
      });
    } catch (err) {
      console.warn("[self-actualization] practice lesson write failed:", err);
    }
  }

  void row;
  return {
    botId,
    taskCategory: cap.taskCategory,
    baselineScore: graded.baselineScore,
    practiceScore: graded.practiceScore,
    improvement,
    adopted,
    passedFidelity: fidelity.passed,
    costCents,
  };
}

/**
 * Run one cycle of self-directed practice across the weakest capabilities of
 * the most-active bots, bounded by a global cost budget and kill switch.
 */
export async function runPracticeLoop(opts: {
  maxBots?: number;
} = {}): Promise<PracticeOutcome[]> {
  if (await isKillSwitchActive()) {
    console.log("[self-actualization] kill switch active — skipping practice loop");
    return [];
  }

  const budgetCents = await getPracticeBudgetCents();
  const maxRuns = await getPracticeMaxRunsPerCycle();
  const maxBots = opts.maxBots ?? 4;

  const bots = await db
    .select({ id: botsTable.id, name: botsTable.name })
    .from(botsTable)
    .orderBy(desc(botsTable.id))
    .limit(maxBots);

  const outcomes: PracticeOutcome[] = [];
  let spent = 0;
  let runs = 0;

  for (const bot of bots) {
    if (runs >= maxRuns || spent + EST_COST_PER_RUN_CENTS > budgetCents) break;
    const weak = await getWeakestCategories(bot.id, { limit: 1 });
    if (weak.length === 0) continue;

    const remaining = budgetCents - spent;
    const outcome = await practiceOneCategory(bot.id, bot.name, weak[0], remaining);
    if (outcome) {
      outcomes.push(outcome);
      spent += outcome.costCents;
      runs++;
    }
  }

  console.log(
    `[self-actualization] practice loop: ${runs} runs, ${outcomes.filter((o) => o.adopted).length} adopted, ${spent}/${budgetCents}c spent`,
  );
  return outcomes;
}

/** Recent practice runs for the console surface. */
export async function listPracticeRuns(limit = 50) {
  return db
    .select()
    .from(practiceRunsTable)
    .orderBy(desc(practiceRunsTable.createdAt))
    .limit(limit);
}
