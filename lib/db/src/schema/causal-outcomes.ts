import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export const causalOutcomesTable = pgTable(
  "causal_outcomes",
  {
    id: serial("id").primaryKey(),
    actionId: integer("action_id"),
    toolName: text("tool_name").notNull(),
    metricName: text("metric_name").notNull(),
    metricDelta: real("metric_delta"),
    counterfactualBaseline: real("counterfactual_baseline"),
    counterfactualMatchQuality: real("counterfactual_match_quality"),
    attributionConfidence: real("attribution_confidence"),
    measurementLagDays: integer("measurement_lag_days").notNull().default(7),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    treatedCohortSize: integer("treated_cohort_size"),
    controlCohortSize: integer("control_cohort_size"),
    treatmentEffect: real("treatment_effect"),
    observedOutcome: real("observed_outcome"),
    causalPatternSummary: text("causal_pattern_summary"),
    measuredAt: timestamp("measured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("causal_outcomes_client_id_idx").on(table.clientId),
    index("causal_outcomes_tool_name_idx").on(table.toolName),
    index("causal_outcomes_measured_at_idx").on(table.measuredAt),
    index("causal_outcomes_attribution_confidence_idx").on(
      table.attributionConfidence,
    ),
  ],
);

export const syntheticControlsTable = pgTable(
  "synthetic_controls",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    actionHash: text("action_hash").notNull(),
    controlClientIds: jsonb("control_client_ids")
      .$type<number[]>()
      .notNull()
      .default([]),
    baselineMetrics: jsonb("baseline_metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    industryVertical: text("industry_vertical"),
    sizeCategory: text("size_category"),
    matchScore: real("match_score"),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("synthetic_controls_client_id_idx").on(table.clientId),
    index("synthetic_controls_action_hash_idx").on(table.actionHash),
  ],
);

export const insertCausalOutcomeSchema = createInsertSchema(
  causalOutcomesTable,
).omit({ id: true, createdAt: true });
export const insertSyntheticControlSchema = createInsertSchema(
  syntheticControlsTable,
).omit({ id: true, createdAt: true });

export type CausalOutcome = typeof causalOutcomesTable.$inferSelect;
export type InsertCausalOutcome = z.infer<typeof insertCausalOutcomeSchema>;
export type SyntheticControl = typeof syntheticControlsTable.$inferSelect;
export type InsertSyntheticControl = z.infer<typeof insertSyntheticControlSchema>;
