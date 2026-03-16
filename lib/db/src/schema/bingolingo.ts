import { pgTable, serial, text, timestamp, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const bingolingoClientsTable = pgTable("bingolingo_clients", {
  id: serial("id").primaryKey(),
  galaxybotsClientId: integer("galaxybots_client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry").notNull(),
  website: text("website"),
  logoUrl: text("logo_url"),
  tagline: text("tagline"),
  autoContentEnabled: boolean("auto_content_enabled").notNull().default(false),
  defaultTone: text("default_tone").notNull().default("professional"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bingolingoContentTable = pgTable("bingolingo_content", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => bingolingoClientsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  body: text("body").notNull(),
  metaDescription: text("meta_description"),
  status: text("status").notNull().default("draft"),
  topic: text("topic"),
  tone: text("tone"),
  keywords: jsonb("keywords").$type<string[]>(),
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("bingolingo_content_client_idx").on(table.clientId),
  index("bingolingo_content_status_idx").on(table.status),
  index("bingolingo_content_slug_idx").on(table.slug),
]);

export const bingolingoApiKeysTable = pgTable("bingolingo_api_keys", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => bingolingoClientsTable.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  label: text("label"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("bingolingo_api_keys_hash_idx").on(table.keyHash),
  index("bingolingo_api_keys_client_idx").on(table.clientId),
]);

export type BingolingoClient = typeof bingolingoClientsTable.$inferSelect;
export type BingolingoContent = typeof bingolingoContentTable.$inferSelect;
export type BingolingoApiKey = typeof bingolingoApiKeysTable.$inferSelect;
