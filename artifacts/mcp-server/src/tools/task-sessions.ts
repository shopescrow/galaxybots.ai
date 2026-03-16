import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiGet, apiPost } from "../api-client.js";

export function registerTaskSessionTools(server: McpServer): void {
  server.tool(
    "create_task_session",
    "Create a Task Room with a specified objective and list of bot IDs. Returns the created session with its team.",
    {
      objective: z.string().describe("The business objective for the task session"),
      botIds: z.array(z.number()).describe("Array of bot IDs to include in the task session team"),
    },
    async ({ objective, botIds }) => {
      console.log(`[MCP] create_task_session: objective="${objective.substring(0, 80)}...", botIds=[${botIds.join(",")}]`);
      try {
        const result = await apiPost<{
          id: number;
          objective: string;
          status: string;
          clientId: number;
          createdAt: string;
          teamBots: Array<{
            id: number;
            name: string;
            title: string;
            department: string;
          }>;
        }>("/task-sessions", { objective, botIds });

        console.log(`[MCP] create_task_session: Created session ${result.id} with ${result.teamBots?.length ?? 0} bots`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] create_task_session: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error creating task session: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_task_sessions",
    "List recent task sessions with their ID, objective, status, team size, and creation date.",
    {},
    async () => {
      console.log("[MCP] list_task_sessions: Fetching sessions");
      try {
        const sessions = await apiGet<Array<{
          id: number;
          objective: string;
          status: string;
          clientId: number;
          createdAt: string;
          teamBots: Array<{ id: number; name: string; title: string }>;
        }>>("/task-sessions");

        const result = sessions.map((s) => ({
          id: s.id,
          objective: s.objective,
          status: s.status,
          teamSize: s.teamBots?.length ?? 0,
          clientId: s.clientId,
          createdAt: s.createdAt,
        }));

        console.log(`[MCP] list_task_sessions: Found ${result.length} sessions`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] list_task_sessions: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error listing task sessions: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
