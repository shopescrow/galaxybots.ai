import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createTestUser, cleanupTestUser, type TestUser } from "../../test-utils";
import { db, botMemoriesTable, botsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { setOpenAIMockHandler } from "../../test-setup";
import { retrieveMemories, backfillMissingEmbeddings, __clearQueryEmbedCacheForTests } from "./memory";

const DIM = 1536;

// Build a sparse 1536-dim unit vector with a single hot dimension. Two vectors
// with different hot dims are orthogonal (cosine 0); same hot dim -> cosine 1.
function unitVec(hotIndex: number): number[] {
  const v = new Array(DIM).fill(0);
  v[hotIndex] = 1;
  return v;
}

// The OpenAI SDK requests `encoding_format: "base64"` by default and decodes
// the response as a Float32 buffer, so the mock must return base64-encoded
// float32 bytes (returning a plain number array gets reinterpreted as raw bytes).
function embeddingResponse(vec: number[]) {
  const b64 = Buffer.from(new Float32Array(vec).buffer).toString("base64");
  return {
    object: "list",
    data: [{ object: "embedding", index: 0, embedding: b64 }],
    model: "text-embedding-3-small",
    usage: { prompt_tokens: 1, total_tokens: 1 },
  };
}

async function createBot(name: string): Promise<number> {
  const [bot] = await db
    .insert(botsTable)
    .values({
      name,
      title: "Test Bot",
      department: "test",
      category: "test",
      description: "smoke test bot",
      personality: "neutral",
    })
    .returning();
  return bot.id;
}

describe("Vector memory ANN retrieval", () => {
  const testUsers: TestUser[] = [];
  const botIds: number[] = [];

  beforeEach(() => {
    __clearQueryEmbedCacheForTests();
    setOpenAIMockHandler(null);
  });

  afterAll(async () => {
    for (const id of botIds) {
      await db.delete(botMemoriesTable).where(eq(botMemoriesTable.botId, id)).catch(() => {});
      await db.delete(botsTable).where(eq(botsTable.id, id)).catch(() => {});
    }
    for (const u of testUsers) {
      await cleanupTestUser(u);
    }
    setOpenAIMockHandler(null);
  });

  it("surfaces the semantically relevant memory via the ANN index", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const botId = await createBot(`mem_relevant_${Date.now()}`);
    botIds.push(botId);

    await db.insert(botMemoriesTable).values([
      { botId, clientId: user.clientId, sourceType: "test", content: "c1", summary: "off topic alpha", embedding: unitVec(5) },
      { botId, clientId: user.clientId, sourceType: "test", content: "c2", summary: "the relevant memory", embedding: unitVec(0) },
      { botId, clientId: user.clientId, sourceType: "test", content: "c3", summary: "off topic beta", embedding: unitVec(9) },
    ]);

    // Query embedding aligns with the relevant memory's hot dimension.
    setOpenAIMockHandler(() => embeddingResponse(unitVec(0)));

    const results = await retrieveMemories({ botId, clientId: user.clientId, query: "find relevant", limit: 2 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].summary).toBe("the relevant memory");
    expect(results[0].similarity).toBeCloseTo(1, 3);
    expect(typeof results[0].score).toBe("number");
  });

  it("scopes retrieval by bot and client", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    testUsers.push(userA, userB);
    const botId = await createBot(`mem_scope_${Date.now()}`);
    botIds.push(botId);

    await db.insert(botMemoriesTable).values([
      { botId, clientId: userA.clientId, sourceType: "test", content: "a", summary: "client A memory", embedding: unitVec(0) },
      { botId, clientId: userB.clientId, sourceType: "test", content: "b", summary: "client B memory", embedding: unitVec(0) },
    ]);

    setOpenAIMockHandler(() => embeddingResponse(unitVec(0)));

    const results = await retrieveMemories({ botId, clientId: userA.clientId, query: "memory", limit: 5 });
    expect(results.length).toBe(1);
    expect(results[0].summary).toBe("client A memory");
  });

  it("stays fast and correct as memory grows (bounded candidate pool)", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const botId = await createBot(`mem_scale_${Date.now()}`);
    botIds.push(botId);

    const distractors = Array.from({ length: 150 }, (_, i) => ({
      botId,
      clientId: user.clientId,
      sourceType: "test",
      content: `d${i}`,
      summary: `distractor ${i}`,
      // Spread distractors across many orthogonal dims away from the query dim.
      embedding: unitVec(100 + (i % 1000)),
    }));
    await db.insert(botMemoriesTable).values(distractors);
    await db.insert(botMemoriesTable).values([
      { botId, clientId: user.clientId, sourceType: "test", content: "needle", summary: "the needle memory", embedding: unitVec(0) },
    ]);

    setOpenAIMockHandler(() => embeddingResponse(unitVec(0)));

    const start = Date.now();
    const results = await retrieveMemories({ botId, clientId: user.clientId, query: "needle", limit: 3 });
    const elapsed = Date.now() - start;

    expect(results[0].summary).toBe("the needle memory");
    // Bounded ANN + rerank should keep retrieval well under a generous ceiling
    // even with many entries present.
    expect(elapsed).toBeLessThan(3000);
  });

  it("falls back to recency ordering when embeddings are unavailable", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const botId = await createBot(`mem_fallback_${Date.now()}`);
    botIds.push(botId);

    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newDate = new Date();
    await db.insert(botMemoriesTable).values([
      { botId, clientId: user.clientId, sourceType: "test", content: "old", summary: "older memory", embedding: unitVec(0), createdAt: oldDate },
      { botId, clientId: user.clientId, sourceType: "test", content: "new", summary: "newest memory", embedding: unitVec(0), createdAt: newDate },
    ]);

    // Simulate an embedding-provider failure: malformed response -> client throws
    // -> getQueryEmbedding returns null -> recency fallback path.
    setOpenAIMockHandler(() => ({ object: "list", data: [] }));

    const results = await retrieveMemories({ botId, clientId: user.clientId, query: "anything", limit: 5 });
    expect(results.length).toBe(2);
    expect(results[0].summary).toBe("newest memory");
  });

  it("falls back to recency when a query embedding exists but no memory has one", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const botId = await createBot(`mem_noembed_${Date.now()}`);
    botIds.push(botId);

    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newDate = new Date();
    // Memories exist but were stored without embeddings (e.g. provider outage).
    await db.insert(botMemoriesTable).values([
      { botId, clientId: user.clientId, sourceType: "test", content: "old", summary: "older unembedded memory", embedding: null, createdAt: oldDate },
      { botId, clientId: user.clientId, sourceType: "test", content: "new", summary: "newest unembedded memory", embedding: null, createdAt: newDate },
    ]);

    // Query embedding succeeds, but the ANN candidate pool is empty because no
    // row has an embedding -> must still return rows via recency fallback.
    setOpenAIMockHandler(() => embeddingResponse(unitVec(0)));

    const results = await retrieveMemories({ botId, clientId: user.clientId, query: "anything", limit: 5 });
    expect(results.length).toBe(2);
    expect(results[0].summary).toBe("newest unembedded memory");
  });

  it("backfills missing embeddings for entries stored without one", async () => {
    const user = await createTestUser();
    testUsers.push(user);
    const botId = await createBot(`mem_backfill_${Date.now()}`);
    botIds.push(botId);

    const [mem] = await db
      .insert(botMemoriesTable)
      .values({ botId, clientId: user.clientId, sourceType: "test", content: "x", summary: "needs embedding", embedding: null })
      .returning();

    setOpenAIMockHandler(() => embeddingResponse(unitVec(3)));

    const { processed, failed } = await backfillMissingEmbeddings({ botId, clientId: user.clientId });
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(failed).toBe(0);

    const [updated] = await db
      .select({ embedding: botMemoriesTable.embedding })
      .from(botMemoriesTable)
      .where(eq(botMemoriesTable.id, mem.id));
    expect(updated.embedding).not.toBeNull();
    expect(updated.embedding?.length).toBe(DIM);
  });
});
