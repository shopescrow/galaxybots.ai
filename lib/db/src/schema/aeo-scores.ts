import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { bingolingoContentTable } from "./bingolingo";

export const aeoScoresTable = pgTable("aeo_scores", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  bingolingoContentId: integer("bingolingo_content_id").references(() => bingolingoContentTable.id, { onDelete: "set null" }),
  sourceUrl: text("source_url").notNull(),
  overallScore: integer("overall_score").notNull(),
  engineScores: jsonb("engine_scores").notNull().$type<Record<string, { score: number; cited: boolean }>>(),
  citationCount: integer("citation_count").notNull().default(0),
  recommendations: jsonb("recommendations").notNull().$type<string[]>(),
  scanType: text("scan_type").notNull().default("client"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("aeo_scores_source_url_scanned_at_idx").on(table.sourceUrl, table.scannedAt),
  index("aeo_scores_bingolingo_content_id_idx").on(table.bingolingoContentId),
]);

export type AeoScore = typeof aeoScoresTable.$inferSelect;
