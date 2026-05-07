import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const platformComplianceTable = pgTable("platform_compliance", {
  id: serial("id").primaryKey(),
  standardName: text("standard_name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"),
  certificationId: text("certification_id"),
  issuedBy: text("issued_by"),
  details: text("details"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientComplianceRequirementsTable = pgTable("client_compliance_requirements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformComplianceSchema = createInsertSchema(platformComplianceTable).omit({
  id: true,
  createdAt: true,
  receivedAt: true,
});

export const insertClientComplianceRequirementSchema = createInsertSchema(clientComplianceRequirementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformCompliance = typeof platformComplianceTable.$inferSelect;
export type InsertPlatformCompliance = z.infer<typeof insertPlatformComplianceSchema>;
export type ClientComplianceRequirement = typeof clientComplianceRequirementsTable.$inferSelect;
export type InsertClientComplianceRequirement = z.infer<typeof insertClientComplianceRequirementSchema>;
