import { db, goldenPromptsTable, goldenEvalRunsTable } from "@workspace/db";
import { eq, and, avg, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { JUDGE_MODEL, scoreWithJudge } from "./reward-judge";
import { FRONTIER_CANDIDATE_MODELS, EFFICIENT_CANDIDATE_MODELS } from "./model-router";
import { writeAuditEntry } from "../audit/audit-ledger";
import crypto from "crypto";

/**
 * Golden-prompt regression evaluator.
 *
 * Runs every active golden prompt through a fixed set of candidate models,
 * scores each response with the independent judge (never the model under test),
 * stores results, and flags regressions when a model's mean judge score drops
 * by more than REGRESSION_THRESHOLD vs the previous run.
 *
 * Designed to be called:
 *   1. On demand via the admin API (owner-triggered).
 *   2. On a weekly schedule from the model-reputation job.
 */

const REGRESSION_THRESHOLD = 0.05;
const MAX_RESPONSE_TOKENS = 512;
const ALL_CANDIDATE_MODELS = [...new Set([...FRONTIER_CANDIDATE_MODELS, ...EFFICIENT_CANDIDATE_MODELS])];

/**
 * Run all active golden prompts against candidate models and persist results.
 * Returns a summary of pass rates and any models that regressed.
 */
export async function runGoldenEval(triggeredBy: "scheduler" | "admin" | "on_demand" = "scheduler"): Promise<{
  runId: string;
  promptsEvaluated: number;
  modelsEvaluated: number;
  results: Array<{ model: string; meanJudgeScore: number; regressionFlag: boolean }>;
}> {
  const runId = crypto.randomUUID();
  const prompts = await db
    .select()
    .from(goldenPromptsTable)
    .where(eq(goldenPromptsTable.active, true));

  if (prompts.length === 0) {
    return { runId, promptsEvaluated: 0, modelsEvaluated: 0, results: [] };
  }

  const modelScores: Map<string, number[]> = new Map();
  const modelRegressions: Map<string, boolean> = new Map();

  for (const model of ALL_CANDIDATE_MODELS) {
    modelScores.set(model, []);
  }

  for (const prompt of prompts) {
    for (const model of ALL_CANDIDATE_MODELS) {
      const result = await evaluateSinglePrompt(runId, prompt, model, triggeredBy);
      if (result.judgeScore != null) {
        modelScores.get(model)!.push(result.judgeScore);
      }
    }
  }

  for (const model of ALL_CANDIDATE_MODELS) {
    const scores = modelScores.get(model) ?? [];
    if (scores.length === 0) continue;
    const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const regressed = await checkRegression(model, meanScore);
    modelRegressions.set(model, regressed);

    if (regressed) {
      await writeAuditEntry({
        clientId: null,
        engine: "model_router",
        decisionType: "model_selection",
        payload: {
          action: "golden_eval_regression",
          runId,
          model,
          meanJudgeScore: meanScore,
          regressionThreshold: REGRESSION_THRESHOLD,
          triggeredBy,
        },
      }).catch(() => {});
      console.warn(`[GoldenEval] REGRESSION detected for ${model}: mean judge score=${meanScore.toFixed(3)}`);
    }
  }

  await markRegressions(runId, modelRegressions);

  const results = Array.from(modelScores.entries())
    .filter(([, scores]) => scores.length > 0)
    .map(([model, scores]) => ({
      model,
      meanJudgeScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      regressionFlag: modelRegressions.get(model) ?? false,
    }));

  console.log(`[GoldenEval] run ${runId} complete: ${prompts.length} prompts × ${results.length} models`);
  return { runId, promptsEvaluated: prompts.length, modelsEvaluated: results.length, results };
}

async function evaluateSinglePrompt(
  runId: string,
  prompt: typeof goldenPromptsTable.$inferSelect,
  model: string,
  triggeredBy: string,
): Promise<{ judgeScore: number | null; latencyMs: number }> {
  const start = Date.now();
  let responseText = "";
  let status = "pending";
  let errorMessage: string | undefined;
  let judgeScore: number | null = null;
  let judgeModel: string | undefined;

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_completion_tokens: MAX_RESPONSE_TOKENS,
      messages: [{ role: "user", content: prompt.prompt }],
    });
    responseText = completion.choices[0]?.message?.content ?? "";
    status = "scored";
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    console.warn(`[GoldenEval] model ${model} failed on prompt ${prompt.id}:`, errorMessage);
  }

  const latencyMs = Date.now() - start;

  if (status === "scored" && responseText) {
    try {
      const judgeResult = await scoreWithJudge(prompt.prompt, responseText, prompt.taskCategory);
      judgeScore = judgeResult.score;
      judgeModel = judgeResult.judgeModel;
      if (prompt.idealResponse) {
        const idealResult = await scoreWithJudge(
          `How similar is this to the ideal response?\nIDEAL: ${prompt.idealResponse}\nACTUAL: ${responseText}`,
          responseText,
          prompt.taskCategory,
        );
        judgeScore = 0.5 * judgeScore + 0.5 * idealResult.score;
      }
    } catch (err) {
      console.warn(`[GoldenEval] judge scoring failed for ${model} on prompt ${prompt.id}:`, err instanceof Error ? err.message : err);
    }
  }

  try {
    await db.insert(goldenEvalRunsTable).values({
      runId,
      triggeredBy,
      promptId: prompt.id,
      taskCategory: prompt.taskCategory,
      difficulty: prompt.difficulty,
      model,
      judgeScore,
      judgeModel: judgeModel ?? JUDGE_MODEL,
      latencyMs,
      status,
      errorMessage: errorMessage ?? null,
    });
  } catch (err) {
    console.warn("[GoldenEval] failed to persist eval row:", err instanceof Error ? err.message : err);
  }

  return { judgeScore, latencyMs };
}

