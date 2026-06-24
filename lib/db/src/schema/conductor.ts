import { pgTable, serial, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const COMMUNICATION_STRATEGIES = [
  "parallel_synthesis",
  "sequential_debate",
  "hierarchical_delegation",
  "round_robin_review",
] as const;

export type CommunicationStrategy = (typeof COMMUNICATION_STRATEGIES)[number];

export const conductorStrategiesTable = pgTable("conductor_strategies", {
  id: serial("id").primaryKey(),
  taskCategory: text("task_category").notNull(),
  strategyChosen: text("strategy_chosen").notNull(),
  rationale: text("rationale").notNull(),
  agentsUsed: jsonb("agents_used").notNull().default([]),
  qualityScore: real("quality_score"),
  costUsd: real("cost_usd"),
  durationMs: integer("duration_ms"),
  sessionId: text("session_id"),
  contextType: text("context_type").notNull().default("conversation"),
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
