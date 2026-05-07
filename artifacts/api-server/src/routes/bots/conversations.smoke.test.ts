import { describe, it, expect, afterAll } from "vitest";
import { createTestUser, cleanupTestUser, authedAgent, type TestUser } from "../../test-utils";
import { db, botsTable, conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";

describe("Bot conversation smoke tests", () => {
  const testUsers: TestUser[] = [];
  const createdBotIds: number[] = [];
  const createdConvIds: number[] = [];

  afterAll(async () => {
    for (const convId of createdConvIds) {
      await db.delete(messages).where(eq(messages.conversationId, convId)).catch(() => {});
      await db.delete(conversations).where(eq(conversations.id, convId)).catch(() => {});
    }
    for (const botId of createdBotIds) {
      await db.delete(botsTable).where(eq(botsTable.id, botId)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
  });

  it("should create a bot, start a conversation, send a message, and get AI response", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const agent = authedAgent(user.token);

    const [bot] = await db
      .insert(botsTable)
      .values({
        name: `SmokeBot_${Date.now()}`,
        title: "Chief Smoke Officer",
        department: "Testing",
        category: "operations",
        description: "A bot for smoke testing conversations",
        personality: "Professional and concise",
        responsibilities: ["Run smoke tests", "Verify functionality"],
        isAvailable: true,
      })
      .returning();
    createdBotIds.push(bot.id);

    const convRes = await agent.post("/api/conversations").send({
      botId: bot.id,
      title: "Smoke Test Conversation",
    });
    expect(convRes.status).toBe(201);
    expect(convRes.body.id).toBeDefined();
    createdConvIds.push(convRes.body.id);

    const msgRes = await agent
      .post(`/api/conversations/${convRes.body.id}/messages`)
      .send({ content: "Hello, this is a smoke test message." });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.userMessage).toBeDefined();
    expect(msgRes.body.botResponse).toBeDefined();
    expect(msgRes.body.botResponse.content).toBeTruthy();
    expect(msgRes.body.botResponse.role).toBe("bot");

    const historyRes = await agent.get(`/api/conversations/${convRes.body.id}/messages`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(2);
  });
});
