import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnerRegistrationsTable = pgTable("partner_registrations", {
  id: serial("id").primaryKey(),
  partnerRef: text("partner_ref").notNull(),
  clientId: integer("client_id").notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  plan: text("plan").notNull().default("single"),
  source: text("source"),
  status: text("status").notNull().default("active"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartnerRegistrationSchema = createInsertSchema(partnerRegistrationsTable).omit({ id: true, registeredAt: true });
export type InsertPartnerRegistration = z.infer<typeof insertPartnerRegistrationSchema>;
export type PartnerRegistration = typeof partnerRegistrationsTable.$inferSelect;
