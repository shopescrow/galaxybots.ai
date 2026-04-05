import { describe, it, expect, afterAll } from "vitest";
import { createTestUser, cleanupTestUser, authedAgent, type TestUser } from "../../test-utils";
import {
  db,
  botsTable,
  taskSessionsTable,
  taskSessionBotsTable,
  taskSessionMessagesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Task session smoke tests", () => {
  const testUsers: TestUser[] = [];
  const createdBotIds: number[] = [];
  const createdSessionIds: number[] = [];

  afterAll(async () => {
    for (const sid of createdSessionIds) {
      await db.delete(taskSessionMessagesTable).where(eq(taskSessionMessagesTable.sessionId, sid)).catch(() => {});
      await db.delete(taskSessionBotsTable).where(eq(taskSessionBotsTable.sessionId, sid)).catch(() => {});
      await db.delete(taskSessionsTable).where(eq(taskSessionsTable.id, sid)).catch(() => {});
    }
    for (const botId of createdBotIds) {
      await db.delete(botsTable).where(eq(botsTable.id, botId)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
  });

  it("should create a task session with bots, send a message, and get responses", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const agent = authedAgent(user.token);

    const [bot1] = await db
      .insert(botsTable)
      .values({
        name: `TaskBot1_${Date.now()}`,
        title: "VP of Testing",
        department: "QA",
        category: "operations",
        description: "QA specialist bot for testing",
        personality: "Methodical and thorough",
        responsibilities: ["Quality assurance", "Test planning"],
        isAvailable: true,
      })
      .returning();
    createdBotIds.push(bot1.id);

    const [bot2] = await db
      .insert(botsTable)
      .values({
        name: `TaskBot2_${Date.now()}`,
        title: "VP of Engineering",
        department: "Engineering",
        category: "engineering",
        description: "Engineering specialist bot",
        personality: "Technical and precise",
        responsibilities: ["System architecture", "Code review"],
        isAvailable: true,
      })
      .returning();
    createdBotIds.push(bot2.id);

    const createRes = await agent.post("/api/task-sessions").send({
      objective: "Smoke test the task session flow",
      botIds: [bot1.id, bot2.id],
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.objective).toBe("Smoke test the task session flow");
    expect(createRes.body.teamBots).toHaveLength(2);
    createdSessionIds.push(createRes.body.id);

    const msgRes = await agent
      .post(`/api/task-sessions/${createRes.body.id}/messages`)
      .send({ content: "What is the best approach for this task?" });

    expect(msgRes.status).toBe(201);
    expect(Array.isArray(msgRes.body)).toBe(true);
    expect(msgRes.body.length).toBeGreaterThanOrEqual(2);

    const getRes = await agent.get(`/api/task-sessions/${createRes.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createRes.body.id);

    const msgsRes = await agent.get(`/api/task-sessions/${createRes.body.id}/messages`);
    expect(msgsRes.status).toBe(200);
    expect(msgsRes.body.length).toBeGreaterThanOrEqual(1);
  });
});
