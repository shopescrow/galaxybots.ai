import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const competitorUrlsTable = pgTable("competitor_urls", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  companyName: text("company_name").notNull(),
  addedBy: text("added_by").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("competitor_urls_client_id_idx").on(table.clientId),
  index("competitor_urls_url_idx").on(table.url),
]);

export type CompetitorUrl = typeof competitorUrlsTable.$inferSelect;
