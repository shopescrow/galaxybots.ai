import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { assetsTable } from "./assets";

export const platformComplianceTable = pgTable("platform_compliance", {
  id: serial("id").primaryKey(),
  standardName: text("standard_name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"),
  certificationId: text("certification_id"),
  issuedBy: text("issued_by"),
  details: text("details"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clientComplianceRequirementsTable = pgTable("client_compliance_requirements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformComplianceSchema = createInsertSchema(platformComplianceTable).omit({
  id: true,
  createdAt: true,
  receivedAt: true,
});

export const insertClientComplianceRequirementSchema = createInsertSchema(clientComplianceRequirementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PlatformCompliance = typeof platformComplianceTable.$inferSelect;
export type InsertPlatformCompliance = z.infer<typeof insertPlatformComplianceSchema>;
export type ClientComplianceRequirement = typeof clientComplianceRequirementsTable.$inferSelect;
export type InsertClientComplianceRequirement = z.infer<typeof insertClientComplianceRequirementSchema>;

// ---------------------------------------------------------------------------
// Compliance & IP firewall — the pre-publish safety gate for sellable assets.
// Every asset is screened (AI-content policy fit, originality/similarity,
// trademark/brand screening, AI-disclosure) before it can move to "published".
// ---------------------------------------------------------------------------

// Overall gate verdicts.
export const FIREWALL_DECISIONS = ["pass", "flag", "block"] as const;
export type FirewallDecision = (typeof FIREWALL_DECISIONS)[number];

// Where a check sits in the human-review lifecycle.
export const FIREWALL_REVIEW_STATUSES = [
  "auto_passed", // gate passed, no human needed
  "pending_review", // flagged — awaiting human decision
  "approved", // human accepted (publish allowed)
  "rejected", // human rejected (stays gated)
  "blocked", // hard failure — cannot be published
] as const;
export type FirewallReviewStatus = (typeof FIREWALL_REVIEW_STATUSES)[number];

// A single sub-check result produced by the gate.
export interface FirewallCheckItem {
  name: string;
  category: "policy" | "originality" | "trademark" | "disclosure";
  status: FirewallDecision;
  reason: string;
  detail?: Record<string, unknown>;
}

// One run of the pre-publish gate against an asset.
export const assetComplianceChecksTable = pgTable(
  "asset_compliance_checks",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    targetPlatform: text("target_platform"),
    decision: text("decision").notNull().default("pass"),
    reviewStatus: text("review_status").notNull().default("auto_passed"),
    // Full per-check breakdown for the UI / audit trail.
    checks: jsonb("checks").$type<FirewallCheckItem[]>().notNull().default([]),
    // Flat list of human-readable reasons (flags + blocks).
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    similarityScore: numeric("similarity_score"),
    matchedAssetId: integer("matched_asset_id"),
    matchedAssetTitle: text("matched_asset_title"),
    triggeredBy: text("triggered_by"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("asset_compliance_checks_asset_id_idx").on(table.assetId),
    index("asset_compliance_checks_client_id_idx").on(table.clientId),
    index("asset_compliance_checks_review_status_idx").on(table.reviewStatus),
    index("asset_compliance_checks_created_at_idx").on(table.createdAt),
  ],
);

// Disclosure state recorded on the license/rights record.
export const DISCLOSURE_STATES = [
  "not_required",
  "required", // platform/asset requires disclosure but not yet tagged
  "tagged", // AI-disclosure text present
] as const;
export type DisclosureState = (typeof DISCLOSURE_STATES)[number];

export interface LicenseSource {
  type: string; // e.g. "ai_model", "stock_image", "font", "dataset"
  name: string; // e.g. "gpt-image-1", "Unsplash"
  license?: string; // e.g. "CC0", "commercial", "proprietary"
  url?: string;
}

// The rights/provenance record carried by every asset — what was used to make
// it, the usage rights, and its AI-disclosure state.
export const assetLicenseRecordsTable = pgTable(
  "asset_license_records",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assetsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    aiGenerated: boolean("ai_generated").notNull().default(true),
    sourcesUsed: jsonb("sources_used")
      .$type<LicenseSource[]>()
      .notNull()
      .default([]),
    usageRights: text("usage_rights"),
    disclosureState: text("disclosure_state").notNull().default("required"),
    disclosureText: text("disclosure_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("asset_license_records_asset_unique").on(table.assetId),
    index("asset_license_records_client_id_idx").on(table.clientId),
  ],
);

// Per-platform policy strictness operators can tune.
export const POLICY_STRICTNESS = ["lenient", "standard", "strict"] as const;
export type PolicyStrictness = (typeof POLICY_STRICTNESS)[number];

export const platformPolicyConfigsTable = pgTable(
  "platform_policy_configs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    strictness: text("strictness").notNull().default("standard"),
    aiContentAllowed: boolean("ai_content_allowed").notNull().default(true),
    disclosureRequired: boolean("disclosure_required").notNull().default(true),
    // Similarity above this flags; (threshold + blockMargin) blocks.
    similarityThreshold: numeric("similarity_threshold").notNull().default("0.72"),
    prohibitedKeywords: jsonb("prohibited_keywords")
      .$type<string[]>()
      .notNull()
      .default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("platform_policy_client_platform_unique").on(
      table.clientId,
      table.platform,
    ),
    index("platform_policy_configs_client_id_idx").on(table.clientId),
  ],
);

export const insertAssetComplianceCheckSchema = createInsertSchema(
  assetComplianceChecksTable,
).omit({ id: true, createdAt: true });
export const insertAssetLicenseRecordSchema = createInsertSchema(
  assetLicenseRecordsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPlatformPolicyConfigSchema = createInsertSchema(
  platformPolicyConfigsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type AssetComplianceCheck = typeof assetComplianceChecksTable.$inferSelect;
export type InsertAssetComplianceCheck = z.infer<
  typeof insertAssetComplianceCheckSchema
>;
export type AssetLicenseRecord = typeof assetLicenseRecordsTable.$inferSelect;
export type InsertAssetLicenseRecord = z.infer<
  typeof insertAssetLicenseRecordSchema
>;
export type PlatformPolicyConfig = typeof platformPolicyConfigsTable.$inferSelect;
export type InsertPlatformPolicyConfig = z.infer<
  typeof insertPlatformPolicyConfigSchema
>;
