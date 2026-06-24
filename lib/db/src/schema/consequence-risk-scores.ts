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

export interface ConsequenceEvidence {
  actionHash: string;
  toolName: string;
  outcomeType: string;
  harmLabel: string;
  effectSize: number;
  clientCount: number;
}

export const consequenceRiskScoresTable = pgTable(
  "consequence_risk_scores",
  {
    id: serial("id").primaryKey(),
    actionHash: text("action_hash").notNull(),
    industryVertical: text("industry_vertical").notNull(),
    companySizeTier: text("company_size_tier").notNull().default("unknown"),
    toolName: text("tool_name").notNull(),
    contextType: text("context_type").notNull(),
    riskScore: real("risk_score").notNull().default(0),
    confidenceScore: real("confidence_score").notNull().default(0),
    evidenceCount: integer("evidence_count").notNull().default(0),
    negativeOutcomeCount: integer("negative_outcome_count").notNull().default(0),
    positiveOutcomeCount: integer("positive_outcome_count").notNull().default(0),
    topEvidenceExamples: jsonb("top_evidence_examples")
      .$type<ConsequenceEvidence[]>()
      .default([]),
    modelVersion: text("model_version").notNull().default("1.0"),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("consequence_risk_scores_action_hash_idx").on(table.actionHash),
    index("consequence_risk_scores_industry_vertical_idx").on(table.industryVertical),
    index("consequence_risk_scores_risk_score_idx").on(table.riskScore),
    index("consequence_risk_scores_tool_name_idx").on(table.toolName),
    index("consequence_risk_scores_last_computed_idx").on(table.lastComputedAt),
  ],
);

export const insertConsequenceRiskScoreSchema = createInsertSchema(
  consequenceRiskScoresTable,
).omit({ id: true, createdAt: true });

export type ConsequenceRiskScore = typeof consequenceRiskScoresTable.$inferSelect;
export type InsertConsequenceRiskScore = z.infer<typeof insertConsequenceRiskScoreSchema>;
