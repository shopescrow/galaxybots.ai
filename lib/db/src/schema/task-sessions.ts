import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

export const taskSessionsTable = pgTable("task_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const taskSessionBotsTable = pgTable("task_session_bots", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => taskSessionsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskSessionMessagesTable = pgTable("task_session_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => taskSessionsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id"),
  botName: text("bot_name"),
  botTitle: text("bot_title"),
  role: text("role").notNull().default("bot"),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default("text"),
  toolData: jsonb("tool_data"),
  flaggedRoles: text("flagged_roles").array().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTaskSessionSchema = createInsertSchema(taskSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTaskSessionBotSchema = createInsertSchema(taskSessionBotsTable).omit({ id: true, addedAt: true });
export const insertTaskSessionMessageSchema = createInsertSchema(taskSessionMessagesTable).omit({ id: true, createdAt: true });

export type TaskSession = typeof taskSessionsTable.$inferSelect;
export type InsertTaskSession = z.infer<typeof insertTaskSessionSchema>;
export type TaskSessionBot = typeof taskSessionBotsTable.$inferSelect;
export type InsertTaskSessionBot = z.infer<typeof insertTaskSessionBotSchema>;
export type TaskSessionMessage = typeof taskSessionMessagesTable.$inferSelect;
export type InsertTaskSessionMessage = z.infer<typeof insertTaskSessionMessageSchema>;
