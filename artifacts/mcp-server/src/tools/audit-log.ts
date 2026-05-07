import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, botAuditLogTable } from "@workspace/db";

export function registerAuditLogTool(server: McpServer): void {
  server.tool(
    "log_decision",
    "Record an AI action or decision to the audit log. Use the requiresReview flag to mark low-confidence decisions for human review.",
    {
      action: z.string().describe("Short description of the action or decision taken"),
      reasoning: z.string().describe("Explanation of why this action was taken"),
      confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
      requiresReview: z.boolean().optional().default(false).describe("Whether this decision requires human review (default: false)"),
      clientId: z.number().int().optional().describe("Optional client ID this decision relates to"),
      botId: z.number().int().optional().describe("Optional bot ID that made this decision"),
      metadata: z.record(z.unknown()).optional().describe("Optional additional metadata as key-value pairs"),
    },
    async ({ action, reasoning, confidence, requiresReview, clientId, botId, metadata }) => {
      console.log(`[MCP] log_decision: action="${action}", confidence=${confidence}, requiresReview=${requiresReview}`);
      try {
        const [entry] = await db.insert(botAuditLogTable).values({
          action,
          reasoning,
          confidence,
          requiresReview,
          clientId: clientId ?? null,
          botId: botId ?? null,
          metadata: metadata ?? null,
        }).returning();

        console.log(`[MCP] log_decision: Logged decision ID ${entry.id}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              id: entry.id,
              action: entry.action,
              confidence: entry.confidence,
              requiresReview: entry.requiresReview,
              createdAt: entry.createdAt,
            }, null, 2),
          }],
        };
      } catch (error) {
        console.error("[MCP] log_decision: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error logging decision: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
