import { pgTable, serial, text, timestamp, integer, jsonb, real, index, boolean } from "drizzle-orm/pg-core";
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
  status: text("status", { enum: ["new", "enriched", "review_needed", "qualified", "contacted", "rejected", "responded", "converted"] }).notNull().default("new"),
  errorCategory: text("error_category", { enum: ["network", "parsing", "not_found", "validation"] }),
  attemptCount: integer("attempt_count").notNull().default(1),
  extractionNotes: text("extraction_notes"),
  convertedClientId: integer("converted_client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  outreachSentCount: integer("outreach_sent_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("prospects_status_idx").on(table.status),
  index("prospects_client_id_idx").on(table.clientId),
  index("prospects_confidence_idx").on(table.confidenceScore),
]);

export const prospectOutreachLogTable = pgTable("prospect_outreach_log", {
  id: serial("id").primaryKey(),
  prospectId: integer("prospect_id").notNull().references(() => prospectsTable.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  messageBody: text("message_body").notNull(),
  subject: text("subject"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  deliveryStatus: text("delivery_status").notNull().default("sent"),
  responseReceivedAt: timestamp("response_received_at", { withTimezone: true }),
  responseSnippet: text("response_snippet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("outreach_log_prospect_idx").on(table.prospectId),
]);

export const prospectOutreachTemplatesTable = pgTable("prospect_outreach_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel", { enum: ["email", "sms"] }).notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = typeof prospectsTable.$inferInsert;
export type ProspectOutreachLog = typeof prospectOutreachLogTable.$inferSelect;
export type ProspectOutreachTemplate = typeof prospectOutreachTemplatesTable.$inferSelect;
