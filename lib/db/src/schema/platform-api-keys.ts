import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const platformApiKeysTable = pgTable("platform_api_keys", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  label: text("label"),
  keyHash: text("key_hash").notNull().unique(),
  status: text("status").notNull().default("active"),
  rateLimit: integer("rate_limit").notNull().default(100),
  allowedTools: jsonb("allowed_tools").$type<string[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("platform_api_keys_platform_idx").on(table.platform),
  index("platform_api_keys_key_hash_idx").on(table.keyHash),
]);

export type PlatformApiKey = typeof platformApiKeysTable.$inferSelect;
