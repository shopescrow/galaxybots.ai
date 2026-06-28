import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { assetsTable } from "./assets";
import { usersTable } from "./users";

// Wildcard value used for the "applies to all" scope on type / platform.
export const AUTONOMY_SCOPE_ANY = "*";

// Compliance verdicts the cockpit consumes from the asset's compliance result
// (produced by the Compliance & IP Firewall task and stored on the asset).
export const ASSET_COMPLIANCE_STATUSES = [
  "pass",
  "fail",
  "review",
  "pending",
] as const;
export type AssetComplianceStatus = (typeof ASSET_COMPLIANCE_STATUSES)[number];

// ---- Per-client autonomy threshold config (scoped by asset type/platform) ---
export const assetAutonomyConfigsTable = pgTable(
  "asset_autonomy_configs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // "*" means the rule applies to every asset type / target platform.
    assetType: text("asset_type").notNull().default(AUTONOMY_SCOPE_ANY),
    targetPlatform: text("target_platform").notNull().default(AUTONOMY_SCOPE_ANY),
    autoPublishEnabled: boolean("auto_publish_enabled").notNull().default(false),
    // 0-100 confidence floor above which an asset may auto-publish.
    confidenceThreshold: integer("confidence_threshold").notNull().default(85),
    // When true, only a "pass" compliance verdict qualifies; otherwise "pending"
    // also qualifies (a "fail"/"review" never auto-publishes regardless).
    requireCompliancePass: boolean("require_compliance_pass")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("asset_autonomy_client_type_platform_uq").on(
      table.clientId,
      table.assetType,
      table.targetPlatform,
    ),
    index("asset_autonomy_client_id_idx").on(table.clientId),
  ],
);

// ---- Audit trail of auto-published assets (with rollback support) -----------
export const assetAutoPublishLogTable = pgTable(
  "asset_auto_publish_log",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // Keep the audit entry even if the asset is later deleted.
    assetId: integer("asset_id").references(() => assetsTable.id, {
      onDelete: "set null",
    }),
    // Snapshot of identifying fields at publish time.
    assetTitle: text("asset_title").notNull(),
    assetType: text("asset_type").notNull(),
    targetPlatform: text("target_platform"),
    confidenceScore: integer("confidence_score").notNull(),
    thresholdUsed: integer("threshold_used").notNull(),
    complianceStatus: text("compliance_status").notNull(),
    confidenceFactors: jsonb("confidence_factors")
      .$type<Record<string, unknown>>()
      .default({}),
    // Status the asset held before it was auto-published (for rollback).
    previousStatus: text("previous_status"),
    rolledBack: boolean("rolled_back").notNull().default(false),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackBy: integer("rolled_back_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    rollbackReason: text("rollback_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_auto_publish_log_client_id_idx").on(table.clientId),
    index("asset_auto_publish_log_asset_id_idx").on(table.assetId),
    index("asset_auto_publish_log_created_at_idx").on(table.createdAt),
    index("asset_auto_publish_log_rolled_back_idx").on(table.rolledBack),
  ],
);

export const insertAssetAutonomyConfigSchema = createInsertSchema(
  assetAutonomyConfigsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAssetAutoPublishLogSchema = createInsertSchema(
  assetAutoPublishLogTable,
).omit({ id: true, createdAt: true });

export type AssetAutonomyConfig = typeof assetAutonomyConfigsTable.$inferSelect;
export type InsertAssetAutonomyConfig = z.infer<
  typeof insertAssetAutonomyConfigSchema
>;
export type AssetAutoPublishLog = typeof assetAutoPublishLogTable.$inferSelect;
export type InsertAssetAutoPublishLog = z.infer<
  typeof insertAssetAutoPublishLogSchema
>;
