import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
  integer,
  bigint,
  numeric,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const dataLifecycleConfigTable = pgTable("data_lifecycle_config", {
  id:             serial("id").primaryKey(),
  tableName:      text("table_name").notNull().unique(),
  retainDays:     integer("retain_days").notNull().default(90),
  archiveEnabled: boolean("archive_enabled").notNull().default(false),
  lastPrunedAt:   timestamp("last_pruned_at", { withTimezone: true }),
  rowsPruned:     bigint("rows_pruned", { mode: "number" }).notNull().default(0),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DataLifecycleConfig = typeof dataLifecycleConfigTable.$inferSelect;

export const llmUsageDailyRollupTable = pgTable("llm_usage_daily_rollup", {
  id:               serial("id").primaryKey(),
  rollupDate:       date("rollup_date").notNull(),
  clientId:         integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  botId:            integer("bot_id"),
  model:            text("model").notNull(),
  modelTier:        text("model_tier"),
  callCount:        integer("call_count").notNull().default(0),
  promptTokens:     bigint("prompt_tokens", { mode: "number" }).notNull().default(0),
  completionTokens: bigint("completion_tokens", { mode: "number" }).notNull().default(0),
  totalCostUsd:     numeric("total_cost_usd").notNull().default("0"),
  avgLatencyMs:     real("avg_latency_ms").notNull().default(0),
  p95LatencyMs:     real("p95_latency_ms"),
  computedAt:       timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LlmUsageDailyRollup = typeof llmUsageDailyRollupTable.$inferSelect;
export const insertLlmUsageDailyRollupSchema = createInsertSchema(llmUsageDailyRollupTable).omit({
  id: true, computedAt: true,
});
export type InsertLlmUsageDailyRollup = z.infer<typeof insertLlmUsageDailyRollupSchema>;

export const modelTelemetryDailyRollupTable = pgTable("model_telemetry_daily_rollup", {
  id:              serial("id").primaryKey(),
  rollupDate:      date("rollup_date").notNull(),
  clientId:        integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  taskCategory:    text("task_category").notNull(),
  model:           text("model").notNull(),
  modelTier:       text("model_tier"),
  selectionMode:   text("selection_mode"),
  shadow:          boolean("shadow").notNull().default(false),
  sampleCount:     integer("sample_count").notNull().default(0),
  avgRewardScore:  real("avg_reward_score"),
  avgQualityScore: real("avg_quality_score"),
  avgCostUsd:      real("avg_cost_usd"),
  avgLatencyMs:    real("avg_latency_ms"),
  computedAt:      timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ModelTelemetryDailyRollup = typeof modelTelemetryDailyRollupTable.$inferSelect;

export const auditLogDailyRollupTable = pgTable("audit_log_daily_rollup", {
  id:         serial("id").primaryKey(),
  rollupDate: date("rollup_date").notNull(),
  clientId:   integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  action:     text("action").notNull(),
  eventCount: integer("event_count").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogDailyRollup = typeof auditLogDailyRollupTable.$inferSelect;
