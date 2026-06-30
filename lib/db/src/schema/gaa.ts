import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

// ---------------------------------------------------------------------------
// Galaxy Autonomous Agent (GAA) — top-level, constitutionally-grounded agent
// sitting above the Conductor / Coordinator / Directors / Guardian stack.
// ---------------------------------------------------------------------------

// Goal registry with temporal tiers and multi-mode execution.
export const gaaGoalsTable = pgTable(
  "gaa_goals",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    // autonomous | agenda | mission
    mode: text("mode").notNull().default("autonomous"),
    // evergreen | time_boxed | reactive
    temporalTier: text("temporal_tier").notNull().default("evergreen"),
    // pending | active | suspended | blocked | completed | failed | dead_letter
    status: text("status").notNull().default("pending"),
    priority: integer("priority").notNull().default(2),
    // data-use purpose for compliance / privacy / purpose-limitation
    purpose: text("purpose"),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    parentGoalId: integer("parent_goal_id"),
    costEnvelopeCents: integer("cost_envelope_cents").notNull().default(1000),
    spentCents: integer("spent_cents").notNull().default(0),
    reversibilityScore: integer("reversibility_score"),
    riskScore: integer("risk_score"),
    readinessScore: integer("readiness_score"),
    progressScore: integer("progress_score").notNull().default(0),
    blockedReason: text("blocked_reason"),
    deadLetterReason: text("dead_letter_reason"),
    suspendedState: jsonb("suspended_state").$type<Record<string, unknown>>(),
    generatedBy: text("generated_by").notNull().default("bootstrap"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_goals_status_idx").on(table.status),
    index("gaa_goals_mode_idx").on(table.mode),
    index("gaa_goals_client_id_idx").on(table.clientId),
    index("gaa_goals_priority_idx").on(table.priority),
  ],
);

// Execution journal — write-ahead record of every phase transition.
export const gaaJournalTable = pgTable(
  "gaa_journal",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").references(() => gaaGoalsTable.id, {
      onDelete: "cascade",
    }),
    // plan | constitution_check | compliance_gate | reversibility |
    // execute | evaluate | learn | suspend | resume | conflict | system
    phase: text("phase").notNull(),
    eventType: text("event_type").notNull(),
    // passed | blocked | escalated | proceed | rolled_back | info
    decision: text("decision"),
    detail: text("detail"),
    costCents: integer("cost_cents").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_journal_goal_id_idx").on(table.goalId),
    index("gaa_journal_phase_idx").on(table.phase),
    index("gaa_journal_created_at_idx").on(table.createdAt),
  ],
);

// The constitution — ordered principles enforced at plan-time.
export const gaaConstitutionTable = pgTable(
  "gaa_constitution",
  {
    id: serial("id").primaryKey(),
    ordinal: integer("ordinal").notNull().default(100),
    principle: text("principle").notNull(),
    // kilopro | privacy | reversibility | brand | oversight | safety
    category: text("category").notNull().default("safety"),
    // hard (blocking) | soft (advisory)
    severity: text("severity").notNull().default("hard"),
    rationale: text("rationale"),
    isActive: boolean("is_active").notNull().default(true),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_constitution_ordinal_idx").on(table.ordinal),
    index("gaa_constitution_category_idx").on(table.category),
  ],
);

// Reversible action ledger — every side-effecting action and its undo path.
export const gaaActionLedgerTable = pgTable(
  "gaa_action_ledger",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").references(() => gaaGoalsTable.id, {
      onDelete: "cascade",
    }),
    action: text("action").notNull(),
    toolName: text("tool_name"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    compensatingAction: text("compensating_action"),
    reversibilityScore: integer("reversibility_score"),
    // executed | rolled_back | undo_expired | irreversible
    status: text("status").notNull().default("executed"),
    undoWindowExpiresAt: timestamp("undo_window_expires_at", {
      withTimezone: true,
    }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackBy: text("rolled_back_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_action_ledger_goal_id_idx").on(table.goalId),
    index("gaa_action_ledger_status_idx").on(table.status),
  ],
);

