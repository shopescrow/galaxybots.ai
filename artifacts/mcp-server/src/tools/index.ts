import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBotTools } from "./bots.js";
import { registerClientTools } from "./clients.js";
import { registerMessagingTool } from "./messaging.js";
import { registerTaskAnalysisTool } from "./task-analysis.js";
import { registerTaskSessionTools } from "./task-sessions.js";
import { registerMemorySearchTool } from "./memory-search.js";

export function registerAllTools(server: McpServer): void {
  console.log("[MCP] Registering all tools...");
  registerBotTools(server);
  registerClientTools(server);
  registerMessagingTool(server);
  registerTaskAnalysisTool(server);
  registerTaskSessionTools(server);
  registerMemorySearchTool(server);
  console.log("[MCP] All tools registered successfully");
}
