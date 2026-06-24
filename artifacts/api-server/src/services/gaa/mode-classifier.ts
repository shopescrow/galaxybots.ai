// ---------------------------------------------------------------------------
// Risk / impact / mode classifier. Computes a reversibility score and decides
// which execution mode a goal (or planned action) should run under:
//   - autonomous: reversible, low-risk, in-budget — execute without humans.
//   - agenda:     medium risk/impact — queue for human review on a cadence.
//   - mission:    high risk/impact/irreversible — require explicit approval.
// ---------------------------------------------------------------------------

export type ExecutionMode = "autonomous" | "agenda" | "mission";

export interface ClassifierInput {
  title: string;
  description?: string | null;
  toolName?: string | null;
  involvesPii?: boolean;
  costCents?: number;
  costEnvelopeCents?: number;
  // Optional caller-supplied hints (0-100).
  impactScore?: number | null;
}

export interface ClassifierResult {
  mode: ExecutionMode;
  reversibilityScore: number; // 0 (irreversible) .. 100 (fully reversible)
  riskScore: number; // 0 (safe) .. 100 (dangerous)
  rationale: string;
}

const IRREVERSIBLE_HINTS: Array<[RegExp, number]> = [
  [/\b(delete|purge|drop|wipe|erase)\b/i, 5],
  [/\b(send|publish|post|broadcast|email|sms|notify)\b/i, 20],
  [/\b(charge|refund|payment|invoice|bill)\b/i, 10],
  [/\b(deploy|terminate|cancel|deactivate|suspend)\b/i, 15],
  [/\b(create|update|write|schedule|assign)\b/i, 60],
  [/\b(read|fetch|list|get|analyze|analyse|search|summari[sz]e)\b/i, 95],
];

function scoreReversibility(input: ClassifierInput): number {
  const haystack =
    `${input.toolName ?? ""} ${input.title} ${input.description ?? ""}`.toLowerCase();

  let score = 70; // neutral default
  for (const [re, value] of IRREVERSIBLE_HINTS) {
    if (re.test(haystack)) {
      score = value;
      break;
    }
  }
  // PII handling reduces reversibility (data exposure can't be un-seen).
  if (input.involvesPii) score = Math.min(score, 40);
  return Math.max(0, Math.min(100, score));
}

function scoreRisk(input: ClassifierInput, reversibility: number): number {
  let risk = 100 - reversibility; // less reversible => more risky
  if (input.involvesPii) risk += 15;

  const envelope = input.costEnvelopeCents ?? 0;
  const cost = input.costCents ?? 0;
  if (envelope > 0 && cost > 0) {
    const ratio = cost / envelope;
    if (ratio >= 1) risk += 25;
    else if (ratio >= 0.5) risk += 10;
  }
  if (typeof input.impactScore === "number") {
    risk = Math.round(risk * 0.6 + input.impactScore * 0.4);
  }
  return Math.max(0, Math.min(100, risk));
}

export function classify(input: ClassifierInput): ClassifierResult {
  const reversibilityScore = scoreReversibility(input);
  const riskScore = scoreRisk(input, reversibilityScore);

  let mode: ExecutionMode;
  let rationale: string;

  if (reversibilityScore < 25 || riskScore >= 75) {
    mode = "mission";
    rationale =
      "Irreversible or high-risk action — requires explicit human approval before execution.";
  } else if (riskScore >= 40 || reversibilityScore < 55) {
    mode = "agenda";
    rationale =
      "Medium risk/impact — queued for human review on the agenda cadence.";
  } else {
    mode = "autonomous";
    rationale =
      "Reversible and low-risk within budget — safe to execute autonomously.";
  }

  return { mode, reversibilityScore, riskScore, rationale };
}
