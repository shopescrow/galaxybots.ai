import {
  db,
  botMemoriesTable,
  botsTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Embed multiple texts in a single API call. Returns vectors in the same order as the
 * input. Used by the scaling layer for bounded top-k vector retrieval over in-memory sets.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function storeMemory(params: {
  botId: number;
  clientId?: number;
  sourceType: string;
  sourceId?: number;
  sessionId?: number;
  content: string;
  summary: string;
  topic?: string;
}) {
  const embedding = await generateEmbedding(params.summary);

  const [memory] = await db
    .insert(botMemoriesTable)
    .values({
      botId: params.botId,
      clientId: params.clientId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId ?? null,
      sessionId: params.sessionId ?? null,
      content: params.content,
      summary: params.summary,
      topic: params.topic ?? null,
      embedding,
    })
    .returning();

  return memory;
}

export async function retrieveMemories(params: {
  botId: number;
  clientId?: number;
  query: string;
  limit?: number;
}) {
  const queryEmbedding = await generateEmbedding(params.query);
  const limit = params.limit ?? 5;

  const conditions = [eq(botMemoriesTable.botId, params.botId)];
  if (params.clientId !== undefined) {
    conditions.push(eq(botMemoriesTable.clientId, params.clientId));
  }

  const memories = await db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
      clientId: botMemoriesTable.clientId,
      sourceType: botMemoriesTable.sourceType,
      sourceId: botMemoriesTable.sourceId,
      sessionId: botMemoriesTable.sessionId,
      content: botMemoriesTable.content,
      summary: botMemoriesTable.summary,
      topic: botMemoriesTable.topic,
      createdAt: botMemoriesTable.createdAt,
      similarity: sql<number>`1 - (${botMemoriesTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`.as("similarity"),
    })
    .from(botMemoriesTable)
    .where(and(...conditions))
    .orderBy(sql`${botMemoriesTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(limit);

  return memories;
}

export async function consolidateSession(params: {
  sessionId: number;
  clientId?: number;
  objective: string;
  messages: Array<{ botId?: number | null; botName?: string | null; role: string; content: string }>;
  botIds: number[];
}) {
  const conversationText = params.messages
    .map((m) => `${m.botName || "User"} (${m.role}): ${m.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a memory consolidation system. Given a task session conversation, extract the key decisions, findings, action items, and important context. Return a JSON object with:
{
  "decisions": ["decision 1", "decision 2"],
  "findings": ["finding 1", "finding 2"],
  "actionItems": ["action 1", "action 2"],
  "keyContext": "A 2-3 sentence summary of the most important context from this session"
}`,
      },
      {
        role: "user",
        content: `OBJECTIVE: ${params.objective}\n\nCONVERSATION:\n${conversationText}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: {
    decisions: string[];
    findings: string[];
    actionItems: string[];
    keyContext: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { decisions: [], findings: [], actionItems: [], keyContext: "Session consolidation failed." };
  }

  const summary = [
    parsed.keyContext,
    parsed.decisions.length > 0 ? `Decisions: ${parsed.decisions.join("; ")}` : "",
    parsed.findings.length > 0 ? `Findings: ${parsed.findings.join("; ")}` : "",
    parsed.actionItems.length > 0 ? `Action items: ${parsed.actionItems.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const memories = [];
  for (const botId of params.botIds) {
    const memory = await storeMemory({
      botId,
      clientId: params.clientId,
      sourceType: "session_consolidation",
      sessionId: params.sessionId,
      content: conversationText.substring(0, 5000),
      summary,
      topic: params.objective,
    });
    memories.push(memory);
  }

  return { summary: parsed, memories };
}

export async function getMemoriesForBot(botId: number, limit = 20, clientId?: number) {
  const conditions = [eq(botMemoriesTable.botId, botId)];
  if (clientId !== undefined) {
    conditions.push(eq(botMemoriesTable.clientId, clientId));
  }

  return db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
      clientId: botMemoriesTable.clientId,
      sourceType: botMemoriesTable.sourceType,
      sourceId: botMemoriesTable.sourceId,
      sessionId: botMemoriesTable.sessionId,
      content: botMemoriesTable.content,
      summary: botMemoriesTable.summary,
      topic: botMemoriesTable.topic,
      createdAt: botMemoriesTable.createdAt,
    })
    .from(botMemoriesTable)
    .where(and(...conditions))
    .orderBy(desc(botMemoriesTable.createdAt))
    .limit(limit);
}

export async function deleteMemory(memoryId: number) {
  return db
    .delete(botMemoriesTable)
    .where(eq(botMemoriesTable.id, memoryId));
}

export async function buildMemoryContext(botId: number, query: string, clientId?: number): Promise<string> {
  const memories = await retrieveMemories({ botId, clientId, query, limit: 5 });
  if (memories.length === 0) return "";

  const memoryBlock = memories
    .map((m, i) => `[Memory ${i + 1}] ${m.summary}`)
    .join("\n");

  return `\n\n--- PRIOR CONTEXT (from long-term memory) ---\n${memoryBlock}\n--- END PRIOR CONTEXT ---`;
}
