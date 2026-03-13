import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, worldStateTable, botsTable, taskSessionsTable, taskSessionBotsTable, taskSessionMessagesTable, conversations, messages } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const webSearchOutputSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    snippet: z.string(),
    url: z.string(),
  })),
  query: z.string(),
  abstract: z.string().optional(),
});

registerTool({
  name: "web_search",
  description: "Search the web for current information on a topic. Returns a summary of search results. Use this when you need up-to-date information that may not be in your training data.",
  inputSchema: z.object({
    query: z.string().describe("The search query to look up"),
  }),
  outputSchema: webSearchOutputSchema,
  execute: async (input) => {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`;

    const response = await fetch(url, {
      headers: { "User-Agent": "GalaxyBots/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        results: [],
        query: input.query,
        abstract: `Search request failed with status ${response.status}`,
      };
    }

    const data = await response.json() as {
      Abstract?: string;
      AbstractURL?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Topics?: Array<{ Text?: string; FirstURL?: string }>;
      }>;
    };

    const results: Array<{ title: string; snippet: string; url: string }> = [];

    if (data.Abstract && data.AbstractURL) {
      results.push({
        title: data.AbstractSource || "Summary",
        snippet: data.Abstract,
        url: data.AbstractURL,
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.slice(0, 100),
            snippet: topic.Text,
            url: topic.FirstURL,
          });
        }
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.slice(0, 100),
                snippet: sub.Text,
                url: sub.FirstURL,
              });
            }
          }
        }
      }
    }

    return {
      results: results.slice(0, 8),
      query: input.query,
      abstract: data.Abstract || undefined,
    };
  },
});

const readWorldStateOutputSchema = z.object({
  found: z.boolean(),
  key: z.string(),
  value: z.string().nullable(),
  updatedBy: z.string().optional(),
  error: z.string().optional(),
});

registerTool({
  name: "read_world_state",
  description: "Read a value from the shared session world state. The world state is a key-value store shared across all bots in a task session. Use this to check what other bots have written or to recall previously stored findings.",
  inputSchema: z.object({
    key: z.string().describe("The key to read from the world state"),
  }),
  outputSchema: readWorldStateOutputSchema,
  execute: async (input, context: ToolContext) => {
    if (!context.sessionId) {
      return { found: false, key: input.key, value: null, error: "No session context" };
    }

    const [entry] = await db
      .select()
      .from(worldStateTable)
      .where(and(
        eq(worldStateTable.sessionId, context.sessionId),
        eq(worldStateTable.key, input.key)
      ));

    if (!entry) {
      return { found: false, key: input.key, value: null };
    }

    return { found: true, key: input.key, value: entry.value, updatedBy: entry.updatedBy ?? undefined };
  },
});

const writeWorldStateOutputSchema = z.object({
  success: z.boolean(),
  key: z.string().optional(),
  error: z.string().optional(),
});

registerTool({
  name: "write_world_state",
  description: "Write a value to the shared session world state. Use this to store findings, decisions, data, or any information that other bots in the session should be able to access. Values are persisted for the duration of the session.",
  inputSchema: z.object({
    key: z.string().describe("The key to write to"),
    value: z.string().describe("The value to store"),
  }),
  outputSchema: writeWorldStateOutputSchema,
  execute: async (input, context: ToolContext) => {
    if (!context.sessionId) {
      return { success: false, error: "No session context" };
    }

    const [existing] = await db
      .select()
      .from(worldStateTable)
      .where(and(
        eq(worldStateTable.sessionId, context.sessionId),
        eq(worldStateTable.key, input.key)
      ));

    if (existing) {
      await db
        .update(worldStateTable)
        .set({ value: input.value, updatedBy: context.botName || "unknown" })
        .where(eq(worldStateTable.id, existing.id));
    } else {
      await db.insert(worldStateTable).values({
        sessionId: context.sessionId,
        key: input.key,
        value: input.value,
        updatedBy: context.botName || "unknown",
      });
    }

    return { success: true, key: input.key };
  },
});

const platformDataItemSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  isAvailable: z.boolean().optional(),
  objective: z.string().optional(),
  status: z.string().optional(),
});

const readPlatformDataOutputSchema = z.object({
  entity: z.string(),
  count: z.number(),
  data: z.array(platformDataItemSchema),
  error: z.string().optional(),
});

registerTool({
  name: "read_platform_data",
  description: "Query platform data such as bots, sessions, or conversations from the database. Use this to look up information about available bots, active sessions, or recent activity.",
  inputSchema: z.object({
    entity: z.enum(["bots", "sessions", "conversations"]).describe("The type of data to query"),
    limit: z.number().optional().describe("Maximum number of results to return (default 10)"),
  }),
  outputSchema: readPlatformDataOutputSchema,
  execute: async (input, context: ToolContext) => {
    const maxResults = input.limit ?? 10;

    if (input.entity === "bots") {
      if (context.sessionId) {
        const sessionBotRows = await db
          .select()
          .from(taskSessionBotsTable)
          .where(eq(taskSessionBotsTable.sessionId, context.sessionId));
        const botIds = sessionBotRows.map((sb) => sb.botId);
        if (botIds.length > 0) {
          const query = await db.select().from(botsTable).where(inArray(botsTable.id, botIds)).limit(maxResults);
          return {
            entity: "bots",
            count: query.length,
            data: query.map((b) => ({
              id: b.id,
              name: b.name,
              title: b.title,
              department: b.department,
              isAvailable: b.isAvailable,
            })),
          };
        }
        return { entity: "bots", count: 0, data: [] };
      }
      return { entity: "bots", count: 0, data: [], error: "No session context — cannot enumerate bots globally" };
    }

    if (input.entity === "sessions") {
      if (!context.sessionId) {
        return { entity: "sessions", count: 0, data: [], error: "No session context — cannot enumerate sessions globally" };
      }
      const [session] = await db
        .select()
        .from(taskSessionsTable)
        .where(eq(taskSessionsTable.id, context.sessionId));
      return {
        entity: "sessions",
        count: session ? 1 : 0,
        data: session ? [{ id: session.id, objective: session.objective, status: session.status }] : [],
      };
    }

    if (input.entity === "conversations") {
      if (!context.conversationId) {
        return { entity: "conversations", count: 0, data: [], error: "No conversation context — cannot enumerate conversations globally" };
      }
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, context.conversationId));
      return {
        entity: "conversations",
        count: conv ? 1 : 0,
        data: conv ? [{ id: conv.id, title: conv.title, status: conv.status }] : [],
      };
    }

    return { entity: input.entity, count: 0, data: [] };
  },
});

const delegateToBotOutputSchema = z.object({
  success: z.boolean(),
  botId: z.number().optional(),
  botName: z.string().optional(),
  botTitle: z.string().optional(),
  response: z.string().optional(),
  error: z.string().optional(),
});

registerTool({
  name: "delegate_to_bot",
  description: "Delegate a sub-task to a specific bot teammate and get their response. Use this when a question or task falls within another bot's expertise. The delegated bot will provide a focused response to the sub-task.",
  inputSchema: z.object({
    botId: z.number().describe("The ID of the bot to delegate to"),
    task: z.string().describe("The sub-task or question to delegate"),
  }),
  outputSchema: delegateToBotOutputSchema,
  execute: async (input, context: ToolContext) => {
    if (context.sessionId) {
      const sessionBotRows = await db
        .select()
        .from(taskSessionBotsTable)
        .where(and(
          eq(taskSessionBotsTable.sessionId, context.sessionId),
          eq(taskSessionBotsTable.botId, input.botId)
        ));
      if (sessionBotRows.length === 0) {
        return { success: false, error: `Bot with ID ${input.botId} is not part of this session` };
      }
    }

    const [bot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, input.botId));

    if (!bot) {
      return { success: false, error: `Bot with ID ${input.botId} not found` };
    }

    const systemPrompt = `You are ${bot.name}, ${bot.title} in the ${bot.department} department.
Personality: ${bot.personality}
Your responsibilities: ${bot.responsibilities.join("; ")}

You have been asked by a teammate to handle a specific sub-task. Provide a focused, expert response (3-5 sentences).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input.task },
      ],
    });

    const response = completion.choices[0]?.message?.content ?? "I'll look into this.";

    return {
      success: true,
      botId: bot.id,
      botName: bot.name,
      botTitle: bot.title,
      response,
    };
  },
});
