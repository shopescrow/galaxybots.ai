import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, botMemoriesTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export function registerMemorySearchTool(server: McpServer): void {
  server.tool(
    "search_bot_memory",
    "Semantic search over a specific bot's long-term memory. Returns top 5 relevant memory entries with content, summary, topic, and recency.",
    {
      botId: z.number().describe("The bot ID whose memory to search"),
      query: z.string().describe("The search query string for semantic similarity matching"),
    },
    async ({ botId, query }) => {
      console.log(`[MCP] search_bot_memory: botId=${botId}, query="${query.substring(0, 80)}..."`);
      try {
        const queryEmbedding = await generateEmbedding(query);

        const memories = await db
          .select({
            id: botMemoriesTable.id,
            botId: botMemoriesTable.botId,
            sourceType: botMemoriesTable.sourceType,
            content: botMemoriesTable.content,
            summary: botMemoriesTable.summary,
            topic: botMemoriesTable.topic,
            createdAt: botMemoriesTable.createdAt,
            similarity: sql<number>`1 - (${botMemoriesTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`.as("similarity"),
          })
          .from(botMemoriesTable)
          .where(eq(botMemoriesTable.botId, botId))
          .orderBy(sql`${botMemoriesTable.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
          .limit(5);

        console.log(`[MCP] search_bot_memory: Found ${memories.length} memory entries for bot ${botId}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(memories, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] search_bot_memory: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error searching bot memory: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
