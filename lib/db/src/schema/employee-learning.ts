import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

export const learningEventTypeEnum = pgEnum("learning_event_type", [
  "correction",
  "approval",
  "reprompt",
  "escalation",
  "explicit_feedback",
  "session_end_reflection",
  "profile_flag",
]);

export const employeeBehavioralProfilesTable = pgTable(
  "employee_behavioral_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    communicationStyle: jsonb("communication_style")
      .$type<{
        formality: number;
        verbosity: number;
        structurePreference: "narrative" | "bullets" | "tables" | "mixed";
      }>()
      .default({ formality: 0.5, verbosity: 0.5, structurePreference: "mixed" }),
    formatPreferences: jsonb("format_preferences")
      .$type<Record<string, unknown>>()
      .default({}),
    expertiseSignals: jsonb("expertise_signals")
      .$type<string[]>()
      .default([]),
    recurringConcerns: jsonb("recurring_concerns")
      .$type<string[]>()
      .default([]),
    trustCalibration: real("trust_calibration").notNull().default(0.5),
    workPatterns: jsonb("work_patterns")
      .$type<{
        activeHours?: string;
        avgResponseLatencyMs?: number;
        sessionFrequency?: string;
      }>()
      .default({}),
    vocabularyTerms: jsonb("vocabulary_terms")
      .$type<string[]>()
      .default([]),
    profileSummary: text("profile_summary"),
    confidenceScore: real("confidence_score").notNull().default(0),
    sessionCount: integer("session_count").notNull().default(0),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("employee_behavioral_profiles_user_bot_idx").on(t.userId, t.botId),
    index("employee_behavioral_profiles_user_id_idx").on(t.userId),
    index("employee_behavioral_profiles_client_id_idx").on(t.clientId),
  ],
);

export const employeeLearningEventsTable = pgTable(
  "employee_learning_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    taskSessionId: integer("task_session_id"),
    eventType: learningEventTypeEnum("event_type").notNull(),
    signalData: jsonb("signal_data")
      .$type<Record<string, unknown>>()
      .default({}),
    learnedDelta: jsonb("learned_delta")
      .$type<Record<string, unknown>>()
      .default({}),
    confidenceContribution: real("confidence_contribution").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("employee_learning_events_user_id_idx").on(t.userId),
    index("employee_learning_events_bot_id_idx").on(t.botId),
    index("employee_learning_events_session_id_idx").on(t.taskSessionId),
    index("employee_learning_events_event_type_idx").on(t.eventType),
    index("employee_learning_events_created_at_idx").on(t.createdAt),
  ],
);

export const orgBehavioralBaselinesTable = pgTable(
  "org_behavioral_baselines",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    communicationStyle: jsonb("communication_style")
      .$type<{
        formality: number;
        verbosity: number;
        structurePreference: "narrative" | "bullets" | "tables" | "mixed";
      }>()
      .default({ formality: 0.5, verbosity: 0.5, structurePreference: "mixed" }),
    expertiseSignals: jsonb("expertise_signals")
      .$type<string[]>()
      .default([]),
    vocabularyTerms: jsonb("vocabulary_terms")
      .$type<string[]>()
      .default([]),
    profileSummary: text("profile_summary"),
    contributorCount: integer("contributor_count").notNull().default(0),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("org_behavioral_baselines_client_id_idx").on(t.clientId),
  ],
);

export const insertEmployeeBehavioralProfileSchema = createInsertSchema(
  employeeBehavioralProfilesTable,
).omit({ id: true, createdAt: true });

export const insertEmployeeLearningEventSchema = createInsertSchema(
  employeeLearningEventsTable,
).omit({ id: true, createdAt: true });

export const insertOrgBehavioralBaselineSchema = createInsertSchema(
  orgBehavioralBaselinesTable,
).omit({ id: true, createdAt: true });

export type EmployeeBehavioralProfile = typeof employeeBehavioralProfilesTable.$inferSelect;
export type InsertEmployeeBehavioralProfile = z.infer<typeof insertEmployeeBehavioralProfileSchema>;
export type EmployeeLearningEvent = typeof employeeLearningEventsTable.$inferSelect;
export type InsertEmployeeLearningEvent = z.infer<typeof insertEmployeeLearningEventSchema>;
export type OrgBehavioralBaseline = typeof orgBehavioralBaselinesTable.$inferSelect;
export type InsertOrgBehavioralBaseline = z.infer<typeof insertOrgBehavioralBaselineSchema>;
