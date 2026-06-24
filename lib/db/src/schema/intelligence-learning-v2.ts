import { pgTable, serial, integer, text, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const abExperimentsTable = pgTable("ab_experiments", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  splitPct: real("split_pct").notNull().default(50),
  controlSnapshotId: integer("control_snapshot_id"),
  treatmentDescription: text("treatment_description").notNull().default(""),
  status: text("status").notNull().default("running"),
  winnerVariant: text("winner_variant"),
  pValue: real("p_value"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  concludedAt: timestamp("concluded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const abExperimentResultsTable = pgTable("ab_experiment_results", {
  id: serial("id").primaryKey(),
  experimentId: integer("experiment_id").notNull(),
  sessionId: text("session_id").notNull(),
  variant: text("variant").notNull(),
  qualityScore: real("quality_score"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AbExperiment = typeof abExperimentsTable.$inferSelect;
export type AbExperimentResult = typeof abExperimentResultsTable.$inferSelect;
