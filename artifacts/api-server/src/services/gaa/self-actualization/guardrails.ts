// ---------------------------------------------------------------------------
// Self-actualization guardrails. Two independent gates protect every promotion
// of an autonomously-learned change:
//   - Fidelity guardrail: the candidate must NOT degrade output quality versus
//     the established baseline beyond a small tolerance.
//   - Margin/cost guard: the change must clear a minimum net gain and stay
//     within its cost envelope, so we never "buy" tiny quality gains at large
//     compute cost.
// Both are pure functions so they can be unit-reasoned and reused by the
// practice loop, knowledge transfer, and self-modification shadow promotion.
// ---------------------------------------------------------------------------

// Candidate must be at least baseline - tolerance to be considered non-degrading.
export const FIDELITY_TOLERANCE = 0.02;
// Minimum absolute quality gain required to adopt a change.
export const MIN_MARGIN_GAIN = 0.03;
// Statistical-ish minimum sample before a shadow promotion is allowed.
export const MIN_SHADOW_SAMPLES = 8;

export interface FidelityResult {
  passed: boolean;
  delta: number;
  reason: string;
}

/**
 * Fidelity guardrail — blocks changes that degrade quality below the baseline.
 * `baseline` and `candidate` are quality scores in 0..1.
 */
export function checkFidelity(
  baseline: number,
  candidate: number,
  tolerance = FIDELITY_TOLERANCE,
): FidelityResult {
  const delta = candidate - baseline;
  if (candidate + 1e-9 < baseline - tolerance) {
    return {
      passed: false,
      delta,
      reason: `Fidelity violation: candidate ${candidate.toFixed(3)} degrades baseline ${baseline.toFixed(3)} beyond tolerance ${tolerance}`,
    };
  }
  return {
    passed: true,
    delta,
    reason: `Fidelity preserved (delta ${delta >= 0 ? "+" : ""}${delta.toFixed(3)})`,
  };
}

export interface MarginResult {
  passed: boolean;
  netGain: number;
  reason: string;
}

/**
 * Margin/cost guard — requires a minimum net quality gain and rejects changes
 * whose cost exceeds the allowed envelope. `costCents` / `budgetCents` are the
 * spend incurred producing the candidate and the cap respectively.
 */
export function checkMargin(params: {
  baseline: number;
  candidate: number;
  costCents: number;
  budgetCents: number;
  minGain?: number;
}): MarginResult {
  const { baseline, candidate, costCents, budgetCents } = params;
  const minGain = params.minGain ?? MIN_MARGIN_GAIN;
  const netGain = candidate - baseline;

  if (costCents > budgetCents) {
    return {
      passed: false,
      netGain,
      reason: `Cost guard: ${costCents}c exceeds budget ${budgetCents}c`,
    };
  }
  if (netGain < minGain) {
    return {
      passed: false,
      netGain,
      reason: `Margin guard: net gain ${netGain.toFixed(3)} below minimum ${minGain}`,
    };
  }
  return {
    passed: true,
    netGain,
    reason: `Margin cleared: +${netGain.toFixed(3)} within ${costCents}/${budgetCents}c`,
  };
}

export interface PromotionGate {
  approved: boolean;
  reasons: string[];
}

/**
 * Combined promotion gate used by shadow-promotion: a candidate must clear BOTH
 * the fidelity guardrail and the margin/cost guard, and have enough evidence.
 */
export function evaluatePromotion(params: {
  baseline: number;
  candidate: number;
  costCents: number;
  budgetCents: number;
  sampleN: number;
  minSamples?: number;
}): PromotionGate {
  const reasons: string[] = [];
  const fidelity = checkFidelity(params.baseline, params.candidate);
  const margin = checkMargin(params);
  const minSamples = params.minSamples ?? MIN_SHADOW_SAMPLES;
  const enoughEvidence = params.sampleN >= minSamples;

  reasons.push(fidelity.reason);
  reasons.push(margin.reason);
  if (!enoughEvidence) {
    reasons.push(
      `Insufficient evidence: ${params.sampleN}/${minSamples} samples`,
    );
  }

  return {
    approved: fidelity.passed && margin.passed && enoughEvidence,
    reasons,
  };
}
