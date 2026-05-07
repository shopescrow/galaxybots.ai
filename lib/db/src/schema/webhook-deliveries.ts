import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { aeoWebhooksTable } from "./aeo-webhooks";
import { aeoScoresTable } from "./aeo-scores";

export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => aeoWebhooksTable.id, { onDelete: "cascade" }),
  scoreId: integer("score_id").references(() => aeoScoresTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("webhook_deliveries_status_idx").on(table.status),
  index("webhook_deliveries_webhook_id_idx").on(table.webhookId),
]);

export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;
