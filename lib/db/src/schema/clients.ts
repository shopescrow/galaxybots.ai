import { pgTable, serial, text, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface WebsiteIntel {
  scrapedAt: string;
  title?: string;
  summary?: string;
  industry?: string;
  valueProposition?: string;
  productCategories?: string[];
  targetMarket?: string;
  rawContent?: string;
}

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  plan: text("plan").notNull().default("single"),
  status: text("status").notNull().default("trial"),
  hourlyRate: numeric("hourly_rate").notNull().default("150"),
  websiteUrl: text("website_url"),
  industry: text("industry"),
  servicesList: text("services_list").array(),
  targetMarket: text("target_market"),
  businessContext: text("business_context"),
  webhookSecret: text("webhook_secret"),
  websiteIntel: jsonb("website_intel").$type<WebsiteIntel>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
});

export type Client = typeof clientsTable.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
