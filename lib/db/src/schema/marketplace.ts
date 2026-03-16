import { pgTable, serial, text, timestamp, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const marketplaceTemplatesTable = pgTable("marketplace_templates", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  industryTags: jsonb("industry_tags").$type<string[]>().default([]),
  visibility: text("visibility").notNull().default("public"),
  sourceData: jsonb("source_data").notNull(),
  authorUserId: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  authorClientId: integer("author_client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  installCount: integer("install_count").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  index("marketplace_templates_type_idx").on(table.type),
  index("marketplace_templates_category_idx").on(table.category),
  index("marketplace_templates_status_idx").on(table.status),
  index("marketplace_templates_author_idx").on(table.authorUserId),
]);

export const marketplaceInstallsTable = pgTable("marketplace_installs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => marketplaceTemplatesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  installedResourceId: integer("installed_resource_id"),
  installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("marketplace_installs_template_idx").on(table.templateId),
  index("marketplace_installs_user_idx").on(table.userId),
]);

export type MarketplaceTemplate = typeof marketplaceTemplatesTable.$inferSelect;
export type MarketplaceInstall = typeof marketplaceInstallsTable.$inferSelect;
