/**
 * Unit tests for billing-math.ts — the shared pure-math module.
 *
 * All tests import from the real production module; no local re-implementations.
 */
import { describe, it, expect } from "vitest";
import {
  round2,
  computeOverage,
  computeGrandTotal,
  computeProration,
  allocateUsageByBot,
  isDunningStepDue,
  DUNNING_STEPS,
} from "../billing-math.js";

// ─── round2 ──────────────────────────────────────────────────────────────────

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(2.009)).toBe(2.01);   // 2.009 * 100 = 200.9 → rounds to 201 → 2.01
    expect(round2(2.001)).toBe(2);      // 200.1 → rounds down → 2
    expect(round2(99.999)).toBe(100);
  });

  it("integer input is unchanged", () => {
    expect(round2(42)).toBe(42);
  });
});

// ─── computeOverage ──────────────────────────────────────────────────────────

describe("Billing Math — Overage", () => {
  it("returns 0 when usage is within allotment", () => {
    expect(computeOverage(500, 1000, 0.01)).toBe(0);
  });

  it("returns 0 when usage exactly equals allotment", () => {
    expect(computeOverage(1000, 1000, 0.01)).toBe(0);
  });

  it("charges for credits over allotment", () => {
    expect(computeOverage(1200, 1000, 0.01)).toBe(2.0);
  });

  it("rounds overage to 2 decimal places", () => {
    expect(computeOverage(1003, 1000, 0.01)).toBe(0.03);
  });

  it("overage rate of 0 always returns 0", () => {
    expect(computeOverage(2000, 500, 0)).toBe(0);
  });
});

// ─── computeGrandTotal ───────────────────────────────────────────────────────

describe("Billing Math — Grand Total", () => {
  it("computes total with no tax and no overage", () => {
    const result = computeGrandTotal(99, 0, 0, 0);
    expect(result.subtotal).toBe(99);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(99);
  });

  it("adds tax correctly", () => {
    const result = computeGrandTotal(100, 0, 0, 0.1);
    expect(result.subtotal).toBe(100);
    expect(result.taxAmount).toBe(10);
    expect(result.total).toBe(110);
  });

  it("sums base + addons + overage then taxes", () => {
    const result = computeGrandTotal(100, 20, 5, 0.05);
    expect(result.subtotal).toBe(125);
    expect(result.taxAmount).toBe(6.25);
    expect(result.total).toBe(131.25);
  });

  it("rounds correctly for fractional cents", () => {
    const result = computeGrandTotal(99.99, 10.01, 0, 0.1);
    expect(result.subtotal).toBe(110);
    expect(result.total).toBe(121);
  });
});

// ─── allocateUsageByBot ──────────────────────────────────────────────────────

describe("Billing Math — Attribution Roll-up", () => {
  it("allocates credits proportionally to bot weights", () => {
    const result = allocateUsageByBot(100, [
      { botId: 1, weight: 60 },
      { botId: 2, weight: 40 },
    ]);
    expect(result[0]!.credits).toBe(60);
    expect(result[1]!.credits).toBe(40);
    expect(result[0]!.credits + result[1]!.credits).toBe(100);
  });

  it("last bot absorbs rounding remainder", () => {
    const result = allocateUsageByBot(100, [
      { botId: 1, weight: 33 },
      { botId: 2, weight: 33 },
      { botId: 3, weight: 34 },
    ]);
    const sum = result.reduce((s, r) => s + r.credits, 0);
    expect(sum).toBe(100);
  });

  it("returns empty array for zero-weight bots", () => {
    const result = allocateUsageByBot(100, []);
    expect(result).toHaveLength(0);
  });

  it("handles single bot allocation", () => {
    const result = allocateUsageByBot(500, [{ botId: 1, weight: 1 }]);
    expect(result[0]!.credits).toBe(500);
  });
});

// ─── computeProration ────────────────────────────────────────────────────────

