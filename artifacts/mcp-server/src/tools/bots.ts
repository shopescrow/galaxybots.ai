import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, botsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export function registerBotTools(server: McpServer): void {
  server.tool(
    "list_bots",
    "List all GalaxyBots AI bots with their name, title, department, and description.",
    {},
    async () => {
      console.log("[MCP] list_bots: Fetching all bots");
      try {
        const bots = await db.select({
          id: botsTable.id,
          name: botsTable.name,
          title: botsTable.title,
          department: botsTable.department,
          description: botsTable.description,
          category: botsTable.category,
          isAvailable: botsTable.isAvailable,
        }).from(botsTable);

        console.log(`[MCP] list_bots: Found ${bots.length} bots`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bots, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] list_bots: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error listing bots: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_bot",
    "Get full details of a specific GalaxyBots bot by ID (integer) or name (case-insensitive string match).",
    {
      identifier: z.union([z.number(), z.string()]).describe("Bot ID (number) or bot name (string, case-insensitive)"),
    },
    async ({ identifier }) => {
      console.log(`[MCP] get_bot: Looking up bot with identifier: ${identifier}`);
      try {
        let bot;
        if (typeof identifier === "number") {
          const [result] = await db.select().from(botsTable).where(eq(botsTable.id, identifier));
          bot = result;
        } else {
          const [result] = await db.select().from(botsTable).where(
            sql`LOWER(${botsTable.name}) = LOWER(${identifier})`
          );
          bot = result;
        }

        if (!bot) {
          console.log(`[MCP] get_bot: Bot not found for identifier: ${identifier}`);
          return {
            content: [{ type: "text" as const, text: `Bot not found for identifier: ${identifier}` }],
            isError: true,
          };
        }

        console.log(`[MCP] get_bot: Found bot: ${bot.name} (ID: ${bot.id})`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(bot, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] get_bot: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error getting bot: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
