import { pgTable, serial, text, timestamp, real, integer, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

/**
 * Per-call model-selection telemetry (task #231). Every model decision the
 * conductor strategies make records one row here: which model served the task,
 * the task category, an a-priori difficulty bucket, and (once the session
 * outcome is captured) the blended reward signal — quality × cost × latency.
 *
 * This is the substrate the model-selection bandit learns from. It mirrors the
 * conductor's `conductor_strategies` learning table but for MODEL choice rather
 * than strategy choice. Shadow-comparison rows (shadow=true) record a candidate
 * model run in parallel and are EXCLUDED from live selection priors until the
 * periodic re-evaluation job promotes them.
 */
export const modelSelectionTelemetryTable = pgTable("model_selection_telemetry", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id"),
  sessionId: text("session_id"),
  conductorStrategyId: integer("conductor_strategy_id"),
  taskCategory: text("task_category").notNull(),
  model: text("model").notNull(),
  modelTier: text("model_tier"),
  /** easy | medium | hard — a-priori difficulty bucket used for routing. */
  difficultyBucket: text("difficulty_bucket"),
  /** "optimizer" | "fallback" | "override" | "cost_relief" | "shadow" | "pending_approval" */
  selectionMode: text("selection_mode").notNull().default("fallback"),
  /** True for a shadow/comparison candidate that did NOT serve the user. */
  shadow: boolean("shadow").notNull().default(false),
  /** For shadow rows, the model that actually answered the user. */
  chosenModel: text("chosen_model"),
  // ── Reward components (filled at outcome capture; null until then) ──
  qualityScore: real("quality_score"),
  costUsd: real("cost_usd"),
  latencyMs: integer("latency_ms"),
  taskDifficultyScore: real("task_difficulty_score"),
  promptQualityScore: real("prompt_quality_score"),
  /** Blended reward = qualityWeight·quality + (1-qualityWeight)·efficiency. */
  rewardScore: real("reward_score"),
  sampleCount: integer("sample_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModelSelectionTelemetrySchema = createInsertSchema(modelSelectionTelemetryTable).omit({
  id: true,
  createdAt: true,
});

export type ModelSelectionTelemetry = typeof modelSelectionTelemetryTable.$inferSelect;
export type InsertModelSelectionTelemetry = z.infer<typeof insertModelSelectionTelemetrySchema>;

/**
 * Per-(category, model, difficulty) reputation summary recomputed by the
 * periodic re-evaluation job (task #231 step 6). Live selection reads telemetry
 * directly for freshness; this table is the observability/promotion surface and
 * carries the `promoted` flag set when a shadow candidate clears the owner
 * threshold.
 */
export const modelReputationTable = pgTable("model_reputation", {
  id: serial("id").primaryKey(),
  taskCategory: text("task_category").notNull(),
  model: text("model").notNull(),
  difficultyBucket: text("difficulty_bucket").notNull().default("all"),
  avgReward: real("avg_reward"),
  avgQuality: real("avg_quality"),
  avgCostUsd: real("avg_cost_usd"),
  avgLatencyMs: real("avg_latency_ms"),
  sampleCount: integer("sample_count").notNull().default(0),
  /** Set true when a shadow candidate has cleared the promotion threshold. */
  promoted: boolean("promoted").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCategoryModelBucket: unique("model_reputation_cat_model_bucket_uniq").on(
    t.taskCategory,
    t.model,
    t.difficultyBucket,
  ),
}));

export type ModelReputation = typeof modelReputationTable.$inferSelect;

/**
 * Per-bot model allow/deny list (task #231 owner control). When a row exists
 * with allowed=false the model is excluded from optimizer selection for that
 * bot; allowed=true rows, when any exist for a bot, restrict selection to the
 * allow-list. Absence of rows means "no per-bot restriction".
 */
export const botModelPoliciesTable = pgTable("bot_model_policies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "cascade" }).notNull(),
  model: text("model").notNull(),
  allowed: boolean("allowed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqBotModel: unique("bot_model_policies_bot_model_uniq").on(t.botId, t.model),
}));

export type BotModelPolicy = typeof botModelPoliciesTable.$inferSelect;
