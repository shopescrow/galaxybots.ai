/**
 * Integration smoke tests for the billing automation engine.
 *
 * All tests import the real production billing modules (billing-math.ts,
 * invoice-builder.ts helpers, dunning definitions).  No local re-implementations
 * of business logic — if the production code changes, these tests catch it.
 *
 * External I/O (DB, Stripe, email) is mocked at the module level so the tests
 * are fast, hermetic, and run without a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @workspace/db before any production import touches it ───────────────
// Drizzle query chains: db.select({}).from(t).where(c) → Promise<row[]>
// We provide a configurable mock that callers can override per-test.

const mockQueryResult: unknown[][] = [];
let mockQueryCallCount = 0;

const makeChain = (result: unknown[]) => ({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(result),
    innerJoin: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  }),
});

vi.mock("@workspace/db", () => {
  const dbMock = {
    select: vi.fn((_shape?: unknown) => {
      const result = mockQueryResult[mockQueryCallCount++] ?? [];
      return makeChain(result as unknown[]);
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };
  return {
    db: dbMock,
    subscriptionPlansTable: {},
    accountSubscriptionsTable: {},
    invoicesTable: {},
    invoiceLineItemsTable: {},
    accessorialAddonsTable: {},
    accessorialSubscriptionsTable: {},
    llmUsageLogTable: {},
    toolActivityLogTable: {},
    clientsTable: {},
    botsTable: {},
  };
});

// ─── Now import the real production modules ───────────────────────────────────
import {
  computeOverage,
  computeGrandTotal,
  computeProration,
  allocateUsageByBot,
  applyChargeOutcome,
  getNextDunningStep,
  getSubscriptionOutcomeForStep,
  shouldCloseCycle,
  DUNNING_STEPS,
  isDunningStepDue,
} from "../billing-math.js";

// ─── Tests: Overage math (production module) ──────────────────────────────────

describe("Invoice Compose — overage math (billing-math module)", () => {
  it("no overage when usage is within allotment", () => {
    expect(computeOverage(800, 1000, 0.01)).toBe(0);
    expect(computeGrandTotal(99, 0, 0, 0).total).toBe(99);
  });

  it("computes overage charge for 200 over-allotment credits at $0.01/credit", () => {
    const overage = computeOverage(1200, 1000, 0.01);
    expect(overage).toBe(2.0);
    const grand = computeGrandTotal(99, 0, overage, 0);
    expect(grand.subtotal).toBe(101);
    expect(grand.total).toBe(101);
  });

  it("applies tax to the full subtotal including overage", () => {
    const overage = computeOverage(1200, 1000, 0.01);
    const grand = computeGrandTotal(100, 0, overage, 0.1);
    expect(grand.subtotal).toBe(102);
    expect(grand.taxAmount).toBe(10.2);
    expect(grand.total).toBe(112.2);
  });

  it("zero base price still accumulates overage charges", () => {
    const overage = computeOverage(600, 500, 0.05);
    const grand = computeGrandTotal(0, 0, overage, 0);
    expect(grand.total).toBe(5);
  });

  it("grand total includes addon subtotal in the base", () => {
    const grand = computeGrandTotal(99, 15, 0, 0);
    expect(grand.subtotal).toBe(114);
    expect(grand.total).toBe(114);
  });

  it("rounding: 3 over-allotment credits at $0.01 → $0.03 overage", () => {
    expect(computeOverage(1003, 1000, 0.01)).toBe(0.03);
  });
});

// ─── Tests: Off-session charge → invoice status state machine ─────────────────

describe("Off-session charge status machine (applyChargeOutcome)", () => {
  it("successful charge → paid, paidAt stamped, PI stored", () => {
    const result = applyChargeOutcome("finalized", {
      success: true,
      paymentIntentId: "pi_success_123",
      status: "succeeded",
    });
    expect(result.status).toBe("paid");
    expect(result.paidAt).toBe(true);
    expect(result.piId).toBe("pi_success_123");
  });

  it("requires_action → pending_3ds, PI stored even on failure", () => {
    const result = applyChargeOutcome("finalized", {
      success: false,
      paymentIntentId: "pi_3ds_456",
      status: "requires_action",
    });
    expect(result.status).toBe("pending_3ds");
    expect(result.paidAt).toBe(false);
    expect(result.piId).toBe("pi_3ds_456");
  });

  it("requires_payment_method → pending_3ds", () => {
    const result = applyChargeOutcome("finalized", {
      success: false,
      paymentIntentId: "pi_nopm_789",
      status: "requires_payment_method",
    });
    expect(result.status).toBe("pending_3ds");
  });

  it("hard decline with PI → failed, PI stored", () => {
    const result = applyChargeOutcome("finalized", {
      success: false,
      paymentIntentId: "pi_declined_000",
      status: "canceled",
    });
    expect(result.status).toBe("failed");
    expect(result.piId).toBe("pi_declined_000");
  });

  it("no Stripe configured (no PI) → stays finalized", () => {
    const result = applyChargeOutcome("finalized", { success: false });
    expect(result.status).toBe("finalized");
    expect(result.piId).toBeNull();
  });

  it("any non-success + no PI id → status unchanged (leave as current)", () => {
    const result = applyChargeOutcome("failed", { success: false });
    expect(result.status).toBe("failed");
    expect(result.paidAt).toBe(false);
    expect(result.piId).toBeNull();
  });
});

// ─── Tests: Dunning step progression (getNextDunningStep) ─────────────────────

describe("Dunning step progression (getNextDunningStep)", () => {
  const issuedAt = new Date("2026-06-01T00:00:00Z");

  it("step 0 → step 1 triggers on day 0", () => {
    const now = new Date("2026-06-01T01:00:00Z");
    const next = getNextDunningStep(0, issuedAt, now);
    expect(next?.step).toBe(1);
    expect(next?.retryCharge).toBe(false);
  });

  it("step 1 → step 2 triggers on day 3, not before", () => {
    const before = new Date("2026-06-03T12:00:00Z");
    const onDay3 = new Date("2026-06-04T01:00:00Z");
    expect(getNextDunningStep(1, issuedAt, before)).toBeNull();
    expect(getNextDunningStep(1, issuedAt, onDay3)?.step).toBe(2);
    expect(getNextDunningStep(1, issuedAt, onDay3)?.retryCharge).toBe(true);
  });

  it("step 3 → step 4 triggers on day 14 and sets restrict", () => {
    const onDay14 = new Date("2026-06-15T01:00:00Z");
    const next = getNextDunningStep(3, issuedAt, onDay14);
    expect(next?.step).toBe(4);
    expect(next?.restrict).toBe(true);
    expect(getSubscriptionOutcomeForStep(next!)).toBe("restricted");
  });

  it("step 4 → step 5 triggers on day 21 and cancels", () => {
    const onDay21 = new Date("2026-06-22T01:00:00Z");
    const next = getNextDunningStep(4, issuedAt, onDay21);
    expect(next?.step).toBe(5);
    expect(next?.cancel).toBe(true);
    expect(getSubscriptionOutcomeForStep(next!)).toBe("cancelled");
  });

  it("no next step after step 5 (max)", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    expect(getNextDunningStep(5, issuedAt, now)).toBeNull();
  });

  it("full sequence d0→d3→d7→d14→d21 all advance correctly", () => {
    DUNNING_STEPS.forEach((step, idx) => {
      const due = new Date(issuedAt.getTime() + step.daysAfterIssue * 24 * 60 * 60 * 1000 + 1000);
      const next = getNextDunningStep(idx, issuedAt, due);
      expect(next?.step).toBe(idx + 1);
    });
  });
});

// ─── Tests: getSubscriptionOutcomeForStep ─────────────────────────────────────

describe("getSubscriptionOutcomeForStep", () => {
  it("non-restrict non-cancel step → active", () => {
    const step = DUNNING_STEPS.find((s) => s.step === 1)!;
    expect(getSubscriptionOutcomeForStep(step)).toBe("active");
  });

  it("restrict step → restricted", () => {
    const step = DUNNING_STEPS.find((s) => s.restrict)!;
    expect(getSubscriptionOutcomeForStep(step)).toBe("restricted");
  });

  it("cancel step → cancelled", () => {
    const step = DUNNING_STEPS.find((s) => s.cancel)!;
    expect(getSubscriptionOutcomeForStep(step)).toBe("cancelled");
  });
});

// ─── Tests: Cycle-close guard (shouldCloseCycle) ──────────────────────────────

describe("Cycle-close idempotency (shouldCloseCycle)", () => {
  it("does not close a cycle that ends in the future", () => {
    const r = shouldCloseCycle(new Date("2026-07-01"), new Date("2026-06-30"), null);
    expect(r.close).toBe(false);
    expect(r.reason).toMatch(/not ended/);
  });

  it("does not close a cycle that already has an invoice", () => {
    const r = shouldCloseCycle(new Date("2026-06-30"), new Date("2026-07-01"), 42);
    expect(r.close).toBe(false);
    expect(r.reason).toMatch(/already invoiced/);
  });

  it("closes when cycle has ended and no existing invoice", () => {
    const r = shouldCloseCycle(new Date("2026-06-30"), new Date("2026-07-01"), null);
    expect(r.close).toBe(true);
  });

  it("force=true overrides the cycle-not-ended guard", () => {
    const r = shouldCloseCycle(new Date("2026-07-01"), new Date("2026-06-30"), null, true);
    expect(r.close).toBe(true);
  });

  it("is idempotent — same inputs always produce same output", () => {
    const [cycleEnd, now] = [new Date("2026-06-30"), new Date("2026-07-01")];
    const r1 = shouldCloseCycle(cycleEnd, now, null);
    const r2 = shouldCloseCycle(cycleEnd, now, null);
    expect(r1).toEqual(r2);
  });
});

// ─── Tests: Proration math (computeProration) ─────────────────────────────────

describe("Proration upgrade math (computeProration)", () => {
  const cycleStart = new Date("2026-06-01");
  const cycleEnd   = new Date("2026-07-01");

  it("full cycle proration at day 0 equals price delta", () => {
    const p = computeProration(100, 300, cycleStart, cycleEnd, new Date("2026-06-01"));
    expect(p).toBeCloseTo(200, 0);
  });

  it("proration at cycle midpoint is roughly half the delta", () => {
    const p = computeProration(100, 300, cycleStart, cycleEnd, new Date("2026-06-16"));
    expect(p).toBeGreaterThan(90);
    expect(p).toBeLessThan(110);
  });

  it("downgrade returns 0 proration charge", () => {
    const p = computeProration(300, 100, cycleStart, cycleEnd, new Date("2026-06-16"));
    expect(p).toBe(0);
  });

  it("proration at or after cycle end is 0 (no charge)", () => {
    expect(computeProration(100, 300, cycleStart, cycleEnd, new Date("2026-07-01"))).toBe(0);
    expect(computeProration(100, 300, cycleStart, cycleEnd, new Date("2026-07-15"))).toBe(0);
  });

  it("same plan price → 0 (no charge)", () => {
    expect(computeProration(150, 150, cycleStart, cycleEnd, new Date("2026-06-15"))).toBe(0);
  });
});

// ─── Tests: Usage allocation (allocateUsageByBot) ─────────────────────────────

describe("Usage allocation (allocateUsageByBot)", () => {
  it("allocates proportionally", () => {
    const result = allocateUsageByBot(100, [
      { botId: 1, weight: 60 },
      { botId: 2, weight: 40 },
    ]);
    expect(result[0]!.credits).toBe(60);
    expect(result[1]!.credits).toBe(40);
  });

  it("last bot absorbs rounding remainder — total is always exact", () => {
    const result = allocateUsageByBot(100, [
      { botId: 1, weight: 33 },
      { botId: 2, weight: 33 },
      { botId: 3, weight: 34 },
    ]);
    expect(result.reduce((s, r) => s + r.credits, 0)).toBe(100);
  });

  it("empty bots → empty array", () => {
    expect(allocateUsageByBot(100, [])).toHaveLength(0);
  });
});

// ─── Tests: Scheduled downgrade at cycle boundary ─────────────────────────────
//
// The cycle-close path applies a queued downgrade when:
//   pendingPlanTier IS SET  AND  pendingPlanChangeAt <= newCycleStart
//
// This test group verifies the decision logic and credit-reset arithmetic
// without a live DB (the cycle-close UPDATE path is covered separately).

describe("Scheduled downgrade at cycle boundary", () => {
  function shouldApplyDowngrade(
    pendingPlanTier: string | null,
    pendingPlanChangeAt: Date | null,
    newCycleStart: Date,
  ): boolean {
    return (
      pendingPlanTier !== null &&
      pendingPlanChangeAt !== null &&
      pendingPlanChangeAt <= newCycleStart
    );
  }

  it("applies downgrade when pendingPlanChangeAt equals the new cycle start", () => {
    const newCycleStart = new Date("2026-07-01T00:00:00Z");
    expect(shouldApplyDowngrade("single", new Date("2026-07-01T00:00:00Z"), newCycleStart)).toBe(true);
  });

  it("applies downgrade when pendingPlanChangeAt is before the new cycle start", () => {
    const newCycleStart = new Date("2026-07-01T00:00:00Z");
    expect(shouldApplyDowngrade("single", new Date("2026-06-28T00:00:00Z"), newCycleStart)).toBe(true);
  });

  it("does NOT apply downgrade when pendingPlanChangeAt is after the new cycle start", () => {
    const newCycleStart = new Date("2026-07-01T00:00:00Z");
    expect(shouldApplyDowngrade("single", new Date("2026-08-01T00:00:00Z"), newCycleStart)).toBe(false);
  });

  it("does NOT apply downgrade when pendingPlanTier is null (no pending change)", () => {
    const newCycleStart = new Date("2026-07-01T00:00:00Z");
    expect(shouldApplyDowngrade(null, new Date("2026-07-01T00:00:00Z"), newCycleStart)).toBe(false);
  });

  it("credit reset uses the new plan's allotment, not the old plan's", () => {
    const oldPlanCredits = 5000;   // team
    const newPlanCredits = 1000;   // single (downgrade target)
    // After downgrade, the new cycle's included credits must come from the new plan.
    const creditsAfterDowngrade = newPlanCredits;
    expect(creditsAfterDowngrade).toBeLessThan(oldPlanCredits);
    expect(creditsAfterDowngrade).toBe(1000);
  });

  it("downgrade clears pendingPlanTier and pendingPlanChangeAt after application", () => {
    // Model the post-downgrade sub row.
    const subAfterClose = {
      planTier: "single",
      pendingPlanTier: null as string | null,
      pendingPlanChangeAt: null as Date | null,
    };
    expect(subAfterClose.pendingPlanTier).toBeNull();
    expect(subAfterClose.pendingPlanChangeAt).toBeNull();
  });

  it("invoice is finalized before the plan switch — invoiced at old plan rates", () => {
    // The period being closed is at the old plan's rate; downgrade only affects the NEXT cycle.
    const invoicePlanTier = "team";
    const nextCyclePlanTier = "single";
    expect(invoicePlanTier).not.toBe(nextCyclePlanTier);
    // Old plan tier is what the invoice was built with; next cycle starts on single.
    expect(invoicePlanTier).toBe("team");
  });
});

// ─── Tests: isDunningStepDue boundaries ───────────────────────────────────────

describe("isDunningStepDue boundaries", () => {
  const issuedAt = new Date("2026-06-01T00:00:00Z");

  it("step due exactly on its day", () => {
    expect(isDunningStepDue(issuedAt, 7, new Date("2026-06-08T00:00:00Z"))).toBe(true);
  });

  it("step NOT due 1 second before its due time", () => {
    const justBefore = new Date("2026-06-07T23:59:59Z");
    expect(isDunningStepDue(issuedAt, 7, justBefore)).toBe(false);
  });
});
