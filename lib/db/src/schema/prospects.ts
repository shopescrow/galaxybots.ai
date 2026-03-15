import { pgTable, serial, text, timestamp, integer, jsonb, real, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const prospectsTable = pgTable("prospects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  companyName: text("company_name").notNull(),
  domain: text("domain"),
  phone: text("phone"),
  email: text("email"),
  socialLinks: jsonb("social_links").$type<Record<string, string>>().default({}),
  sourceUrl: text("source_url").notNull(),
  confidenceScore: real("confidence_score").notNull().default(0),
  status: text("status", { enum: ["new", "enriched", "review_needed", "qualified", "contacted", "rejected"] }).notNull().default("new"),
  errorCategory: text("error_category", { enum: ["network", "parsing", "not_found", "validation"] }),
  attemptCount: integer("attempt_count").notNull().default(1),
  extractionNotes: text("extraction_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("prospects_status_idx").on(table.status),
  index("prospects_client_id_idx").on(table.clientId),
  index("prospects_confidence_idx").on(table.confidenceScore),
]);

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = typeof prospectsTable.$inferInsert;
