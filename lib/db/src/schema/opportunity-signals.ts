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

export const opportunitySignalsTable = pgTable(
  "opportunity_signals",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    signalType: text("signal_type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    suggestedAction: text("suggested_action").notNull(),
    predictedOutcomeDistribution: jsonb("predicted_outcome_distribution")
      .$type<{
        best: number;
        median: number;
        worst: number;
        confidence: number;
      }>()
      .default({ best: 0, median: 0, worst: 0, confidence: 0 }),
    probabilityOfSuccess: real("probability_of_success"),
    evidenceChain: jsonb("evidence_chain").$type<string[]>().default([]),
    causalPatternIds: jsonb("causal_pattern_ids")
      .$type<number[]>()
      .default([]),
    status: text("status").notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    approvedByUserId: integer("approved_by_user_id"),
    resultingAssignmentId: integer("resulting_assignment_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("opportunity_signals_client_id_idx").on(table.clientId),
    index("opportunity_signals_status_idx").on(table.status),
    index("opportunity_signals_signal_type_idx").on(table.signalType),
    index("opportunity_signals_detected_at_idx").on(table.detectedAt),
  ],
);

export const insertOpportunitySignalSchema = createInsertSchema(
  opportunitySignalsTable,
).omit({ id: true, createdAt: true });

export type OpportunitySignal = typeof opportunitySignalsTable.$inferSelect;
export type InsertOpportunitySignal = z.infer<
  typeof insertOpportunitySignalSchema
>;
