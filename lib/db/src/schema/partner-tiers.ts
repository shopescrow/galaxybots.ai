import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partnersTable = pgTable("partners", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().unique(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  tier: text("tier").notNull().default("authorized"),
  wholesaleDiscount: numeric("wholesale_discount", { precision: 5, scale: 2 }).notNull().default("40"),
  minClients: integer("min_clients").notNull().default(5),
  minMonthlySpend: numeric("min_monthly_spend", { precision: 10, scale: 2 }).notNull().default("200"),
  contractType: text("contract_type").notNull().default("monthly"),
  partnerName: text("partner_name").notNull(),
  partnerLogo: text("partner_logo"),
  welcomeMessage: text("welcome_message").notNull(),
  offer: text("offer"),
  adminPasswordHash: text("admin_password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  consecutiveMonthsBelowThreshold: integer("consecutive_months_below_threshold").notNull().default(0),
  lastTierReviewAt: timestamp("last_tier_review_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerApplicationsTable = pgTable("partner_applications", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  currentClientCount: integer("current_client_count").notNull().default(0),
  requestedTier: text("requested_tier").notNull().default("authorized"),
  resellerAgreementAccepted: boolean("reseller_agreement_accepted").notNull().default(false),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerTierReviewLogTable = pgTable("partner_tier_review_log", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull(),
  partnerRef: text("partner_ref").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
  activeClientCount: integer("active_client_count").notNull().default(0),
  monthlySpend: numeric("monthly_spend", { precision: 10, scale: 2 }).notNull().default("0"),
  tierAtReview: text("tier_at_review").notNull(),
  action: text("action").notNull().default("no_change"),
  notes: text("notes"),
});

export const insertPartnerSchema = createInsertSchema(partnersTable).omit({ id: true, createdAt: true });
export const insertPartnerApplicationSchema = createInsertSchema(partnerApplicationsTable).omit({ id: true, createdAt: true, reviewedAt: true });
export const insertPartnerTierReviewLogSchema = createInsertSchema(partnerTierReviewLogTable).omit({ id: true, reviewedAt: true });

export type Partner = typeof partnersTable.$inferSelect;
export type PartnerApplication = typeof partnerApplicationsTable.$inferSelect;
export type PartnerTierReviewLog = typeof partnerTierReviewLogTable.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type InsertPartnerApplication = z.infer<typeof insertPartnerApplicationSchema>;