/**
 * Check if this model's mean score regressed vs the previous eval run.
 * Returns true if the drop exceeds REGRESSION_THRESHOLD.
 */
async function checkRegression(model: string, currentMean: number): Promise<boolean> {
  try {
    const prior = await db
      .select({
        runId: goldenEvalRunsTable.runId,
        meanScore: avg(goldenEvalRunsTable.judgeScore),
      })
      .from(goldenEvalRunsTable)
      .where(
        and(
          eq(goldenEvalRunsTable.model, model),
          eq(goldenEvalRunsTable.status, "scored"),
        ),
      )
      .groupBy(goldenEvalRunsTable.runId)
      .orderBy(sql`max(${goldenEvalRunsTable.createdAt}) desc`)
      .limit(2);

    if (prior.length < 2) return false;
    const prevMean = Number(prior[1]?.meanScore ?? currentMean);
    return (prevMean - currentMean) > REGRESSION_THRESHOLD;
  } catch {
    return false;
  }
}

async function markRegressions(runId: string, modelRegressions: Map<string, boolean>): Promise<void> {
  for (const [model, regressed] of modelRegressions) {
    if (!regressed) continue;
    try {
      await db
        .update(goldenEvalRunsTable)
        .set({ regressionFlag: true })
        .where(
          and(
            eq(goldenEvalRunsTable.runId, runId),
            eq(goldenEvalRunsTable.model, model),
          ),
        );
    } catch { }
  }
}

/**
 * Seed the default curated golden prompts when the table is empty.
 * Called once during server startup to ensure there are always prompts.
 */
