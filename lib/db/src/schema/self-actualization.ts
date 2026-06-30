import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

// ---------------------------------------------------------------------------
// Agent self-actualization engine — durable substrate for the GAA's
// self-learning & enhancement loops. Extends (does not replace) the existing
// coordinator weights / GAA memory / self-improvement systems with:
//   1. a per-bot per-task-category capability self-model (confidence + trend)
//   2. deep root-cause reflections persisting durable lessons
//   3. self-directed practice runs under a cost budget
//   4. cross-agent knowledge distillation with conflict resolution
//   5. a safe self-modification framework (governance + shadow + audit)
//   6. telemetry snapshots for the self-actualization metrics surface
// ---------------------------------------------------------------------------

// 1. Capability self-model — what each bot believes it is good at, per category.
// Competence is an EWMA of residualized outcome quality; confidence grows with
// sample size and consistency; trend is the short-vs-long EWMA slope.
export const botCapabilityModelTable = pgTable(
  "bot_capability_model",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    taskCategory: text("task_category").notNull(),
    // 0..1 competence estimate (EWMA of outcome quality)
    competence: real("competence").notNull().default(0.5),
    // 0..1 confidence in the competence estimate
    confidence: real("confidence").notNull().default(0),
    // signed slope: positive = improving, negative = regressing
    trend: real("trend").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    // fast/slow EWMAs used to derive the trend
    shortEwma: real("short_ewma").notNull().default(0.5),
    longEwma: real("long_ewma").notNull().default(0.5),
    // running estimate of outcome volatility (penalises confidence)
    volatility: real("volatility").notNull().default(0),
    lastQuality: real("last_quality"),
    // unproven | weak | developing | competent | strong
    strengthTier: text("strength_tier").notNull().default("unproven"),
    lastUpdated: timestamp("last_updated", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("bot_capability_model_bot_client_category_idx").on(
      t.botId,
      t.clientId,
      t.taskCategory,
    ),
    index("bot_capability_model_bot_id_idx").on(t.botId),
    index("bot_capability_model_strength_tier_idx").on(t.strengthTier),
  ],
);

// 2. Deep reflections — root-cause diagnoses persisted on significant failures.
export const botReflectionsTable = pgTable(
  "bot_reflections",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    sessionId: integer("session_id"),
    goalId: integer("goal_id"),
    taskCategory: text("task_category"),
    failureCategory: text("failure_category"),
    // faulty_assumption | wrong_tool | context_gap | planning_error |
    // verification_miss | external_factor | other
    rootCauseType: text("root_cause_type").notNull().default("other"),
    rootCause: text("root_cause").notNull(),
    contributingFactors: jsonb("contributing_factors")
      .$type<string[]>()
      .default([]),
    durableLesson: text("durable_lesson").notNull(),
    preventionRule: text("prevention_rule"),
    confidence: real("confidence").notNull().default(0.6),
    memoryId: integer("memory_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bot_reflections_bot_id_idx").on(t.botId),
    index("bot_reflections_root_cause_type_idx").on(t.rootCauseType),
    index("bot_reflections_created_at_idx").on(t.createdAt),
  ],
);

// 3. Practice runs — self-directed deliberate practice in a sandbox.
export const practiceRunsTable = pgTable(
  "practice_runs",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    taskCategory: text("task_category").notNull(),
    practiceTask: text("practice_task").notNull(),
    // generated | replayed
    source: text("source").notNull().default("generated"),
    baselineScore: real("baseline_score").notNull().default(0),
    practiceScore: real("practice_score").notNull().default(0),
    improvement: real("improvement").notNull().default(0),
    costCents: integer("cost_cents").notNull().default(0),
    passedFidelity: boolean("passed_fidelity").notNull().default(false),
    adopted: boolean("adopted").notNull().default(false),
    distilledLesson: text("distilled_lesson"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("practice_runs_bot_id_idx").on(t.botId),
    index("practice_runs_task_category_idx").on(t.taskCategory),
    index("practice_runs_created_at_idx").on(t.createdAt),
  ],
);

