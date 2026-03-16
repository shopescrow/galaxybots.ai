import { pgTable, serial, text, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const clientHealthScoresTable = pgTable("client_health_scores", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  trend: text("trend").notNull().default("stable"),
  tag: text("tag").notNull().default("healthy"),
  topSignals: jsonb("top_signals").default([]),
  recommendedAction: text("recommended_action"),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientHealthEventsTable = pgTable("client_health_events", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  value: numeric("value").notNull().default("1"),
  metadata: jsonb("metadata").default({}),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientHealthNotesTable = pgTable("client_health_notes", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  tagOverride: text("tag_override"),
  authorName: text("author_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientHealthScoreSchema = createInsertSchema(clientHealthScoresTable).omit({ id: true, computedAt: true });
export const insertClientHealthEventSchema = createInsertSchema(clientHealthEventsTable).omit({ id: true, recordedAt: true });
export const insertClientHealthNoteSchema = createInsertSchema(clientHealthNotesTable).omit({ id: true, createdAt: true });

export type ClientHealthScore = typeof clientHealthScoresTable.$inferSelect;
export type InsertClientHealthScore = z.infer<typeof insertClientHealthScoreSchema>;
export type ClientHealthEvent = typeof clientHealthEventsTable.$inferSelect;
export type InsertClientHealthEvent = z.infer<typeof insertClientHealthEventSchema>;
export type ClientHealthNote = typeof clientHealthNotesTable.$inferSelect;
export type InsertClientHealthNote = z.infer<typeof insertClientHealthNoteSchema>;
