import {
  pgTable,
  serial,
  integer,
  timestamp,
  real,
  numeric,
  bigint,
  text,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Hourly per-tenant metric rollups.
 *
 * Pre-aggregated from llm_usage_log so the owner observability view can
 * serve 1 000 tenants without scanning raw log tables.  A single upsert
 * job runs every 5 minutes and fills/updates the current-hour bucket.
 */
export const tenantMetricRollupsTable = pgTable(
  "tenant_metric_rollups",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errorRatePct: real("error_rate_pct").notNull().default(0),
    p50LatencyMs: real("p50_latency_ms"),
    p95LatencyMs: real("p95_latency_ms"),
    p99LatencyMs: real("p99_latency_ms"),
    spendUsd: numeric("spend_usd", { precision: 18, scale: 6 }).notNull().default("0"),
    tokenCount: bigint("token_count", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tenant_metric_rollups_client_window_ux").on(t.clientId, t.windowStart),
    index("tenant_metric_rollups_client_window_idx").on(t.clientId, t.windowStart),
    index("tenant_metric_rollups_window_idx").on(t.windowStart),
  ],
);

/**
 * Owner-defined service-level objectives.
 *
 * Each SLO says: "for metric M, value must be <= or >= threshold for any
 * tenant (or system-wide) over a rolling window_hours window."
 */
export const sloDefinitionsTable = pgTable("slo_definitions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  metric: text("metric")
    .notNull()
    .$type<
      | "error_rate_pct"
      | "p95_latency_ms"
      | "p50_latency_ms"
      | "spend_usd"
      | "request_count"
    >(),
  operator: text("operator").notNull().$type<"lte" | "gte">(),
  threshold: numeric("threshold", { precision: 18, scale: 6 }).notNull(),
  windowHours: integer("window_hours").notNull().default(1),
  severity: text("severity").notNull().$type<"warning" | "critical">().default("warning"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Log of SLO violations, one row per (slo, tenant, window) breach.
 *
 * Used to deduplicate alerts (don't re-fire while still breaching) and to
 * show the owner a searchable breach history.
 */
export const sloBreachEventsTable = pgTable(
  "slo_breach_events",
  {
    id: serial("id").primaryKey(),
    sloId: integer("slo_id").notNull(),
    clientId: integer("client_id"),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    observedValue: numeric("observed_value", { precision: 18, scale: 6 }).notNull(),
    thresholdValue: numeric("threshold_value", { precision: 18, scale: 6 }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("slo_breach_events_slo_client_idx").on(t.sloId, t.clientId, t.windowStart),
    index("slo_breach_events_created_idx").on(t.createdAt),
  ],
);

export const insertTenantMetricRollupSchema = createInsertSchema(tenantMetricRollupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSloDefinitionSchema = createInsertSchema(sloDefinitionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSloBreachEventSchema = createInsertSchema(sloBreachEventsTable).omit({
  id: true,
  createdAt: true,
});

export type TenantMetricRollup = typeof tenantMetricRollupsTable.$inferSelect;
export type SloDefinition = typeof sloDefinitionsTable.$inferSelect;
export type SloBreachEvent = typeof sloBreachEventsTable.$inferSelect;
export type InsertTenantMetricRollup = z.infer<typeof insertTenantMetricRollupSchema>;
export type InsertSloDefinition = z.infer<typeof insertSloDefinitionSchema>;
export type InsertSloBreachEvent = z.infer<typeof insertSloBreachEventSchema>;
