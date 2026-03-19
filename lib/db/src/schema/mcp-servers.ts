import { pgTable, serial, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const mcpServersTable = pgTable("mcp_servers", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  sseUrl: text("sse_url"),
  authType: text("auth_type").notNull().default("api_key"),
  tags: jsonb("tags").notNull().default([]),
  isOwn: boolean("is_own").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type McpServer = typeof mcpServersTable.$inferSelect;
export type NewMcpServer = typeof mcpServersTable.$inferInsert;
