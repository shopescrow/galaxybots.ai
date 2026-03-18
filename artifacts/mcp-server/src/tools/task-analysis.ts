import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiPost } from "../api-client.js";

export function registerTaskAnalysisTool(server: McpServer): void {
  server.tool(
    "analyze_task",
    "Submit a business objective to Optima Prime and receive a team proposal with matched bots, proposed new bots, and reasoning. Pass progressToken for streaming analysis stage updates.",
    {
      objective: z.string().describe("The business objective or task to analyze"),
      progressToken: z.union([z.string(), z.number()]).optional().describe("Optional MCP progress token for streaming analysis stage updates"),
    },
    async ({ objective, progressToken }, extra) => {
      console.log(`[MCP] analyze_task: Analyzing objective: "${objective.substring(0, 100)}..."`);

      const sendProgress = async (msg: string, progress: number, total: number) => {
        const token = progressToken ?? extra._meta?.progressToken;
        if (token !== undefined && extra.sendNotification) {
          try {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken: token, progress, total, message: msg },
            });
          } catch { }
        }
      };

      try {
        await sendProgress("analyzing", 1, 3);

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

        await sendProgress("composing_team", 2, 3);
        console.log(`[MCP] analyze_task: Matched ${result.matchedBots.length} bots, proposed ${result.proposedBots.length} new bots`);

        const teamSummary = [
          ...result.matchedBots.map(b => b.name),
          ...result.proposedBots.map(b => `${b.name} (proposed)`),
        ].join(", ") || "no bots";
        await sendProgress(`complete: team=[${teamSummary}]`, 3, 3);

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
