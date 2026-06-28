import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export const ASSET_TYPES = [
  "printable",
  "video",
  "micro_saas",
  "data",
  "visual",
  "web3",
  "other",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = [
  "idea",
  "draft",
  "in_review",
  "published",
  "tracking",
  "archived",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface AssetStatusEvent {
  status: AssetStatus;
  changedBy: string;
  note?: string;
  at: string;
}

export const assetsTable = pgTable(
  "assets",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // The bot that creates/produces the asset.
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    // The bot responsible for managing/reviewing the asset over its lifecycle.
    managerBotId: integer("manager_bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull().default("other"),
    title: text("title").notNull(),
    description: text("description"),
    niche: text("niche"),
    // The demand opportunity this asset was created from, if any (reverse trace).
    sourceOpportunityId: integer("source_opportunity_id"),
    status: text("status").notNull().default("idea"),
    targetPlatform: text("target_platform"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    statusHistory: jsonb("status_history")
      .$type<AssetStatusEvent[]>()
      .default([]),
    revenueToDate: numeric("revenue_to_date").notNull().default("0"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("assets_client_id_idx").on(table.clientId),
    index("assets_status_idx").on(table.status),
    index("assets_type_idx").on(table.type),
    index("assets_updated_at_idx").on(table.updatedAt),
  ],
);

export const ASSET_FILE_KINDS = [
  "pdf",
  "image",
  "audio",
  "video",
  "dataset",
  "archive",
  "other",
] as const;
export type AssetFileKind = (typeof ASSET_FILE_KINDS)[number];

export const assetFilesTable = pgTable(
  "asset_files",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("other"),
    fileName: text("file_name").notNull(),
    // Normalized object-storage entity path (e.g. /objects/uploads/...).
    objectPath: text("object_path").notNull(),
    contentType: text("content_type"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_files_asset_id_idx").on(table.assetId),
    index("asset_files_client_id_idx").on(table.clientId),
  ],
);

export const assetListingsTable = pgTable(
  "asset_listings",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    externalUrl: text("external_url"),
    externalId: text("external_id"),
    listingStatus: text("listing_status").notNull().default("planned"),
    price: numeric("price"),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_listings_asset_id_idx").on(table.assetId),
    index("asset_listings_client_id_idx").on(table.clientId),
  ],
);

export const assetRevenueTable = pgTable(
  "asset_revenue",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id").references(() => assetListingsTable.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    amount: numeric("amount").notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_revenue_asset_id_idx").on(table.assetId),
    index("asset_revenue_client_id_idx").on(table.clientId),
    index("asset_revenue_occurred_at_idx").on(table.occurredAt),
  ],
);

export const insertAssetSchema = createInsertSchema(assetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAssetFileSchema = createInsertSchema(assetFilesTable).omit({
  id: true,
  createdAt: true,
});
export const insertAssetListingSchema = createInsertSchema(
  assetListingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetRevenueSchema = createInsertSchema(
  assetRevenueTable,
).omit({ id: true, createdAt: true });

export type Asset = typeof assetsTable.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type AssetFile = typeof assetFilesTable.$inferSelect;
export type InsertAssetFile = z.infer<typeof insertAssetFileSchema>;
export type AssetListing = typeof assetListingsTable.$inferSelect;
export type InsertAssetListing = z.infer<typeof insertAssetListingSchema>;
export type AssetRevenue = typeof assetRevenueTable.$inferSelect;
export type InsertAssetRevenue = z.infer<typeof insertAssetRevenueSchema>;
