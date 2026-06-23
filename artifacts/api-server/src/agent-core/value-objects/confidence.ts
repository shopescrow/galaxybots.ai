export type BeliefCategory =
  | "market_conditions"
  | "client_facts"
  | "competitor_intel"
  | "product_knowledge"
  | "relationship_dynamics"
  | "operational";

export const CATEGORY_HALF_LIFE_DAYS: Record<BeliefCategory, number> = {
  market_conditions: 14,
  client_facts: 365,
  competitor_intel: 30,
  product_knowledge: 90,
  relationship_dynamics: 60,
  operational: 7,
};

export const CONFIDENCE_FLOOR = 0.01;

export class Confidence {
  private readonly _value: number;

  private constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error(`Confidence value must be between 0 and 1, got ${value}`);
    }
    this._value = value;
  }

  static of(value: number): Confidence {
    return new Confidence(Math.max(0, Math.min(1, value)));
  }

  static zero(): Confidence {
    return new Confidence(0);
  }

  static full(): Confidence {
    return new Confidence(1);
  }

  get value(): number {
    return this._value;
  }

  decay(factor = 0.1): Confidence {
    return Confidence.of(this._value * (1 - factor));
  }

  /**
   * Temporal exponential decay using half-life formula:
   *   C(t) = C0 * exp(-ln(2) / halfLife * daysElapsed)
   * Floors at CONFIDENCE_FLOOR (1%) so beliefs never fully vanish.
   */
  decayByHalfLife(halfLifeDays: number, daysElapsed: number): Confidence {
    if (daysElapsed <= 0) return this;
    const decayFactor = Math.exp((-Math.LN2 / halfLifeDays) * daysElapsed);
    const decayed = this._value * decayFactor;
    return Confidence.of(Math.max(CONFIDENCE_FLOOR, decayed));
  }

  /**
   * Decay using a named category's preset half-life.
   */
  decayForCategory(
    category: BeliefCategory,
    daysElapsed: number,
  ): Confidence {
    return this.decayByHalfLife(
      CATEGORY_HALF_LIFE_DAYS[category],
      daysElapsed,
    );
  }

  /**
   * Reinforce belief with new evidence.
   * evidenceStrength: 0.0–1.0 scale of how strong the new evidence is.
   * Uses a Bayesian-inspired update that pulls toward 1.0 proportionally.
   */
  reinforce(evidenceStrength = 0.1): Confidence {
    return Confidence.of(
      Math.min(1, this._value + evidenceStrength * (1 - this._value)),
    );
  }

  meetsThreshold(threshold: number): boolean {
    return this._value >= threshold;
  }

  toNumber(): number {
    return this._value;
  }

  toPercent(): number {
    return Math.round(this._value * 100);
  }

  toString(): string {
    return `Confidence(${(this._value * 100).toFixed(1)}%)`;
  }

  /**
   * Compute the absolute delta this update would cause.
   */
  deltaTo(next: Confidence): number {
    return Math.abs(next._value - this._value);
  }
}