// 4. Knowledge transfers — distillation of cold-tier lessons across agents.
export const knowledgeTransfersTable = pgTable(
  "knowledge_transfers",
  {
    id: serial("id").primaryKey(),
    sourceBotId: integer("source_bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    targetBotId: integer("target_bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    taskCategory: text("task_category"),
    memoryId: integer("memory_id"),
    lessonText: text("lesson_text").notNull(),
    distilledBelief: text("distilled_belief").notNull(),
    // belief — the only transfer form for now (durable belief injection)
    transferType: text("transfer_type").notNull().default("belief"),
    confidence: real("confidence").notNull().default(0.6),
    // proposed | applied | rejected | conflict
    status: text("status").notNull().default("proposed"),
    conflictResolution: text("conflict_resolution"),
    targetBeliefId: integer("target_belief_id"),
    // Soft-archive timestamp: set when the belief loses arbitration or is
    // superseded. Never deleted so provenance is always inspectable.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("knowledge_transfers_target_bot_id_idx").on(t.targetBotId),
    index("knowledge_transfers_status_idx").on(t.status),
    index("knowledge_transfers_created_at_idx").on(t.createdAt),
  ],
);

// 5. Self-modifications — safe self-change proposals with governance + shadow.
export const selfModificationsTable = pgTable(
  "self_modifications",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "cascade",
    }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    // tool_policy | role_definition | prompt_addition
    modType: text("mod_type").notNull(),
    title: text("title").notNull(),
    proposal: jsonb("proposal").$type<Record<string, unknown>>().notNull().default({}),
    rationale: text("rationale").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}),
    // low | medium | high
    riskLevel: text("risk_level").notNull().default("low"),
    humanGated: boolean("human_gated").notNull().default(false),
    // proposed | shadow_testing | promoted | rejected | rolled_back | killed
    status: text("status").notNull().default("proposed"),
    governanceDecision: text("governance_decision"),
    shadowMetrics: jsonb("shadow_metrics")
      .$type<{
        shadowSuccesses: number;
        shadowSampleN: number;
        controlSuccesses: number;
        controlSampleN: number;
      }>()
      .default({ shadowSuccesses: 0, shadowSampleN: 0, controlSuccesses: 0, controlSampleN: 0 }),
    shadowPeriodEnd: timestamp("shadow_period_end", { withTimezone: true }),
    proposedBy: text("proposed_by").notNull().default("self_actualization"),
    reviewedBy: text("reviewed_by"),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rollbackReason: text("rollback_reason"),
    auditTrail: jsonb("audit_trail")
      .$type<Array<{ at: string; event: string; detail: string }>>()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("self_modifications_status_idx").on(t.status),
    index("self_modifications_bot_id_idx").on(t.botId),
    index("self_modifications_mod_type_idx").on(t.modType),
  ],
);

// 6. Telemetry snapshots for the self-actualization metrics surface.
export const selfActualizationMetricsTable = pgTable(
  "self_actualization_metrics",
  {
    id: serial("id").primaryKey(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    scope: text("scope").notNull().default("platform"),
    clientId: integer("client_id"),
    avgCompetence: real("avg_competence").notNull().default(0),
    avgConfidence: real("avg_confidence").notNull().default(0),
    avgTrend: real("avg_trend").notNull().default(0),
    reflections: integer("reflections").notNull().default(0),
    practiceRuns: integer("practice_runs").notNull().default(0),
    practiceAdopted: integer("practice_adopted").notNull().default(0),
    practiceGainAvg: real("practice_gain_avg").notNull().default(0),
    transfers: integer("transfers").notNull().default(0),
    transfersApplied: integer("transfers_applied").notNull().default(0),
    modsProposed: integer("mods_proposed").notNull().default(0),
    modsPromoted: integer("mods_promoted").notNull().default(0),
    modsRolledBack: integer("mods_rolled_back").notNull().default(0),
    blockedPromotions: integer("blocked_promotions").notNull().default(0),
    killSwitchActive: boolean("kill_switch_active").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("self_actualization_metrics_created_at_idx").on(t.createdAt),
    index("self_actualization_metrics_scope_idx").on(t.scope),
  ],
);

// Control/config — kill switch + budgets. Single row per key.
export const selfActualizationControlTable = pgTable(
  "self_actualization_control",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    boolValue: boolean("bool_value"),
    numValue: real("num_value"),
    textValue: text("text_value"),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("self_actualization_control_key_idx").on(t.key)],
);

