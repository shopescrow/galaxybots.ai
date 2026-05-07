import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";

export const billingProviderConfigTable = pgTable("billing_provider_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  tier: text("tier").notNull(),
  paymentLinkUrl: text("payment_link_url").notNull(),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  unique("billing_provider_config_provider_tier_unique").on(table.provider, table.tier),
]);

export type BillingProviderConfig = typeof billingProviderConfigTable.$inferSelect;
