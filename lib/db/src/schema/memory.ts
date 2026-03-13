import { pgTable, serial, text, timestamp, integer, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";

export const botMemoriesTable = pgTable("bot_memories", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"),
  sessionId: integer("session_id"),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  topic: text("topic"),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bot_memories_bot_id_idx").on(table.botId),
]);

export const botAssignmentsTable = pgTable("bot_assignments", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),
  schedule: text("schedule").notNull().default("daily"),
  isActive: text("is_active").notNull().default("true"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backgroundReportsTable = pgTable("background_reports", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => botAssignmentsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotMemorySchema = createInsertSchema(botMemoriesTable).omit({ id: true, createdAt: true });
export const insertBotAssignmentSchema = createInsertSchema(botAssignmentsTable).omit({ id: true, createdAt: true, lastRunAt: true });
export const insertBackgroundReportSchema = createInsertSchema(backgroundReportsTable).omit({ id: true, createdAt: true, deliveredAt: true });

export type BotMemory = typeof botMemoriesTable.$inferSelect;
export type InsertBotMemory = z.infer<typeof insertBotMemorySchema>;
export type BotAssignment = typeof botAssignmentsTable.$inferSelect;
export type InsertBotAssignment = z.infer<typeof insertBotAssignmentSchema>;
export type BackgroundReport = typeof backgroundReportsTable.$inferSelect;
export type InsertBackgroundReport = z.infer<typeof insertBackgroundReportSchema>;
