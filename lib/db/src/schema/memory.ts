import { pgTable, serial, text, timestamp, integer, vector, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const botMemoriesTable = pgTable("bot_memories", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id"),
  sessionId: integer("session_id"),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  topic: text("topic"),
  embedding: vector("embedding", { dimensions: 1536 }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  supersededByBeliefId: integer("superseded_by_belief_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bot_memories_bot_id_idx").on(table.botId),
  index("bot_memories_client_id_idx").on(table.clientId),
  // Approximate-nearest-neighbor index so top-k vector retrieval stays roughly
  // flat as memory grows, instead of a sequential cosine scan over every row.
  index("bot_memories_embedding_hnsw_idx").using(
    "hnsw",
    table.embedding.op("vector_cosine_ops"),
  ),
]);

export const botAssignmentsTable = pgTable("bot_assignments", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),
  schedule: text("schedule").notNull().default("daily"),
  isActive: text("is_active").notNull().default("true"),
  actionMode: text("action_mode").notNull().default("passive"),
  actionPrompt: text("action_prompt"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  parentGoalId: integer("parent_goal_id"),
  horizon: text("horizon").notNull().default("weekly"),
  subTasks: jsonb("sub_tasks")
    .$type<Array<{
      id: string;
      title: string;
      dependsOn: string[];
      status: "pending" | "running" | "done" | "blocked";
      completedAt?: string;
    }>>()
    .default([]),
  progressScore: integer("progress_score").notNull().default(0),
  blockingOn: jsonb("blocking_on")
    .$type<Array<{ reason: string; since: string }>>()
    .default([]),
  resourceRequirements: jsonb("resource_requirements")
    .$type<{
      timeBudgetMinutes: number;
      costBudgetCents: number;
      clientAttentionUnits: number;
    }>()
    .default({ timeBudgetMinutes: 60, costBudgetCents: 500, clientAttentionUnits: 1 }),
  priorityTier: integer("priority_tier").notNull().default(2),
  generatedBy: text("generated_by").notNull().default("human"),
  impactScore: integer("impact_score"),
  feasibilityScore: integer("feasibility_score"),
  evidenceChain: jsonb("evidence_chain").$type<string[]>().default([]),
  autoApproveThreshold: integer("auto_approve_threshold"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const backgroundReportsTable = pgTable("background_reports", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => botAssignmentsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  summary: text("summary").notNull(),
  runStatus: text("run_status").notNull().default("success"),
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
