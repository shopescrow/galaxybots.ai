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
import {
  registerPirateMonsterAllTools,
  registerPirateMonsterGalaxyBotsTools,
  type McpSessionContext,
} from "./piratemonster.js";

export function registerAllTools(
  server: McpServer,
  callerType: "galaxybots" | "piratemonster" = "galaxybots",
  sessionCtx: McpSessionContext = { partnerKeyId: null, rateLimit: Infinity }
): void {
  console.log(`[MCP] Registering tools for caller type: ${callerType}`);

  if (callerType === "piratemonster") {
    registerPirateMonsterAllTools(server, sessionCtx);
    console.log("[MCP] PirateMonster tools registered successfully");
    return;
  }

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
  registerPirateMonsterGalaxyBotsTools(server, sessionCtx);
  console.log("[MCP] All tools registered successfully (GalaxyBots + pm_get_score + pm_get_recommendations)");
}
