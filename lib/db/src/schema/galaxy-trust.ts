import { pgTable, uuid, text, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AUDIT_ENGINE_VALUES = [
  "coordinator",
  "conductor",
  "arbitrator",
  "circuit_breaker",
  "budget_guard",
  "moltbook",
] as const;

export const AUDIT_DECISION_TYPE_VALUES = [
  "role_assignment",
  "strategy_selection",
  "arbitration",
  "suppression",
  "budget_override",
  "circuit_open",
  "circuit_close",
  "confidence_score",
  "human_approval_required",
  "human_approval_outcome",
  "outcome",
] as const;

export type AuditEngine = (typeof AUDIT_ENGINE_VALUES)[number];
export type AuditDecisionType = (typeof AUDIT_DECISION_TYPE_VALUES)[number];

export const galaxyAuditLedgerTable = pgTable("galaxy_audit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: integer("client_id"),
  sessionId: text("session_id"),
  pipelineRunId: text("pipeline_run_id"),
  engine: text("engine").notNull(),
  decisionType: text("decision_type").notNull(),
  payload: jsonb("payload").notNull(),
  payloadHash: text("payload_hash").notNull(),
  outcomeQualityScore: real("outcome_quality_score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGalaxyAuditLedgerSchema = createInsertSchema(galaxyAuditLedgerTable).omit({
  id: true,
  createdAt: true,
});

export type GalaxyAuditLedger = typeof galaxyAuditLedgerTable.$inferSelect;
export type InsertGalaxyAuditLedger = z.infer<typeof insertGalaxyAuditLedgerSchema>;

export const strategyCacheTable = pgTable("strategy_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskCategory: text("task_category").notNull(),
  bestStrategy: text("best_strategy").notNull(),
  avgQualityScore: real("avg_quality_score").notNull().default(0),
  sampleCount: integer("sample_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StrategyCache = typeof strategyCacheTable.$inferSelect;