export async function seedGoldenPromptsIfEmpty(): Promise<void> {
  try {
    const existing = await db.select({ id: goldenPromptsTable.id }).from(goldenPromptsTable).limit(1);
    if (existing.length > 0) return;

    const seeds = [
      {
        taskCategory: "research",
        difficulty: "medium",
        prompt: "Summarize the key benefits and risks of large language models in three concise bullet points.",
        idealResponse: "Should include accuracy/productivity benefits and hallucination/bias risks in 3 points.",
        scoringRubric: "Score 1.0 if exactly 3 bullets, each addressing a distinct benefit or risk.",
      },
      {
        taskCategory: "coding",
        difficulty: "easy",
        prompt: "Write a TypeScript function that returns the sum of all even numbers in an array.",
        idealResponse: "function sumEvens(arr: number[]): number { return arr.filter(n => n % 2 === 0).reduce((a, b) => a + b, 0); }",
        scoringRubric: "Score 1.0 if the function correctly filters even numbers and sums them.",
      },
      {
        taskCategory: "analysis",
        difficulty: "hard",
        prompt: "What are the main differences between UCB1 and Thompson Sampling bandit algorithms? Explain when you would prefer each.",
        idealResponse: "UCB1 is deterministic (confidence bounds), Thompson Sampling is Bayesian (posterior sampling). UCB1 is simpler; TS is better for non-stationary distributions.",
        scoringRubric: "Score 1.0 if both algorithms are correctly described and usage guidance is given.",
      },
      {
        taskCategory: "writing",
        difficulty: "easy",
        prompt: "Write a one-sentence professional email subject line for a meeting follow-up.",
        idealResponse: "Following Up: Action Items from Our Meeting",
        scoringRubric: "Score 1.0 if concise, professional, and clearly communicates meeting follow-up.",
      },
      {
        taskCategory: "coding",
        difficulty: "medium",
        prompt: "Explain what a database index is and why it improves query performance.",
        idealResponse: "An index is a data structure that allows faster row lookups by storing pre-sorted column values, avoiding full table scans.",
        scoringRubric: "Score 1.0 if the explanation covers data structure, lookup speed, and avoidance of full scans.",
      },
    ];

    for (const seed of seeds) {
      await db.insert(goldenPromptsTable).values(seed).onConflictDoNothing();
    }
    console.log(`[GoldenEval] seeded ${seeds.length} default golden prompts`);
  } catch (err) {
    console.warn("[GoldenEval] failed to seed golden prompts:", err instanceof Error ? err.message : err);
  }
}

/**
 * Get the latest golden eval results aggregated per model, with regression flags.
 */
export async function getLatestGoldenEvalResults(): Promise<Array<{
  model: string;
  runId: string;
  meanJudgeScore: number;
  promptCount: number;
  regressionFlag: boolean;
  runDate: Date;
}>> {
  try {
    const latestRunIds = await db
      .selectDistinctOn([goldenEvalRunsTable.model], {
        model: goldenEvalRunsTable.model,
        runId: goldenEvalRunsTable.runId,
        runDate: sql<Date>`max(${goldenEvalRunsTable.createdAt})`,
      })
      .from(goldenEvalRunsTable)
      .where(eq(goldenEvalRunsTable.status, "scored"))
      .groupBy(goldenEvalRunsTable.model, goldenEvalRunsTable.runId)
      .orderBy(goldenEvalRunsTable.model, sql`max(${goldenEvalRunsTable.createdAt}) desc`);

    if (latestRunIds.length === 0) return [];

    const results = [];
    for (const { model, runId, runDate } of latestRunIds) {
      const rows = await db
        .select({
          judgeScore: goldenEvalRunsTable.judgeScore,
          regressionFlag: goldenEvalRunsTable.regressionFlag,
        })
        .from(goldenEvalRunsTable)
        .where(
          and(
            eq(goldenEvalRunsTable.runId, runId),
            eq(goldenEvalRunsTable.model, model),
            eq(goldenEvalRunsTable.status, "scored"),
          ),
        );

      const scores = rows.map((r) => r.judgeScore ?? 0);
      const meanJudgeScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      const regressionFlag = rows.some((r) => r.regressionFlag);

      results.push({ model, runId, meanJudgeScore, promptCount: rows.length, regressionFlag, runDate });
    }
    return results;
  } catch (err) {
    console.warn("[GoldenEval] getLatestGoldenEvalResults failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