// Multi-horizon memory — hot / warm / cold / permanent tiers with promotion + GDPR delete.
// permanent tier is reserved for C-Suite bot memories; records in this tier never expire
// and are immune to consolidation cleanup.
export const gaaMemoryTable = pgTable(
  "gaa_memory",
  {
    id: serial("id").primaryKey(),
    // hot | warm | cold | permanent
    tier: text("tier").notNull().default("hot"),
    // platform | client
    scope: text("scope").notNull().default("platform"),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    // Optional bot association — set for C-Suite bot memories so the
    // consolidation job can promote them to the permanent tier.
    botId: integer("bot_id"),
    goalId: integer("goal_id"),
    key: text("key").notNull(),
    content: text("content").notNull(),
    lesson: text("lesson"),
    confidence: integer("confidence").notNull().default(50),
    timesReinforced: integer("times_reinforced").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_memory_tier_idx").on(table.tier),
    index("gaa_memory_scope_idx").on(table.scope),
    index("gaa_memory_client_id_idx").on(table.clientId),
    index("gaa_memory_bot_id_idx").on(table.botId),
  ],
);

// Escalation queue — human-in-the-loop decisions the GAA cannot make alone.
export const gaaEscalationsTable = pgTable(
  "gaa_escalations",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").references(() => gaaGoalsTable.id, {
      onDelete: "cascade",
    }),
    reason: text("reason").notNull(),
    // low | medium | high | critical
    severity: text("severity").notNull().default("medium"),
    recommendedAction: text("recommended_action"),
    context: jsonb("context").$type<Record<string, unknown>>().default({}),
    // open | approved | redirected | aborted | resolved
    status: text("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_escalations_status_idx").on(table.status),
    index("gaa_escalations_goal_id_idx").on(table.goalId),
  ],
);

// KiloPro-formatted compliance audit events (append-only by convention).
export const gaaAuditEventsTable = pgTable(
  "gaa_audit_events",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id").references(() => gaaGoalsTable.id, {
      onDelete: "set null",
    }),
    // plan_decision | compliance_check | pii_access | tool_execution |
    // rollback | escalation
    eventType: text("event_type").notNull(),
    // allow | block | flag
    decision: text("decision").notNull().default("allow"),
    toolName: text("tool_name"),
    piiInvolved: boolean("pii_involved").notNull().default(false),
    purpose: text("purpose"),
    compliancePassed: boolean("compliance_passed").notNull().default(true),
    violations: jsonb("violations").$type<string[]>().default([]),
    detail: text("detail"),
    pushedToKilopro: boolean("pushed_to_kilopro").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gaa_audit_events_goal_id_idx").on(table.goalId),
    index("gaa_audit_events_event_type_idx").on(table.eventType),
    index("gaa_audit_events_created_at_idx").on(table.createdAt),
  ],
);

export const insertGaaGoalSchema = createInsertSchema(gaaGoalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertGaaJournalSchema = createInsertSchema(gaaJournalTable).omit({
  id: true,
  createdAt: true,
});
export const insertGaaConstitutionSchema = createInsertSchema(
  gaaConstitutionTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGaaActionLedgerSchema = createInsertSchema(
  gaaActionLedgerTable,
).omit({ id: true, createdAt: true });
export const insertGaaMemorySchema = createInsertSchema(gaaMemoryTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertGaaEscalationSchema = createInsertSchema(
  gaaEscalationsTable,
).omit({ id: true, createdAt: true });
export const insertGaaAuditEventSchema = createInsertSchema(
  gaaAuditEventsTable,
).omit({ id: true, createdAt: true });

export type GaaGoal = typeof gaaGoalsTable.$inferSelect;
export type InsertGaaGoal = z.infer<typeof insertGaaGoalSchema>;
export type GaaJournalEntry = typeof gaaJournalTable.$inferSelect;
export type InsertGaaJournalEntry = z.infer<typeof insertGaaJournalSchema>;
export type GaaConstitutionPrinciple = typeof gaaConstitutionTable.$inferSelect;
export type InsertGaaConstitutionPrinciple = z.infer<
  typeof insertGaaConstitutionSchema
>;
export type GaaActionLedgerEntry = typeof gaaActionLedgerTable.$inferSelect;
export type InsertGaaActionLedgerEntry = z.infer<
  typeof insertGaaActionLedgerSchema
>;
export type GaaMemory = typeof gaaMemoryTable.$inferSelect;
export type InsertGaaMemory = z.infer<typeof insertGaaMemorySchema>;
export type GaaEscalation = typeof gaaEscalationsTable.$inferSelect;
export type InsertGaaEscalation = z.infer<typeof insertGaaEscalationSchema>;
export type GaaAuditEvent = typeof gaaAuditEventsTable.$inferSelect;
export type InsertGaaAuditEvent = z.infer<typeof insertGaaAuditEventSchema>;
