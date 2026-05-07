import { pgTable, serial, text, timestamp, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const developerApiKeysTable = pgTable("developer_api_keys", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label").notNull().default("default"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(["read"]),
  tier: text("tier").notNull().default("standard"),
  rateLimit: integer("rate_limit").notNull().default(1000),
  status: text("status").notNull().default("active"),
  totalCalls: integer("total_calls").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("developer_api_keys_client_id_idx").on(table.clientId),
  index("developer_api_keys_key_hash_idx").on(table.keyHash),
  index("developer_api_keys_status_idx").on(table.status),
]);

export const developerApiUsageLogTable = pgTable("developer_api_usage_log", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id").notNull().references(() => developerApiKeysTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  latencyMs: integer("latency_ms"),
  tokensConsumed: integer("tokens_consumed").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("developer_api_usage_log_key_id_idx").on(table.keyId),
  index("developer_api_usage_log_client_id_idx").on(table.clientId),
  index("developer_api_usage_log_created_at_idx").on(table.createdAt),
]);

export const apiChangelogTable = pgTable("api_changelog", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  breaking: boolean("breaking").notNull().default(false),
  changes: jsonb("changes").$type<string[]>().notNull().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeveloperApiKey = typeof developerApiKeysTable.$inferSelect;
export type DeveloperApiUsageLog = typeof developerApiUsageLogTable.$inferSelect;
export type ApiChangelog = typeof apiChangelogTable.$inferSelect;
