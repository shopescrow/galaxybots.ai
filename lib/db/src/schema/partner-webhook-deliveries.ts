import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { partnerWebhookSubscriptionsTable } from "./partner-credentials";

export const partnerWebhookDeliveriesTable = pgTable("partner_webhook_deliveries", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => partnerWebhookSubscriptionsTable.id, { onDelete: "cascade" }),
  partner: text("partner").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  responseStatus: integer("response_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("partner_webhook_deliveries_status_idx").on(table.status),
  index("partner_webhook_deliveries_subscription_id_idx").on(table.subscriptionId),
  index("partner_webhook_deliveries_partner_idx").on(table.partner),
]);

export type PartnerWebhookDelivery = typeof partnerWebhookDeliveriesTable.$inferSelect;
