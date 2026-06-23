import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";

export const stakeholderEnum = pgEnum("stakeholder_source", [
  "owner",
  "client",
  "downstream",
]);

export const promptVersionsTable = pgTable(
  "prompt_versions",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    versionNum: integer("version_num").notNull().default(1),
    promptText: text("prompt_text").notNull(),
    diffFromPrev: text("diff_from_prev"),
    evidenceSummary: text("evidence_summary"),
    triggeredBy: text("triggered_by").notNull().default("system"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    shadowPeriodEnd: timestamp("shadow_period_end", { withTimezone: true }),
    outcomeScoreBefore: real("outcome_score_before"),
    outcomeScoreAfter: real("outcome_score_after"),
    shadowSuccesses: integer("shadow_successes").notNull().default(0),
    shadowSampleN: integer("shadow_sample_n").notNull().default(0),
    controlSuccesses: integer("control_successes").notNull().default(0),
    controlSampleN: integer("control_sample_n").notNull().default(0),
    diffMagnitudePct: real("diff_magnitude_pct"),
    status: text("status").notNull().default("shadow"),
    rollbackReason: text("rollback_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("prompt_versions_bot_id_idx").on(t.botId),
    index("prompt_versions_status_idx").on(t.status),
    index("prompt_versions_activated_at_idx").on(t.activatedAt),
  ],
);

export const toolHeuristicsTable = pgTable(
  "tool_heuristics",
  {
    id: serial("id").primaryKey(),
    contextType: text("context_type").notNull(),
    toolName: text("tool_name").notNull(),
    successRate: real("success_rate").notNull().default(0),
    sampleSize: integer("sample_size").notNull().default(0),
    isCounterfactualAdjusted: boolean("is_counterfactual_adjusted")
      .notNull()
      .default(false),
    rankInContext: integer("rank_in_context").notNull().default(1),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tool_heuristics_context_type_idx").on(t.contextType),
    index("tool_heuristics_tool_name_idx").on(t.toolName),
    index("tool_heuristics_last_computed_at_idx").on(t.lastComputedAt),
  ],
);

export const experimentsTable = pgTable(
  "experiments",
  {
    id: serial("id").primaryKey(),
    hypothesis: text("hypothesis").notNull(),
    metric: text("metric").notNull(),
    variantA: jsonb("variant_a").$type<Record<string, unknown>>().notNull().default({}),
    variantB: jsonb("variant_b").$type<Record<string, unknown>>().notNull().default({}),
    assignmentRule: text("assignment_rule").notNull().default("random_20pct"),
    splitPct: real("split_pct").notNull().default(0.2),
    targetSampleSize: integer("target_sample_size").notNull().default(100),
    currentSampleSizeA: integer("current_sample_size_a").notNull().default(0),
    currentSampleSizeB: integer("current_sample_size_b").notNull().default(0),
    metricValueA: real("metric_value_a"),
    metricValueB: real("metric_value_b"),
    tStatistic: real("t_statistic"),
    pValue: real("p_value"),
    significanceThreshold: real("significance_threshold").notNull().default(0.05),
    significanceReached: boolean("significance_reached").notNull().default(false),
    winner: text("winner"),
    result: text("result"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    proposedByBotId: integer("proposed_by_bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("running"),
    ethicsCheckPassed: boolean("ethics_check_passed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("experiments_status_idx").on(t.status),
    index("experiments_started_at_idx").on(t.startedAt),
    index("experiments_significance_reached_idx").on(t.significanceReached),
  ],
);

export const alignmentSignalsTable = pgTable(
  "alignment_signals",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id"),
    originalProposal: jsonb("original_proposal")
      .$type<Record<string, unknown>>()
      .default({}),
    humanEdit: jsonb("human_edit")
      .$type<Record<string, unknown>>()
      .default({}),
    diffSummary: text("diff_summary"),
    patternCategory: text("pattern_category"),
    sourceStakeholder: stakeholderEnum("source_stakeholder")
      .notNull()
      .default("owner"),
    clientNpsScore: real("client_nps_score"),
    renewalOutcome: text("renewal_outcome"),
    escalationTicketId: text("escalation_ticket_id"),
    extractedSoftRule: text("extracted_soft_rule"),
    softRuleConfidence: real("soft_rule_confidence"),
    softRuleStatus: text("soft_rule_status").default("pending"),
    clusterId: text("cluster_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("alignment_signals_source_stakeholder_idx").on(t.sourceStakeholder),
    index("alignment_signals_pattern_category_idx").on(t.patternCategory),
    index("alignment_signals_cluster_id_idx").on(t.clusterId),
    index("alignment_signals_soft_rule_status_idx").on(t.softRuleStatus),
    index("alignment_signals_created_at_idx").on(t.createdAt),
    uniqueIndex("alignment_signals_approval_id_unique").on(t.approvalId),
  ],
);

export const calibrationCheckpointsTable = pgTable(
  "calibration_checkpoints",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    predictedAvg: real("predicted_avg").notNull(),
    actualAvg: real("actual_avg").notNull(),
    calibrationError: real("calibration_error").notNull(),
    temperatureScaleFactor: real("temperature_scale_factor").notNull().default(1.0),
    sampleSize: integer("sample_size").notNull().default(0),
    reliabilityCurve: jsonb("reliability_curve")
      .$type<Array<{ bin: number; predicted: number; actual: number; count: number }>>()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("calibration_checkpoints_bot_id_idx").on(t.botId),
    index("calibration_checkpoints_period_end_idx").on(t.periodEnd),
  ],
);

export const experimentAssignmentsTable = pgTable(
  "experiment_assignments",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experiment_id")
      .notNull()
      .references(() => experimentsTable.id, { onDelete: "cascade" }),
    sessionId: integer("session_id"),
    conversationId: integer("conversation_id"),
    cohort: text("cohort").notNull(), // "A" or "B"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("experiment_assignments_experiment_id_idx").on(t.experimentId),
    index("experiment_assignments_session_id_idx").on(t.sessionId),
    index("experiment_assignments_cohort_idx").on(t.cohort),
    uniqueIndex("experiment_assignments_exp_session_unique").on(t.experimentId, t.sessionId),
  ],
);

export const insertPromptVersionSchema = createInsertSchema(promptVersionsTable).omit({
  id: true,
  createdAt: true,
});
export const insertToolHeuristicSchema = createInsertSchema(toolHeuristicsTable).omit({
  id: true,
  createdAt: true,
});
export const insertExperimentSchema = createInsertSchema(experimentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertAlignmentSignalSchema = createInsertSchema(alignmentSignalsTable).omit({
  id: true,
  createdAt: true,
});
export const insertCalibrationCheckpointSchema = createInsertSchema(
  calibrationCheckpointsTable,
).omit({ id: true, createdAt: true });

export type PromptVersion = typeof promptVersionsTable.$inferSelect;
export type InsertPromptVersion = z.infer<typeof insertPromptVersionSchema>;
export type ToolHeuristic = typeof toolHeuristicsTable.$inferSelect;
export type InsertToolHeuristic = z.infer<typeof insertToolHeuristicSchema>;
export type Experiment = typeof experimentsTable.$inferSelect;
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type AlignmentSignal = typeof alignmentSignalsTable.$inferSelect;
export type InsertAlignmentSignal = z.infer<typeof insertAlignmentSignalSchema>;
export type CalibrationCheckpoint = typeof calibrationCheckpointsTable.$inferSelect;
export type InsertCalibrationCheckpoint = z.infer<typeof insertCalibrationCheckpointSchema>;
