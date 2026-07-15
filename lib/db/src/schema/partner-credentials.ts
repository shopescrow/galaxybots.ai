import { pgTable, serial, text, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const partnerCredentialsTable = pgTable("partner_credentials", {
  id: serial("id").primaryKey(),
  partner: text("partner").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  apiBaseUrl: text("api_base_url").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("partner_credentials_partner_client_id_idx").on(table.partner, table.clientId),
  index("partner_credentials_partner_idx").on(table.partner),
]);

export type PartnerCredential = typeof partnerCredentialsTable.$inferSelect;

export const partnerWebhookSubscriptionsTable = pgTable("partner_webhook_subscriptions", {
  id: serial("id").primaryKey(),
  partner: text("partner").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  targetUrl: text("target_url").notNull(),
  encryptedSecret: text("encrypted_secret").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  events: jsonb("events").notNull().$type<string[]>(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("partner_webhook_subscriptions_partner_idx").on(table.partner),
  index("partner_webhook_subscriptions_status_idx").on(table.status),
]);

export type PartnerWebhookSubscription = typeof partnerWebhookSubscriptionsTable.$inferSelect;

export const partnerInboundSecretsTable = pgTable("partner_inbound_secrets", {
  id: serial("id").primaryKey(),
  partner: text("partner").notNull().unique(),
  encryptedSecret: text("encrypted_secret").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PartnerInboundSecret = typeof partnerInboundSecretsTable.$inferSelect;

export const partnerInboundEventsTable = pgTable("partner_inbound_events", {
  id: serial("id").primaryKey(),
  partner: text("partner").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("received"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("partner_inbound_events_partner_idx").on(table.partner),
  index("partner_inbound_events_client_id_idx").on(table.clientId),
  index("partner_inbound_events_created_at_idx").on(table.createdAt),
]);

export type PartnerInboundEvent = typeof partnerInboundEventsTable.$inferSelect;
