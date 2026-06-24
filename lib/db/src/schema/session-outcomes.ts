import { pgTable, serial, text, timestamp, integer, numeric, jsonb, uniqueIndex, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { taskSessionsTable } from "./task-sessions";

export const sessionOutcomesTable = pgTable("session_outcomes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => taskSessionsTable.id, { onDelete: "cascade" }).unique(),
  clientId: integer("client_id"),
  botsDeployed: jsonb("bots_deployed").$type<{ botId: number; botName: string; department: string }[]>().default([]),
  toolsExecuted: jsonb("tools_executed").$type<Record<string, number>>().default({}),
  toolsExecutedTotal: integer("tools_executed_total").notNull().default(0),
  durationMinutes: numeric("duration_minutes").notNull().default("0"),
  estimatedHoursSaved: numeric("estimated_hours_saved").notNull().default("0"),
  outcomeSummary: text("outcome_summary").notNull().default(""),
  department: text("department"),
  loopIterations: integer("loop_iterations"),
  costCents: integer("cost_cents"),
  terminationReason: text("termination_reason"),
  failureCategory: text("failure_category"),
  loopTrace: jsonb("loop_trace").$type<Record<string, unknown>>(),
  taskDifficultyScore: real("task_difficulty_score"),
  promptQualityScore: real("prompt_quality_score"),
  inputTokenCount: integer("input_token_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roiShareableReportsTable = pgTable("roi_shareable_reports", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  shareToken: text("share_token").notNull().unique(),
  title: text("title").notNull(),
  dateFrom: timestamp("date_from", { withTimezone: true }).notNull(),
  dateTo: timestamp("date_to", { withTimezone: true }).notNull(),
  reportData: jsonb("report_data").$type<Record<string, unknown>>().default({}),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionOutcomeSchema = createInsertSchema(sessionOutcomesTable).omit({ id: true, createdAt: true });
export const insertRoiShareableReportSchema = createInsertSchema(roiShareableReportsTable).omit({ id: true, createdAt: true });

export type SessionOutcome = typeof sessionOutcomesTable.$inferSelect;
export type InsertSessionOutcome = z.infer<typeof insertSessionOutcomeSchema>;
export type RoiShareableReport = typeof roiShareableReportsTable.$inferSelect;
export type InsertRoiShareableReport = z.infer<typeof insertRoiShareableReportSchema>;
