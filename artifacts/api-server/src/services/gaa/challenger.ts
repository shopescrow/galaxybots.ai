import { callWithFallback } from "../ai-safety/model-fallback";

// ---------------------------------------------------------------------------
// Adversarial self-probing ("red team") pass. Before a high-stakes plan is
// executed, a challenger critiques it for hidden risks, compliance gaps and
// failure modes. If it finds a blocking risk, execution is halted/escalated.
// Falls back to heuristics when the LLM is unavailable.
// ---------------------------------------------------------------------------

export interface ChallengeInput {
  title: string;
  description?: string | null;
  toolName?: string | null;
  reversibilityScore?: number | null;
  riskScore?: number | null;
  involvesPii?: boolean;
}

export interface ChallengeResult {
  blocking: boolean;
  risks: string[];
  recommendation: string;
  method: "llm" | "heuristic";
}

function heuristicChallenge(input: ChallengeInput): ChallengeResult {
  const risks: string[] = [];
  if ((input.reversibilityScore ?? 100) < 25)
    risks.push("Action appears irreversible with no clear undo path.");
  if ((input.riskScore ?? 0) >= 75)
    risks.push("Risk score is high; blast radius may be large.");
  if (input.involvesPii)
    risks.push("Plan touches PII — verify purpose-limitation and minimisation.");

  const blocking = risks.length > 0 && (input.reversibilityScore ?? 100) < 25;
  return {
    blocking,
    risks,
    recommendation: blocking
      ? "Escalate to a human before execution."
      : "Proceed with monitoring.",
    method: "heuristic",
  };
}

export async function runChallenger(
  input: ChallengeInput,
): Promise<ChallengeResult> {
  try {
    const result = await callWithFallback({
      model: "gpt-5-mini",
      temperature: 0.3,
      maxCompletionTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You are the adversarial challenger for an autonomous agent. Critique the " +
            "proposed plan for hidden risks, irreversibility, compliance/privacy gaps, " +
            "and failure modes. Be concise and skeptical. Respond ONLY as JSON: " +
            '{"blocking":boolean,"risks":string[],"recommendation":string}. ' +
            "Set blocking=true only if the plan should NOT proceed without human approval.",
        },
        {
          role: "user",
          content:
            `Plan: ${input.title}\n` +
            `Details: ${input.description ?? "n/a"}\n` +
            `Tool: ${input.toolName ?? "n/a"}\n` +
            `Reversibility: ${input.reversibilityScore ?? "n/a"}/100, Risk: ${input.riskScore ?? "n/a"}/100\n` +
            `Involves PII: ${input.involvesPii ? "yes" : "no"}`,
        },
      ],
    });
    const content = result.completion.choices[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return heuristicChallenge(input);
    const parsed = JSON.parse(match[0]) as {
      blocking: boolean;
      risks: string[];
      recommendation: string;
    };
    return {
      blocking: Boolean(parsed.blocking),
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      recommendation: parsed.recommendation || "Proceed with monitoring.",
      method: "llm",
    };
  } catch {
    return heuristicChallenge(input);
  }
}
