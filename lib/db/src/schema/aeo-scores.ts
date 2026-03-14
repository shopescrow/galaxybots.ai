import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const aeoScoresTable = pgTable("aeo_scores", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  sourceUrl: text("source_url").notNull(),
  overallScore: integer("overall_score").notNull(),
  engineScores: jsonb("engine_scores").notNull().$type<Record<string, { score: number; cited: boolean }>>(),
  citationCount: integer("citation_count").notNull().default(0),
  recommendations: jsonb("recommendations").notNull().$type<string[]>(),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("aeo_scores_source_url_scanned_at_idx").on(table.sourceUrl, table.scannedAt),
]);

export type AeoScore = typeof aeoScoresTable.$inferSelect;
