import { pgTable, serial, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";

export const mcpToolCallsTable = pgTable("mcp_tool_calls", {
  id: serial("id").primaryKey(),
  partnerKeyId: integer("partner_key_id").references(() => platformApiKeysTable.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  inputUrl: text("input_url"),
  inputJson: jsonb("input_json"),
  responseStatus: text("response_status").notNull(),
  latencyMs: integer("latency_ms").notNull().default(0),
  cached: boolean("cached").notNull().default(false),
  calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("mcp_tool_calls_partner_key_id_idx").on(table.partnerKeyId),
  index("mcp_tool_calls_called_at_idx").on(table.calledAt),
  index("mcp_tool_calls_tool_name_idx").on(table.toolName),
]);

export type McpToolCall = typeof mcpToolCallsTable.$inferSelect;
