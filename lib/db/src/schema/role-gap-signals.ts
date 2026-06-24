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

export interface ProposedPersona {
  name: string;
  title: string;
  department: string;
  description: string;
  responsibilities: string[];
  suggestedTools: string[];
  targetClientProfiles: string[];
  systemPromptDraft: string;
}

export const roleGapSignalsTable = pgTable(
  "role_gap_signals",
  {
    id: serial("id").primaryKey(),
    gapDescription: text("gap_description").notNull(),
    evidenceSessions: integer("evidence_sessions").notNull().default(0),
    avgSuccessRate: real("avg_success_rate").notNull().default(0),
    clusterId: text("cluster_id"),
    clusterKeywords: text("cluster_keywords").array().default([]),
    proposedRoleName: text("proposed_role_name"),
    proposedPersona: jsonb("proposed_persona").$type<ProposedPersona>(),
    evidenceObjectives: text("evidence_objectives").array().default([]),
    status: text("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("role_gap_signals_status_idx").on(table.status),
    index("role_gap_signals_cluster_id_idx").on(table.clusterId),
    index("role_gap_signals_created_at_idx").on(table.createdAt),
    index("role_gap_signals_avg_success_rate_idx").on(table.avgSuccessRate),
  ],
);

export const insertRoleGapSignalSchema = createInsertSchema(
  roleGapSignalsTable,
).omit({ id: true, createdAt: true });

export type RoleGapSignal = typeof roleGapSignalsTable.$inferSelect;
export type InsertRoleGapSignal = z.infer<typeof insertRoleGapSignalSchema>;
