import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const platformApiKeysTable = pgTable("platform_api_keys", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  label: text("label"),
  keyHash: text("key_hash").notNull().unique(),
  previousKeyHash: text("previous_key_hash"),
  status: text("status").notNull().default("active"),
  rateLimit: integer("rate_limit").notNull().default(100),
  rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(100),
  requestCount: integer("request_count").notNull().default(0),
  allowedTools: jsonb("allowed_tools").$type<string[] | null>(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("platform_api_keys_platform_idx").on(table.platform),
  index("platform_api_keys_key_hash_idx").on(table.keyHash),
  index("platform_api_keys_client_id_idx").on(table.clientId),
]);

export type PlatformApiKey = typeof platformApiKeysTable.$inferSelect;
