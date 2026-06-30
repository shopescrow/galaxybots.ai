import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  tier: text("tier").notNull().unique(),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),
  includedCredits: integer("included_credits").notNull(),
  overageRatePerCredit: numeric("overage_rate_per_credit", { precision: 10, scale: 4 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accountSubscriptionsTable = pgTable("account_subscriptions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  planId: integer("plan_id").notNull(),
  creditBalance: integer("credit_balance").notNull().default(0),
  billingCycleStart: timestamp("billing_cycle_start", { withTimezone: true }).notNull().defaultNow(),
  billingCycleEnd: timestamp("billing_cycle_end", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  lastUsageAlertThreshold: integer("last_usage_alert_threshold").default(0),
  pendingPlanTier: text("pending_plan_tier"),
  pendingPlanChangeAt: timestamp("pending_plan_change_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usageEventsTable = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  model: text("model").notNull(),
  tokens: integer("tokens").notNull().default(0),
  creditsDeducted: integer("credits_deducted").notNull().default(0),
  route: text("route"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accessorialAddonsTable = pgTable("accessorial_addons", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  monthlyPrice: numeric("monthly_price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accessorialSubscriptionsTable = pgTable("accessorial_subscriptions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  addonId: integer("addon_id").notNull(),
  status: text("status").notNull().default("active"),
  activatedAt: timestamp("activated_at", { withTimezone: true }).defaultNow().notNull(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({ id: true, createdAt: true });
export const insertAccountSubscriptionSchema = createInsertSchema(accountSubscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUsageEventSchema = createInsertSchema(usageEventsTable).omit({ id: true, createdAt: true });
export const insertAccessorialAddonSchema = createInsertSchema(accessorialAddonsTable).omit({ id: true, createdAt: true });
export const insertAccessorialSubscriptionSchema = createInsertSchema(accessorialSubscriptionsTable).omit({ id: true, activatedAt: true });

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type AccountSubscription = typeof accountSubscriptionsTable.$inferSelect;
export type UsageEvent = typeof usageEventsTable.$inferSelect;
export type AccessorialAddon = typeof accessorialAddonsTable.$inferSelect;
export type AccessorialSubscription = typeof accessorialSubscriptionsTable.$inferSelect;
export type InsertAccountSubscription = z.infer<typeof insertAccountSubscriptionSchema>;
export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;