// 7. Belief conflicts — semantic contradictions between agent beliefs, pending
//    LLM-mediated arbitration. Created when an incoming knowledge transfer
//    contradicts an existing applied belief; resolved asynchronously.
export const beliefConflictsTable = pgTable(
  "belief_conflicts",
  {
    id: serial("id").primaryKey(),
    // The incoming knowledge transfer whose distilled_belief triggered the conflict.
    sourceBelief: integer("source_belief_id").references(
      () => knowledgeTransfersTable.id,
      { onDelete: "set null" },
    ),
    // The incumbent applied knowledge transfer that was contradicted.
    targetBelief: integer("target_belief_id").references(
      () => knowledgeTransfersTable.id,
      { onDelete: "set null" },
    ),
    sourceBotId: integer("source_bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    targetBotId: integer("target_bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    taskCategory: text("task_category"),
    // Verbatim belief texts captured at conflict time (survive transfer deletion).
    sourceBeliefText: text("source_belief_text").notNull(),
    targetBeliefText: text("target_belief_text").notNull(),
    sourceConfidence: real("source_confidence").notNull(),
    targetConfidence: real("target_confidence").notNull(),
    // Cosine similarity between the two belief embeddings (0..1).
    // Higher means the beliefs are semantically closer despite contradicting.
    semanticSimilarity: real("semantic_similarity"),
    // contradiction | partial_overlap | context_dependent
    conflictType: text("conflict_type").notNull().default("contradiction"),
    // pending | resolved | human_review
    resolutionStatus: text("resolution_status").notNull().default("pending"),
    // Arbitration outputs (populated after LLM resolution).
    synthesizedBelief: text("synthesized_belief"),
    dissentingNote: text("dissenting_note"),
    // merged | first_wins | second_wins | context_dependent
    resolutionType: text("resolution_type"),
    // Full chain-of-thought reasoning from the arbitration LLM call.
    arbitrationReasoning: text("arbitration_reasoning"),
    // Condition tag when resolution_type = 'context_dependent'.
    conditionTag: text("condition_tag"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("belief_conflicts_target_bot_id_idx").on(t.targetBotId),
    index("belief_conflicts_resolution_status_idx").on(t.resolutionStatus),
    index("belief_conflicts_created_at_idx").on(t.createdAt),
    index("belief_conflicts_task_category_idx").on(t.taskCategory),
  ],
);

export const insertBeliefConflictSchema = createInsertSchema(
  beliefConflictsTable,
).omit({ id: true, createdAt: true });

export type BeliefConflict = typeof beliefConflictsTable.$inferSelect;
export type InsertBeliefConflict = z.infer<typeof insertBeliefConflictSchema>;

export const insertBotCapabilityModelSchema = createInsertSchema(
  botCapabilityModelTable,
).omit({ id: true, createdAt: true });
export const insertBotReflectionSchema = createInsertSchema(
  botReflectionsTable,
).omit({ id: true, createdAt: true });
export const insertPracticeRunSchema = createInsertSchema(practiceRunsTable).omit(
  { id: true, createdAt: true },
);
export const insertKnowledgeTransferSchema = createInsertSchema(
  knowledgeTransfersTable,
).omit({ id: true, createdAt: true });
export const insertSelfModificationSchema = createInsertSchema(
  selfModificationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSelfActualizationMetricSchema = createInsertSchema(
  selfActualizationMetricsTable,
).omit({ id: true, createdAt: true });

export type BotCapabilityModel = typeof botCapabilityModelTable.$inferSelect;
export type InsertBotCapabilityModel = z.infer<
  typeof insertBotCapabilityModelSchema
>;
export type BotReflection = typeof botReflectionsTable.$inferSelect;
export type InsertBotReflection = z.infer<typeof insertBotReflectionSchema>;
export type PracticeRun = typeof practiceRunsTable.$inferSelect;
export type InsertPracticeRun = z.infer<typeof insertPracticeRunSchema>;
export type KnowledgeTransfer = typeof knowledgeTransfersTable.$inferSelect;
export type InsertKnowledgeTransfer = z.infer<
  typeof insertKnowledgeTransferSchema
>;
export type SelfModification = typeof selfModificationsTable.$inferSelect;
export type InsertSelfModification = z.infer<
  typeof insertSelfModificationSchema
>;
export type SelfActualizationMetric =
  typeof selfActualizationMetricsTable.$inferSelect;
export type InsertSelfActualizationMetric = z.infer<
  typeof insertSelfActualizationMetricSchema
>;
export type SelfActualizationControl =
  typeof selfActualizationControlTable.$inferSelect;
