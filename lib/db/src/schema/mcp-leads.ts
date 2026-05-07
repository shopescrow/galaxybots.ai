import { pgTable, serial, text, timestamp, integer, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";

export const mcpLeadSourceEnum = pgEnum("mcp_lead_source", [
  "request_demo",
  "roi_signal",
  "pricing_signal",
  "launch_page",
]);

export const mcpLeadsTable = pgTable("mcp_leads", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  company: text("company"),
  source: mcpLeadSourceEnum("source").notNull().default("launch_page"),
  queryContext: jsonb("query_context"),
  partnerKeyId: integer("partner_key_id").references(() => platformApiKeysTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("mcp_leads_email_source_idx").on(table.email, table.source),
]);

export type McpLead = typeof mcpLeadsTable.$inferSelect;
export type NewMcpLead = typeof mcpLeadsTable.$inferInsert;
