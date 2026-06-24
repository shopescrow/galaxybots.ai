import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface OracleFinding {
  category: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  evidence?: string;
}

export interface OracleRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedImpact: string;
  actionType: string;
}

export interface OracleAnomaly {
  patternId: number | null;
  description: string;
  clientsAffected: number;
  quarantineStatus: string;
}

export interface DimensionScores {
  reasoningDepth: number;
  memoryCoherence: number;
  goalAutonomy: number;
  selfImprovementRate: number;
  alignmentFidelity: number;
}

export interface OracleReport {
  findings: OracleFinding[];
  recommendations: OracleRecommendation[];
  anomalies: OracleAnomaly[];
  topPerformingBotConfigs: Array<{ botRole: string; variant: string; outcomeScore: number }>;
  underperformingRoles: Array<{ botRole: string; avgSuccessRate: number; sessionCount: number }>;
  experimentOutcomes: Array<{ experimentId: number; result: string; winner: string | null }>;
  alignmentRuleEffectiveness: number;
  consequenceModelAccuracy: number | null;
}

export const oracleReportsTable = pgTable(
  "oracle_reports",
  {
    id: serial("id").primaryKey(),
    reportDate: timestamp("report_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reportJson: jsonb("report_json").$type<OracleReport>().notNull().default({
      findings: [],
      recommendations: [],
      anomalies: [],
      topPerformingBotConfigs: [],
      underperformingRoles: [],
      experimentOutcomes: [],
      alignmentRuleEffectiveness: 0,
      consequenceModelAccuracy: null,
    }),
    reportHtml: text("report_html"),
    intelligenceScore: real("intelligence_score"),
    dimensionScores: jsonb("dimension_scores").$type<DimensionScores>(),
    modelVersion: text("model_version").notNull().default("1.0"),
    deliveredEmail: timestamp("delivered_email", { withTimezone: true }),
    deliveredPlatform: timestamp("delivered_platform", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("oracle_reports_report_date_idx").on(table.reportDate),
    index("oracle_reports_intelligence_score_idx").on(table.intelligenceScore),
  ],
);

export const insertOracleReportSchema = createInsertSchema(
  oracleReportsTable,
).omit({ id: true, createdAt: true });

export type OracleReportRow = typeof oracleReportsTable.$inferSelect;
export type InsertOracleReport = z.infer<typeof insertOracleReportSchema>;
