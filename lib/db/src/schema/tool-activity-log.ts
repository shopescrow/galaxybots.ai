import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toolActivityLogTable = pgTable("tool_activity_log", {
  id: serial("id").primaryKey(),
  toolName: text("tool_name").notNull(),
  clientId: integer("client_id"),
  sessionId: integer("session_id"),
  botName: text("bot_name"),
  url: text("url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertToolActivityLogSchema = createInsertSchema(toolActivityLogTable).omit({
  id: true,
  createdAt: true,
});

export type ToolActivityLog = typeof toolActivityLogTable.$inferSelect;
export type InsertToolActivityLog = z.infer<typeof insertToolActivityLogSchema>;
