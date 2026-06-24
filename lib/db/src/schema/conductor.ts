import { pgTable, serial, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const COMMUNICATION_STRATEGIES = [
  "parallel_synthesis",
  "sequential_debate",
  "hierarchical_delegation",
  "round_robin_review",
] as const;

export type CommunicationStrategy = (typeof COMMUNICATION_STRATEGIES)[number];

export const conductorStrategiesTable = pgTable("conductor_strategies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  taskCategory: text("task_category").notNull(),
  strategyChosen: text("strategy_chosen").notNull(),
  rationale: text("rationale").notNull(),
  agentsUsed: jsonb("agents_used").notNull().default([]),
  qualityScore: real("quality_score"),
  taskDifficultyScore: real("task_difficulty_score"),
  promptQualityScore: real("prompt_quality_score"),
  costUsd: real("cost_usd"),
  durationMs: integer("duration_ms"),
  sessionId: text("session_id"),
  contextType: text("context_type").notNull().default("conversation"),
  sampleCount: integer("sample_count").notNull().default(0),
  modelVersion: text("model_version"),
  modelTier: text("model_tier"),
  abVariant: text("ab_variant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertConductorStrategySchema = createInsertSchema(conductorStrategiesTable).omit({
  id: true,
  createdAt: true,
});

export type ConductorStrategy = typeof conductorStrategiesTable.$inferSelect;
export type InsertConductorStrategy = z.infer<typeof insertConductorStrategySchema>;

export interface ConductorMeta {
  strategyId: number;
  strategy: CommunicationStrategy;
  rationale: string;
  taskCategory: string;
}
