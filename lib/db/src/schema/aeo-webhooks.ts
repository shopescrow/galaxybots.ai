import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { platformApiKeysTable } from "./platform-api-keys";

export const aeoWebhooksTable = pgTable("aeo_webhooks", {
  id: serial("id").primaryKey(),
  partnerKeyId: integer("partner_key_id").notNull().references(() => platformApiKeysTable.id, { onDelete: "cascade" }),
  targetUrl: text("target_url").notNull(),
  eventTypes: jsonb("event_types").notNull().$type<string[]>(),
  secretHash: text("secret_hash"),
  status: text("status").notNull().default("active"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("aeo_webhooks_partner_key_id_idx").on(table.partnerKeyId),
  index("aeo_webhooks_status_idx").on(table.status),
]);

export type AeoWebhook = typeof aeoWebhooksTable.$inferSelect;
