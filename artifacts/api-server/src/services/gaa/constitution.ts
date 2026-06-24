import {
  db,
  gaaConstitutionTable,
  type GaaConstitutionPrinciple,
} from "@workspace/db";
import { eq, asc } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GAA Constitution — the ordered set of inviolable principles that every plan
// is checked against at plan-time, before the KiloPro gate and execution.
// ---------------------------------------------------------------------------

export interface ConstitutionCheckInput {
  title: string;
  description?: string | null;
  toolName?: string | null;
  purpose?: string | null;
  reversibilityScore?: number | null;
  involvesPii?: boolean;
}

export interface ConstitutionViolation {
  principleId: number;
  principle: string;
  category: string;
  severity: string;
}

export interface ConstitutionCheckResult {
  passed: boolean;
  violations: ConstitutionViolation[];
  evaluated: number;
}

// The seed constitution. Lower ordinal = higher precedence.
export const SEED_CONSTITUTION: Array<{
  ordinal: number;
  principle: string;
  category: string;
  severity: string;
  rationale: string;
}> = [
  {
    ordinal: 10,
    principle:
      "Never take an irreversible action without explicit human approval.",
    category: "reversibility",
    severity: "hard",
    rationale:
      "Irreversible side effects cannot be undone by the action ledger and must be gated by a human.",
  },
  {
    ordinal: 20,
    principle:
      "All data processing must have a declared, lawful purpose and respect purpose-limitation (no using data beyond its stated purpose).",
    category: "privacy",
    severity: "hard",
    rationale: "KiloPro / GDPR purpose-limitation compliance.",
  },
  {
    ordinal: 30,
    principle:
      "PII may only be accessed when the goal's purpose requires it and a compliance record exists.",
    category: "privacy",
    severity: "hard",
    rationale: "Minimise PII exposure; enforce data minimisation.",
  },
  {
    ordinal: 40,
    principle:
      "Every plan must pass the KiloPro compliance gate before any tool is executed.",
    category: "kilopro",
    severity: "hard",
    rationale: "Compliance is enforced at plan-time, never after the fact.",
  },
  {
    ordinal: 50,
    principle:
      "Respect per-goal cost envelopes; never exceed an allocated budget without escalation.",
    category: "oversight",
    severity: "hard",
    rationale: "Budget governance prevents runaway autonomous spend.",
  },
  {
    ordinal: 60,
    principle:
      "Stay on brand: never produce communications that contradict the GalaxyBots brand voice or mislead clients.",
    category: "brand",
    severity: "soft",
    rationale: "Brand integrity and client trust.",
  },
  {
    ordinal: 70,
    principle:
      "Prefer the most reversible path that achieves the goal; escalate when no reversible path exists.",
    category: "reversibility",
    severity: "soft",
    rationale: "Reversibility-first execution.",
  },
  {
    ordinal: 80,
    principle:
      "Surface uncertainty and conflicts to humans rather than guessing on high-stakes decisions.",
    category: "oversight",
    severity: "soft",
    rationale: "Human oversight on ambiguous, high-impact calls.",
  },
];

export async function seedConstitution(): Promise<number> {
  const existing = await db.select().from(gaaConstitutionTable).limit(1);
  if (existing.length > 0) return 0;

  await db.insert(gaaConstitutionTable).values(
    SEED_CONSTITUTION.map((p) => ({
      ordinal: p.ordinal,
      principle: p.principle,
      category: p.category,
      severity: p.severity,
      rationale: p.rationale,
      lastReviewedAt: new Date(),
    })),
  );
  return SEED_CONSTITUTION.length;
}

export interface ConstitutionDrift {
  drifted: boolean;
  missing: string[]; // canonical principles absent from the live constitution
  severityChanged: Array<{ principle: string; expected: string; actual: string }>;
  deactivated: string[]; // canonical principles present but switched off
  extra: string[]; // live hard principles with no canonical counterpart
}

/**
 * Weekly drift detector: compares the live constitution (DB) against the
 * canonical seed policy and reports divergence. Used by the scheduled
 * governance job so silent edits / deactivations of inviolable principles are
 * surfaced for human review rather than going unnoticed.
 */
export async function detectConstitutionDrift(): Promise<ConstitutionDrift> {
  const live = await db.select().from(gaaConstitutionTable);
  const byPrinciple = new Map(live.map((p) => [p.principle, p]));

  const missing: string[] = [];
  const severityChanged: ConstitutionDrift["severityChanged"] = [];
  const deactivated: string[] = [];

  for (const canon of SEED_CONSTITUTION) {
    const actual = byPrinciple.get(canon.principle);
    if (!actual) {
      missing.push(canon.principle);
      continue;
    }
    if (actual.severity !== canon.severity) {
      severityChanged.push({
        principle: canon.principle,
        expected: canon.severity,
        actual: actual.severity,
      });
    }
    if (!actual.isActive) deactivated.push(canon.principle);
  }

  const canonical = new Set(SEED_CONSTITUTION.map((p) => p.principle));
  const extra = live
    .filter((p) => p.isActive && p.severity === "hard" && !canonical.has(p.principle))
    .map((p) => p.principle);

  const drifted =
    missing.length > 0 ||
    severityChanged.length > 0 ||
    deactivated.length > 0 ||
    extra.length > 0;

  return { drifted, missing, severityChanged, deactivated, extra };
}

export async function getConstitution(): Promise<GaaConstitutionPrinciple[]> {
  return db
    .select()
    .from(gaaConstitutionTable)
    .where(eq(gaaConstitutionTable.isActive, true))
    .orderBy(asc(gaaConstitutionTable.ordinal));
}

const IRREVERSIBLE_TOOL_HINTS = [
  "delete",
  "remove",
  "purge",
  "send_email",
  "send_sms",
  "publish",
  "charge",
  "payment",
  "refund",
  "deploy",
  "terminate",
  "cancel_subscription",
];

function looksIrreversible(input: ConstitutionCheckInput): boolean {
  const haystack = `${input.toolName ?? ""} ${input.title} ${input.description ?? ""}`.toLowerCase();
  return IRREVERSIBLE_TOOL_HINTS.some((h) => haystack.includes(h));
}

/**
 * Evaluate a planned action against the active constitution. Returns the set of
 * violations; a hard violation means the plan must NOT proceed.
 */
export async function checkConstitution(
  input: ConstitutionCheckInput,
): Promise<ConstitutionCheckResult> {
  const principles = await getConstitution();
  const violations: ConstitutionViolation[] = [];

  const irreversible =
    looksIrreversible(input) ||
    (typeof input.reversibilityScore === "number" &&
      input.reversibilityScore < 25);

  for (const p of principles) {
    let violated = false;

    switch (p.category) {
      case "reversibility":
        if (p.severity === "hard" && irreversible) violated = true;
        break;
      case "privacy":
        // Hard privacy principles are violated when PII is involved but no
        // declared purpose exists.
        if (p.severity === "hard" && input.involvesPii && !input.purpose) {
          violated = true;
        }
        break;
      case "kilopro":
        // Enforced by the compliance gate; constitution flags missing purpose.
        if (p.severity === "hard" && input.involvesPii && !input.purpose) {
          violated = true;
        }
        break;
      default:
        violated = false;
    }

    if (violated) {
      violations.push({
        principleId: p.id,
        principle: p.principle,
        category: p.category,
        severity: p.severity,
      });
    }
  }

  const hardViolations = violations.filter((v) => v.severity === "hard");
  return {
    passed: hardViolations.length === 0,
    violations,
    evaluated: principles.length,
  };
}
