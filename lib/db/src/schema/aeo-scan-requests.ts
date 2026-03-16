import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";
import { aeoScoresTable } from "./aeo-scores";

export const aeoScanRequestsTable = pgTable("aeo_scan_requests", {
  id: serial("id").primaryKey(),
  partnerKeyId: integer("partner_key_id").notNull().references(() => platformApiKeysTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: text("status").notNull().default("queued"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  scoreId: integer("score_id").references(() => aeoScoresTable.id, { onDelete: "set null" }),
}, (table) => [
  index("aeo_scan_requests_partner_key_id_idx").on(table.partnerKeyId),
  index("aeo_scan_requests_status_idx").on(table.status),
  index("aeo_scan_requests_url_idx").on(table.url),
]);

export type AeoScanRequest = typeof aeoScanRequestsTable.$inferSelect;
