import { pgTable, serial, text, timestamp, integer, real, numeric, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Per-run scaling & profitability telemetry.
 *
 * Captures the observable outcomes of the scaling work (aggregation, adaptive
 * routing, caching, retrieval) so operators can see whether scaling is actually
 * saving money and preserving quality, and so the conductor can self-tune toward
 * the most profitable, quality-preserving configuration.
 *
 * Metrics whose underlying mechanism is not yet emitting a signal are stored as
 * NULL (cacheHitRate / retrievalHitRate / fidelityScore) rather than fabricated.
 */
export const scalingTelemetryTable = pgTable("scaling_telemetry", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  sessionId: text("session_id"),
  conductorStrategyId: integer("conductor_strategy_id"),
  taskCategory: text("task_category").notNull().default("execution"),
  strategy: text("strategy"),
  fleetSize: integer("fleet_size").notNull().default(1),
  modelTier: text("model_tier"),
  // Token economics
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  tokensSaved: integer("tokens_saved").notNull().default(0),
  // Profitability
  projectedCostUsd: numeric("projected_cost_usd").notNull().default("0"),
  creditRevenueUsd: numeric("credit_revenue_usd").notNull().default("0"),
  marginUsd: numeric("margin_usd").notNull().default("0"),
  // Aggregation shape
  aggregationDepth: integer("aggregation_depth").notNull().default(0),
  clusterSizes: jsonb("cluster_sizes").$type<number[]>().notNull().default([]),
  // Hit-rates & fidelity (NULL when the source mechanism has no signal yet)
  cacheHitRate: real("cache_hit_rate"),
  retrievalHitRate: real("retrieval_hit_rate"),
  fidelityScore: real("fidelity_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("scaling_telemetry_client_idx").on(table.clientId, table.createdAt),
  index("scaling_telemetry_category_idx").on(table.taskCategory, table.fleetSize),
]);

export const insertScalingTelemetrySchema = createInsertSchema(scalingTelemetryTable).omit({
  id: true,
  createdAt: true,
});

export type ScalingTelemetry = typeof scalingTelemetryTable.$inferSelect;
export type InsertScalingTelemetry = z.infer<typeof insertScalingTelemetrySchema>;
