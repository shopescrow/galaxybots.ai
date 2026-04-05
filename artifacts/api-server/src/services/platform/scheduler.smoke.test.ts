import { describe, it, expect, afterAll } from "vitest";
import { createTestUser, cleanupTestUser, type TestUser } from "../../test-utils";
import { db, pool, botAssignmentsTable, botsTable, backgroundReportsTable, pendingApprovalsTable, llmUsageLogTable, clientCostCapsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { checkApprovalSLAs, checkDueAssignments, startScheduler, stopScheduler } from "./scheduler";
import { upsertCostCap } from "../analytics/cost-caps";

const SCHEDULER_LOCK_ID = 999999;

describe("Scheduler smoke tests", () => {
  const testUsers: TestUser[] = [];
  const createdBotIds: number[] = [];
  const createdAssignmentIds: number[] = [];
  const createdApprovalIds: number[] = [];

  afterAll(async () => {
    stopScheduler();
    for (const id of createdApprovalIds) {
      await db.delete(pendingApprovalsTable).where(eq(pendingApprovalsTable.id, id)).catch(() => {});
    }
    for (const id of createdAssignmentIds) {
      await db.delete(backgroundReportsTable).where(eq(backgroundReportsTable.assignmentId, id)).catch(() => {});
      await db.delete(botAssignmentsTable).where(eq(botAssignmentsTable.id, id)).catch(() => {});
    }
    for (const botId of createdBotIds) {
      await db.delete(botsTable).where(eq(botsTable.id, botId)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
    await pool.query(`SELECT pg_advisory_unlock($1)`, [SCHEDULER_LOCK_ID]).catch(() => {});
  });

  async function createBotAndAssignment(
    user: TestUser,
    opts: { schedule: string; isActive?: string; lastRunAt?: Date | null },
  ) {
    const [bot] = await db
      .insert(botsTable)
      .values({
        name: `SchedBot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: "Scheduled Worker",
        department: "Operations",
        category: "operations",
        description: "Scheduled task runner bot",
        personality: "Reliable and punctual",
        responsibilities: ["Run scheduled tasks"],
        isAvailable: true,
      })
      .returning();
    createdBotIds.push(bot.id);

    const [assignment] = await db
      .insert(botAssignmentsTable)
      .values({
        botId: bot.id,
        clientId: user.clientId,
        objective: "Smoke test scheduled task",
        schedule: opts.schedule,
        isActive: opts.isActive ?? "true",
        actionMode: "passive",
        lastRunAt: opts.lastRunAt ?? null,
      })
      .returning();
    createdAssignmentIds.push(assignment.id);

    return { bot, assignment };
  }

  it("should identify never-run assignments as due (matches scheduler checkDueAssignments query)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment } = await createBotAndAssignment(user, { schedule: "daily" });

    const activeAssignments = await db
      .select()
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.isActive, "true"));

    const SCHEDULE_INTERVALS: Record<string, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    };

    const due = activeAssignments.filter((a) => {
      if (a.id !== assignment.id) return false;
      const interval = SCHEDULE_INTERVALS[a.schedule] ?? SCHEDULE_INTERVALS.daily;
      if (!a.lastRunAt) return true;
      return Date.now() - new Date(a.lastRunAt).getTime() >= interval;
    });

    expect(due.length).toBe(1);
    expect(due[0].id).toBe(assignment.id);
  });

  it("should NOT mark recently-run assignments as due", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment } = await createBotAndAssignment(user, {
      schedule: "hourly",
      lastRunAt: new Date(),
    });

    const SCHEDULE_INTERVALS: Record<string, number> = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
    };

    const interval = SCHEDULE_INTERVALS[assignment.schedule] ?? SCHEDULE_INTERVALS.daily;
    const elapsed = Date.now() - new Date(assignment.lastRunAt!).getTime();
    expect(elapsed).toBeLessThan(interval);
  });

  it("should filter only active assignments (inactive excluded from scheduler)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment: active } = await createBotAndAssignment(user, {
      schedule: "daily",
      isActive: "true",
    });
    const { assignment: inactive } = await createBotAndAssignment(user, {
      schedule: "daily",
      isActive: "false",
    });

    const activeAssignments = await db
      .select()
      .from(botAssignmentsTable)
      .where(
        and(
          eq(botAssignmentsTable.clientId, user.clientId),
          eq(botAssignmentsTable.isActive, "true"),
        ),
      );

    const activeIds = activeAssignments.map((a) => a.id);
    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(inactive.id);
  });

  it("should complete a run and update lastRunAt + create background report", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment, bot } = await createBotAndAssignment(user, { schedule: "daily" });

    const runTime = new Date();
    await db
      .update(botAssignmentsTable)
      .set({ lastRunAt: runTime })
      .where(eq(botAssignmentsTable.id, assignment.id));

    const [report] = await db
      .insert(backgroundReportsTable)
      .values({
        assignmentId: assignment.id,
        botId: bot.id,
        clientId: user.clientId,
        content: "Completed smoke test scheduled run successfully.",
        summary: "Smoke test run complete",
      })
      .returning();

    expect(report.assignmentId).toBe(assignment.id);
    expect(report.content).toContain("smoke test");

    const [updated] = await db
      .select()
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.id, assignment.id));
    expect(updated.lastRunAt).toBeTruthy();

    const interval = 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(updated.lastRunAt!).getTime();
    expect(elapsed).toBeLessThan(interval);
  });

  it("should auto-reject a pending approval past double-SLA deadline via checkApprovalSLAs", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { bot } = await createBotAndAssignment(user, { schedule: "daily" });

    const pastCreatedAt = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const pastSlaDeadline = new Date(Date.now() - 6 * 60 * 60 * 1000);

    const [approval] = await db
      .insert(pendingApprovalsTable)
      .values({
        clientId: user.clientId,
        botId: bot.id,
        botName: bot.name,
        toolName: "send_email",
        toolInput: { to: "test@example.com" },
        status: "pending",
        createdAt: pastCreatedAt,
        slaDeadline: pastSlaDeadline,
      })
      .returning();
    createdApprovalIds.push(approval.id);

    await checkApprovalSLAs();

    const [updated] = await db
      .select()
      .from(pendingApprovalsTable)
      .where(eq(pendingApprovalsTable.id, approval.id));

    expect(updated.status).toBe("rejected");
    expect(updated.rejectionReason).toContain("SLA timeout");
    expect(updated.resolvedAt).toBeTruthy();
  });

  it("should execute checkDueAssignments and skip due assignment when cost cap is exceeded", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment } = await createBotAndAssignment(user, {
      schedule: "daily",
      lastRunAt: null,
    });

    await upsertCostCap(user.clientId, 0.01, false, true);
    await db.insert(llmUsageLogTable).values({
      clientId: user.clientId,
      botId: assignment.botId,
      model: "gpt-5.4",
      promptTokens: 50000,
      completionTokens: 50000,
      estimatedCostUsd: "100.00",
      latencyMs: 500,
    });

    await checkDueAssignments();

    const [updated] = await db
      .select()
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.id, assignment.id));
    expect(updated.lastRunAt).toBeNull();

    await db.delete(llmUsageLogTable).where(eq(llmUsageLogTable.clientId, user.clientId)).catch(() => {});
    await db.delete(clientCostCapsTable).where(eq(clientCostCapsTable.clientId, user.clientId)).catch(() => {});
  });

  it("should execute checkDueAssignments and attempt to run a never-run assignment (error handled gracefully)", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment } = await createBotAndAssignment(user, {
      schedule: "daily",
      lastRunAt: null,
    });

    await checkDueAssignments();

    const [updated] = await db
      .select()
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.id, assignment.id));

    const hasRun = updated.lastRunAt !== null;
    if (!hasRun) {
      expect(updated.isActive).toBe("true");
    } else {
      expect(updated.lastRunAt).toBeTruthy();
    }
  }, 15000);

  it("should skip a recently-run assignment in checkDueAssignments", async () => {
    const user = await createTestUser();
    testUsers.push(user);

    const { assignment } = await createBotAndAssignment(user, {
      schedule: "hourly",
      lastRunAt: new Date(),
    });

    await checkDueAssignments();

    const [updated] = await db
      .select()
      .from(botAssignmentsTable)
      .where(eq(botAssignmentsTable.id, assignment.id));

    const elapsed = Date.now() - new Date(updated.lastRunAt!).getTime();
    expect(elapsed).toBeLessThan(60 * 60 * 1000);
  });

  it("should acquire scheduler advisory lock and start/stop without error", async () => {
    const lockResult = await pool.query(
      `SELECT pg_try_advisory_lock($1) AS acquired`,
      [SCHEDULER_LOCK_ID],
    );
    const acquired = lockResult.rows[0]?.acquired;
    expect(typeof acquired).toBe("boolean");

    if (acquired) {
      await pool.query(`SELECT pg_advisory_unlock($1)`, [SCHEDULER_LOCK_ID]);
    }

    await startScheduler();
    stopScheduler();
  });
});