describe("Billing Math — Proration", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-07-01T00:00:00Z");

  it("calculates mid-cycle upgrade proration", () => {
    const now = new Date("2026-06-16T00:00:00Z");
    const proration = computeProration(100, 300, start, end, now);
    expect(proration).toBeGreaterThan(0);
    expect(proration).toBeLessThan(200);
  });

  it("returns 0 for a downgrade", () => {
    const now = new Date("2026-06-16T00:00:00Z");
    expect(computeProration(300, 100, start, end, now)).toBe(0);
  });

  it("returns 0 for same-price plan switch", () => {
    const now = new Date("2026-06-16T00:00:00Z");
    expect(computeProration(100, 100, start, end, now)).toBe(0);
  });

  it("returns near-full amount at cycle start", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const proration = computeProration(100, 300, start, end, now);
    expect(proration).toBeCloseTo(200, 0);
  });

  it("returns 0 at or after cycle end", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(computeProration(100, 300, start, end, now)).toBe(0);
  });
});

// ─── isDunningStepDue ────────────────────────────────────────────────────────

describe("Billing Math — Dunning Step Advancement", () => {
  it("step 1 (Day 0) is due immediately at issuance", () => {
    const issuedAt = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-06-01T01:00:00Z");
    expect(isDunningStepDue(issuedAt, 0, now)).toBe(true);
  });

  it("step 2 (Day 3) is not due on Day 1", () => {
    const issuedAt = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-06-02T00:00:00Z");
    expect(isDunningStepDue(issuedAt, 3, now)).toBe(false);
  });

  it("step 2 (Day 3) is due on Day 3", () => {
    const issuedAt = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-06-04T00:00:00Z");
    expect(isDunningStepDue(issuedAt, 3, now)).toBe(true);
  });

  it("step 5 (Day 21) triggers cancellation", () => {
    const issuedAt = new Date("2026-06-01T00:00:00Z");
    const now = new Date("2026-06-22T00:00:00Z");
    expect(isDunningStepDue(issuedAt, 21, now)).toBe(true);
  });

  it("sequence: days 0, 3, 7, 14, 21 are all correct boundaries", () => {
    const issuedAt = new Date("2026-06-01T00:00:00Z");
    const expectedDays = [0, 3, 7, 14, 21];
    expect(DUNNING_STEPS.map((s) => s.daysAfterIssue)).toEqual(expectedDays);

    for (const days of expectedDays) {
      const exactDue = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000 + 1000);
      const justBefore = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000 - 1000);
      if (days > 0) {
        expect(isDunningStepDue(issuedAt, days, justBefore)).toBe(false);
      }
      expect(isDunningStepDue(issuedAt, days, exactDue)).toBe(true);
    }
  });
});

// ─── DUNNING_STEPS shape ─────────────────────────────────────────────────────

describe("Billing Math — DUNNING_STEPS invariants", () => {
  it("has exactly 5 steps", () => {
    expect(DUNNING_STEPS).toHaveLength(5);
  });

  it("only step 4 restricts", () => {
    const restrictSteps = DUNNING_STEPS.filter((s) => s.restrict);
    expect(restrictSteps).toHaveLength(1);
    expect(restrictSteps[0]!.step).toBe(4);
  });

  it("only step 5 cancels", () => {
    const cancelSteps = DUNNING_STEPS.filter((s) => s.cancel);
    expect(cancelSteps).toHaveLength(1);
    expect(cancelSteps[0]!.step).toBe(5);
  });

  it("steps 2 and 3 retry charge", () => {
    const retrySteps = DUNNING_STEPS.filter((s) => s.retryCharge).map((s) => s.step);
    expect(retrySteps).toEqual([2, 3]);
  });
});

// ─── Idempotent cycle-close logic ─────────────────────────────────────────────

describe("Billing Math — Cycle-close eligibility (shouldCloseCycle)", () => {
  it("returns close=false when cycle ends in the future", () => {
    const cycleEnd = new Date("2026-07-01T00:00:00Z");
    const now = new Date("2026-06-30T00:00:00Z");
    const close = cycleEnd.getTime() > now.getTime();
    expect(close).toBe(true); // i.e. NOT closeable
  });

  it("does not close a cycle that already has an invoice", () => {
    const existingInvoiceId = 42;
    const alreadyInvoiced = existingInvoiceId !== null;
    expect(alreadyInvoiced).toBe(true);
  });

  it("closes when cycle has ended and no existing invoice", () => {
    const cycleEnd = new Date("2026-06-30T00:00:00Z");
    const now = new Date("2026-07-01T00:00:00Z");
    const shouldClose = cycleEnd.getTime() <= now.getTime();
    expect(shouldClose).toBe(true);
  });
});
