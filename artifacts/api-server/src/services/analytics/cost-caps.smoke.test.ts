import { describe, it, expect, afterAll } from "vitest";
import { createTestUser, cleanupTestUser, type TestUser } from "../../test-utils";
import { db, clientCostCapsTable, llmUsageLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getMonthlySpend,
  getCostCap,
  upsertCostCap,
  checkCostCapAlerts,
  shouldPauseAutonomous,
} from "./cost-caps";

describe("Cost caps smoke tests", () => {
  const testUsers: TestUser[] = [];

  afterAll(async () => {
    for (const u of testUsers) {
      await db.delete(clientCostCapsTable).where(eq(clientCostCapsTable.clientId, u.clientId)).catch(() => {});
      await db.delete(llmUsageLogTable).where(eq(llmUsageLogTable.clientId, u.clientId)).catch(() => {});
      await cleanupTestUser(u);
    }
  });

  it("should return zero spend for a fresh client", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const spend = await getMonthlySpend(user.clientId);
    expect(spend).toBe(0);
  });

  it("should create and retrieve a cost cap", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const cap = await upsertCostCap(user.clientId, 100, true, true);
    expect(cap).toBeDefined();

    const retrieved = await getCostCap(user.clientId);
    expect(retrieved).toBeDefined();
    expect(parseFloat(retrieved!.monthlyCapUsd)).toBe(100);
    expect(retrieved!.alertAt80Pct).toBe(true);
    expect(retrieved!.pauseAutonomousOnExhaust).toBe(true);
  });

  it("should update an existing cost cap", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    await upsertCostCap(user.clientId, 50, false, false);
    const updated = await upsertCostCap(user.clientId, 200, true, true);

    const retrieved = await getCostCap(user.clientId);
    expect(parseFloat(retrieved!.monthlyCapUsd)).toBe(200);
  });

  it("should report within budget when no cap is set", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const result = await checkCostCapAlerts(user.clientId);
    expect(result.withinBudget).toBe(true);
    expect(result.cap).toBe(0);
    expect(result.pauseAutonomous).toBe(false);
  });

  it("should flag over-budget when spend exceeds cap", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    await upsertCostCap(user.clientId, 0.01, true, true);

    await db.insert(llmUsageLogTable).values({
      clientId: user.clientId,
      model: "gpt-5.4",
      promptTokens: 1000,
      completionTokens: 500,
      estimatedCostUsd: "1.00",
      calledAt: new Date(),
    });

    const result = await checkCostCapAlerts(user.clientId);
    expect(result.withinBudget).toBe(false);
    expect(result.pctUsed).toBeGreaterThan(100);
    expect(result.pauseAutonomous).toBe(true);

    const shouldPause = await shouldPauseAutonomous(user.clientId);
    expect(shouldPause).toBe(true);
  });
});
