import { openai } from "@workspace/integrations-openai-ai-server";

/**
 * Independent quality judge for the model-router reward signal.
 *
 * The core anti-gaming principle: a model's quality contribution to the reward
 * blend MUST be scored by an entity other than the model being evaluated.
 * This module uses a fixed judge model (gpt-4o-mini) that is intentionally
 * kept OUT of both FRONTIER_CANDIDATE_MODELS and EFFICIENT_CANDIDATE_MODELS in
 * model-router.ts. A startup assertion in model-router.ts enforces this
 * invariant at boot so it cannot silently regress.
 *
 * The judge evaluates:
 *   1. Correctness/factuality relative to the prompt.
 *   2. Completeness — did it address the intent?
 *   3. Conciseness — no unnecessary padding.
 *
 * Returns a score in [0,1]. Falls back to 0.5 on any error so a judge outage
 * degrades gracefully rather than poisoning the reward with zeros or blocking
 * the outcome path.
 */

/**
 * The judge model. MUST NOT appear in FRONTIER_CANDIDATE_MODELS or
 * EFFICIENT_CANDIDATE_MODELS. model-router.ts asserts this on startup.
 * Change this constant only in lockstep with verifying it is absent from
 * both candidate lists.
 */
export const JUDGE_MODEL = "gpt-4o-mini";
const JUDGE_MAX_TOKENS = 80;

export interface JudgeResult {
  score: number;
  judgeModel: string;
  latencyMs: number;
}

const JUDGE_SYSTEM_PROMPT = `You are an independent quality evaluator for AI model responses. 
Evaluate the response on three axes:
1. Correctness: Does it accurately address the prompt? (0-1)
2. Completeness: Does it cover the full intent? (0-1) 
3. Conciseness: Is it appropriately focused without padding? (0-1)

Return ONLY a single JSON object: {"score": <average of the three 0-1 scores>}
Never explain. Never include anything other than the JSON object.`;

/**
 * Score a (prompt, response) pair with an independent judge model.
 *
 * @param prompt     - The original user/system prompt.
 * @param response   - The response produced by the model under evaluation.
 * @param taskCategory - Used to set judge context (optional, improves specificity).
 * @returns JudgeResult with score in [0,1] and metadata.
 */
export async function scoreWithJudge(
  prompt: string,
  response: string,
  taskCategory?: string,
): Promise<JudgeResult> {
  const start = Date.now();
  try {
    const contextNote = taskCategory ? ` The task category is: ${taskCategory}.` : "";
    const completion = await openai.chat.completions.create({
      model: JUDGE_MODEL,
      max_completion_tokens: JUDGE_MAX_TOKENS,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `PROMPT:
${prompt.slice(0, 1500)}

RESPONSE:
${response.slice(0, 2000)}${contextNote}

Evaluate and return JSON.`,
        },
      ],
    });

    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    const parsed = JSON.parse(raw);
    const score = typeof parsed?.score === "number" ? parsed.score : 0.5;
    return {
      score: Math.min(1, Math.max(0, score)),
      judgeModel: JUDGE_MODEL,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    console.warn("[RewardJudge] judge scoring failed (using fallback 0.5):", err instanceof Error ? err.message : err);
    return { score: 0.5, judgeModel: JUDGE_MODEL, latencyMs: Date.now() - start };
  }
}

/**
 * Blend self-reported quality with the independent judge score.
 *
 * The self-reported score comes from session outcome signals (e.g., task
 * completion). The judge score is the independent assessment. A 60/40
 * judge/self-report blend reduces manipulation surface while keeping session
 * signals (which capture user intent) in the mix.
 *
 * If judge scoring is unavailable (judgeScore null), falls back to self-report.
 */
export function blendQualitySignals(selfReportedQuality: number, judgeScore: number | null): number {
  if (judgeScore == null) return Math.min(1, Math.max(0, selfReportedQuality));
  const blended = 0.6 * judgeScore + 0.4 * selfReportedQuality;
  return Math.min(1, Math.max(0, blended));
}
