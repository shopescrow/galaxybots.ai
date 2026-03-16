import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api-client.js";

export function registerTaskAnalysisTool(server: McpServer): void {
  server.tool(
    "analyze_task",
    "Submit a business objective to Optima Prime and receive a team proposal with matched bots, proposed new bots, and reasoning.",
    {
      objective: z.string().describe("The business objective or task to analyze"),
    },
    async ({ objective }) => {
      console.log(`[MCP] analyze_task: Analyzing objective: "${objective.substring(0, 100)}..."`);
      try {
        const result = await apiPost<{
          objective: string;
          matchedBots: Array<{
            id: number;
            name: string;
            title: string;
            department: string;
            description: string;
          }>;
          proposedBots: Array<{
            name: string;
            title: string;
            department: string;
            personality: string;
            responsibilities: string[];
          }>;
          reasoning: string;
        }>("/task-sessions/analyze", { objective });

        console.log(`[MCP] analyze_task: Matched ${result.matchedBots.length} bots, proposed ${result.proposedBots.length} new bots`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        console.error("[MCP] analyze_task: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error analyzing task: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
