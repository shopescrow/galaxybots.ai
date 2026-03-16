import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBotTools } from "./bots.js";
import { registerClientTools } from "./clients.js";
import { registerMessagingTool } from "./messaging.js";
import { registerTaskAnalysisTool } from "./task-analysis.js";
import { registerTaskSessionTools } from "./task-sessions.js";
import { registerMemorySearchTool } from "./memory-search.js";
import { registerWebSearchTool } from "./web-search.js";
import { registerHttpFetchTool } from "./http-fetch.js";
import { registerEmailTool } from "./email.js";
import { registerMetricsTool } from "./metrics.js";
import { registerAuditLogTool } from "./audit-log.js";

export function registerAllTools(server: McpServer): void {
  console.log("[MCP] Registering all tools...");
  registerBotTools(server);
  registerClientTools(server);
  registerMessagingTool(server);
  registerTaskAnalysisTool(server);
  registerTaskSessionTools(server);
  registerMemorySearchTool(server);
  registerWebSearchTool(server);
  registerHttpFetchTool(server);
  registerEmailTool(server);
  registerMetricsTool(server);
  registerAuditLogTool(server);
  console.log("[MCP] All tools registered successfully");
}
