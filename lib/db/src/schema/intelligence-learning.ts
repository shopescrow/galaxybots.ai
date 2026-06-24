import { pgTable, serial, integer, text, timestamp, real, jsonb, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const intelligenceCycleRunsTable = pgTable("intelligence_cycle_runs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  daysAnalyzed: integer("days_analyzed").notNull().default(7),
  coordinatorCorrections: integer("coordinator_corrections").notNull().default(0),
  conductorCorrections: integer("conductor_corrections").notNull().default(0),
  winnerCategories: jsonb("winner_categories").notNull().default([]),
  loserCategories: jsonb("loser_categories").notNull().default([]),
  summary: text("summary"),
  triggeredBy: text("triggered_by").notNull().default("scheduled"),
});

export type IntelligenceCycleRun = typeof intelligenceCycleRunsTable.$inferSelect;
export type InsertIntelligenceCycleRun = typeof intelligenceCycleRunsTable.$inferInsert;
