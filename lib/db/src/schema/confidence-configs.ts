import { pgTable, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const confidenceConfigsTable = pgTable("confidence_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id).unique(),
  emailWeight: numeric("email_weight").notNull().default("0.25"),
  phoneWeight: numeric("phone_weight").notNull().default("0.25"),
  domainWeight: numeric("domain_weight").notNull().default("0.20"),
  socialWeight: numeric("social_weight").notNull().default("0.15"),
  nameWeight: numeric("name_weight").notNull().default("0.15"),
  reviewSlaHours: integer("review_sla_hours").notNull().default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConfidenceConfigSchema = createInsertSchema(confidenceConfigsTable);
export const selectConfidenceConfigSchema = createSelectSchema(confidenceConfigsTable);

export type ConfidenceConfig = typeof confidenceConfigsTable.$inferSelect;
export type InsertConfidenceConfig = typeof confidenceConfigsTable.$inferInsert;
