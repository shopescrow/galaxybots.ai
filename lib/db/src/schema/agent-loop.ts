import { pgTable, serial, text, timestamp, integer, jsonb, numeric, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const botLoopConfigTable = pgTable("bot_loop_config", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  maxIterations: integer("max_iterations").notNull().default(10),
  timeBudgetMs: integer("time_budget_ms").notNull().default(120000),
  costBudgetCents: integer("cost_budget_cents").notNull().default(500),
  qualityThreshold: numeric("quality_threshold").notNull().default("0.7"),
  enableSelfEvaluation: boolean("enable_self_evaluation").notNull().default(true),
  enableBrowserAgent: boolean("enable_browser_agent").notNull().default(false),
  model: text("model").notNull().default("gpt-4o-mini"),
  fallbackModel: text("fallback_model"),
  networkAllowList: text("network_allow_list").array().default([]),
  autoApproveGoalImpactThreshold: integer("auto_approve_goal_impact_threshold").notNull().default(40),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botFailureLogTable = pgTable("bot_failure_log", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  sessionId: integer("session_id"),
  conversationId: integer("conversation_id"),
  failureCategory: text("failure_category").notNull(),
  failureDetail: text("failure_detail").notNull(),
  userInput: text("user_input"),
  lastThought: text("last_thought"),
  iterationsCompleted: integer("iterations_completed").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  toolsAttempted: text("tools_attempted").array().default([]),
  traceSnapshot: jsonb("trace_snapshot").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const confidencePredictionsTable = pgTable("confidence_predictions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  conversationId: integer("conversation_id"),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  iteration: integer("iteration").notNull().default(0),
  predictedConfidence: numeric("predicted_confidence").notNull(),
  completenessScore: numeric("completeness_score"),
  accuracyScore: numeric("accuracy_score"),
  relevanceScore: numeric("relevance_score"),
  terminationReason: text("termination_reason"),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotLoopConfigSchema = createInsertSchema(botLoopConfigTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBotFailureLogSchema = createInsertSchema(botFailureLogTable).omit({ id: true, createdAt: true });
export const insertConfidencePredictionSchema = createInsertSchema(confidencePredictionsTable).omit({ id: true, createdAt: true });

export type BotLoopConfig = typeof botLoopConfigTable.$inferSelect;
export type InsertBotLoopConfig = z.infer<typeof insertBotLoopConfigSchema>;
export type BotFailureLog = typeof botFailureLogTable.$inferSelect;
export type InsertBotFailureLog = z.infer<typeof insertBotFailureLogSchema>;
export type ConfidencePrediction = typeof confidencePredictionsTable.$inferSelect;
export type InsertConfidencePrediction = z.infer<typeof insertConfidencePredictionSchema>;
