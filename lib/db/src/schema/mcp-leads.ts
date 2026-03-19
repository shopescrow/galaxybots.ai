import { pgTable, serial, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";

export const mcpLeadSourceEnum = pgEnum("mcp_lead_source", [
  "request_demo",
  "roi_signal",
  "pricing_signal",
]);

export const mcpLeadsTable = pgTable("mcp_leads", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  company: text("company"),
  source: mcpLeadSourceEnum("source").notNull(),
  queryContext: jsonb("query_context"),
  partnerKeyId: integer("partner_key_id").references(() => platformApiKeysTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type McpLead = typeof mcpLeadsTable.$inferSelect;
export type NewMcpLead = typeof mcpLeadsTable.$inferInsert;
