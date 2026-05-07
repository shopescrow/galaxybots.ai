import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { taskSessionsTable } from "./task-sessions";

export const botMessagesTable = pgTable("bot_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => taskSessionsTable.id, { onDelete: "cascade" }).notNull(),
  fromBotId: integer("from_bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  fromBotName: text("from_bot_name"),
  toBotId: integer("to_bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  toBotName: text("to_bot_name"),
  taskId: text("task_id"),
  messageType: text("message_type").notNull().default("assignment"),
  payload: jsonb("payload"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotMessageSchema = createInsertSchema(botMessagesTable).omit({ id: true, createdAt: true });
export type BotMessage = typeof botMessagesTable.$inferSelect;
export type InsertBotMessage = z.infer<typeof insertBotMessageSchema>;
