import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  plan: text("plan").notNull().default("single"),
  status: text("status").notNull().default("trial"),
  hourlyRate: numeric("hourly_rate").notNull().default("150"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
});

export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
