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

export async function storeMemory(params: {
  botId: number;
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
  query: string;
  limit?: number;
}) {
  const queryEmbedding = await generateEmbedding(params.query);
  const limit = params.limit ?? 5;

  const memories = await db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
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
    .where(eq(botMemoriesTable.botId, params.botId))
    .orderBy(sql`${botMemoriesTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(limit);

  return memories;
}

export async function consolidateSession(params: {
  sessionId: number;
  objective: string;
  messages: Array<{ botId?: number | null; botName?: string | null; role: string; content: string }>;
  botIds: number[];
}) {
  const conversationText = params.messages
    .map((m) => `${m.botName || "User"} (${m.role}): ${m.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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

export async function getMemoriesForBot(botId: number, limit = 20) {
  return db
    .select({
      id: botMemoriesTable.id,
      botId: botMemoriesTable.botId,
      sourceType: botMemoriesTable.sourceType,
      sourceId: botMemoriesTable.sourceId,
      sessionId: botMemoriesTable.sessionId,
      content: botMemoriesTable.content,
      summary: botMemoriesTable.summary,
      topic: botMemoriesTable.topic,
      createdAt: botMemoriesTable.createdAt,
    })
    .from(botMemoriesTable)
    .where(eq(botMemoriesTable.botId, botId))
    .orderBy(desc(botMemoriesTable.createdAt))
    .limit(limit);
}

export async function deleteMemory(memoryId: number) {
  return db
    .delete(botMemoriesTable)
    .where(eq(botMemoriesTable.id, memoryId));
}

export async function buildMemoryContext(botId: number, query: string): Promise<string> {
  const memories = await retrieveMemories({ botId, query, limit: 5 });
  if (memories.length === 0) return "";

  const memoryBlock = memories
    .map((m, i) => `[Memory ${i + 1}] ${m.summary}`)
    .join("\n");

  return `\n\n--- PRIOR CONTEXT (from long-term memory) ---\n${memoryBlock}\n--- END PRIOR CONTEXT ---`;
}
