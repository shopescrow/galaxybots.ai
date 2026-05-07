import { pgTable, serial, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { extractionJobsTable } from "./extraction-jobs";
import { usersTable } from "./users";

export interface CellProvenance {
  sourceJobId?: number;
  sourcePageId?: number;
  pageNumber?: number;
  region?: { x: number; y: number; w: number; h: number } | null;
  /** Per-cell screenshot regions, keyed by field name. Falls back to the
   * row-level `region` when a cell-specific one is not available. */
  regions?: Record<string, { x: number; y: number; w: number; h: number }>;
  confidence?: Record<string, number>;
  rawValues?: Record<string, unknown>;
}

export interface RecordWarning {
  field?: string;
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
}

export type CrmFieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "email"
  | "url"
  | "phone"
  | "enum";

export interface CrmFieldDef {
  name: string;
  label: string;
  type: CrmFieldType;
  required: boolean;
  enumValues?: string[];
  sampleValues?: unknown[];
  sourceField?: string;
  /**
   * When set, this field is a foreign reference to another entity in the same
   * blueprint. The stored value matches the target entity's primary display
   * field, which allows commits and the related-records lookup to resolve
   * links by value without depending on database ids.
   */
  linkTo?: string;
}

export interface CrmEntityDef {
  name: string;
  label: string;
  primaryDisplayField?: string;
  fields: CrmFieldDef[];
}

export interface CrmBlueprintDef {
  entities: CrmEntityDef[];
}

export type CrmSyncCadence = "manual" | "hourly" | "daily" | "weekly";
export type CrmSyncConflictPolicy = "local_wins" | "source_wins" | "ask";

export const crmBlueprintsTable = pgTable("crm_blueprints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sourceJobId: integer("source_job_id").references(() => extractionJobsTable.id, { onDelete: "set null" }),
  ownerUserId: integer("owner_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["draft", "committed"] }).notNull().default("draft"),
  definition: jsonb("definition").$type<CrmBlueprintDef>().notNull().default({ entities: [] } as CrmBlueprintDef),
  recordCount: integer("record_count").notNull().default(0),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  syncCadence: text("sync_cadence", { enum: ["manual", "hourly", "daily", "weekly"] }).notNull().default("manual"),
  syncConflictPolicy: text("sync_conflict_policy", { enum: ["local_wins", "source_wins", "ask"] }).notNull().default("local_wins"),
  syncIdentityFields: jsonb("sync_identity_fields").$type<string[]>().notNull().default([] as string[]),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_blueprints_status_idx").on(table.status),
  index("crm_blueprints_source_job_idx").on(table.sourceJobId),
  index("crm_blueprints_sync_due_idx").on(table.syncEnabled, table.lastSyncAt),
  index("crm_blueprints_owner_idx").on(table.ownerUserId),
]);

export const crmRecordsTable = pgTable("crm_records", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  provenance: jsonb("provenance").$type<CellProvenance>().notNull().default({} as CellProvenance),
  warnings: jsonb("warnings").$type<RecordWarning[]>().notNull().default([] as RecordWarning[]),
  needsReview: boolean("needs_review").notNull().default(false),
  identityKey: text("identity_key"),
  sourceData: jsonb("source_data").$type<Record<string, unknown>>(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  userModifiedAt: timestamp("user_modified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_records_crm_idx").on(table.crmId),
  index("crm_records_entity_idx").on(table.crmId, table.entityType),
  index("crm_records_identity_idx").on(table.crmId, table.entityType, table.identityKey),
]);

export type CrmSyncRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "drift_paused"
  | "rolled_back";

export interface CrmSyncTotals {
  new: number;
  changed: number;
  unchanged: number;
  removed: number;
  conflicts: number;
}

export interface CrmSchemaDrift {
  added: { name: string; type: string }[];
  removed: { name: string; type: string }[];
  changed: { name: string; oldType: string; newType: string }[];
}

export const crmSyncRunsTable = pgTable("crm_sync_runs", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "drift_paused", "rolled_back"],
  }).notNull().default("pending"),
  triggeredBy: text("triggered_by", { enum: ["manual", "scheduler"] }).notNull().default("manual"),
  conflictPolicy: text("conflict_policy", { enum: ["local_wins", "source_wins", "ask"] }).notNull().default("local_wins"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  totals: jsonb("totals").$type<CrmSyncTotals>().notNull().default({
    new: 0, changed: 0, unchanged: 0, removed: 0, conflicts: 0,
  } as CrmSyncTotals),
  schemaDrift: jsonb("schema_drift").$type<CrmSchemaDrift | null>(),
  errorMessage: text("error_message"),
  rollbackOfRunId: integer("rollback_of_run_id"),
}, (table) => [
  index("crm_sync_runs_crm_idx").on(table.crmId, table.startedAt),
]);

export type CrmSyncChangeType = "new" | "changed" | "unchanged" | "removed";
export type CrmSyncChangeDecision = "pending" | "approved" | "rejected" | "auto_applied";

export interface CrmFieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  conflictWithLocal?: boolean;
  localValue?: unknown;
}

export const crmSyncChangesTable = pgTable("crm_sync_changes", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id").notNull().references(() => crmSyncRunsTable.id, { onDelete: "cascade" }),
  crmId: integer("crm_id").notNull(),
  entityType: text("entity_type").notNull(),
  changeType: text("change_type", { enum: ["new", "changed", "unchanged", "removed"] }).notNull(),
  identityKey: text("identity_key"),
  recordId: integer("record_id"),
  oldData: jsonb("old_data").$type<Record<string, unknown> | null>(),
  newData: jsonb("new_data").$type<Record<string, unknown> | null>(),
  fieldDiffs: jsonb("field_diffs").$type<CrmFieldDiff[]>().notNull().default([] as CrmFieldDiff[]),
  hasConflicts: boolean("has_conflicts").notNull().default(false),
  decision: text("decision", { enum: ["pending", "approved", "rejected", "auto_applied"] }).notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  reverseSnapshot: jsonb("reverse_snapshot").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("crm_sync_changes_run_idx").on(table.syncRunId),
  index("crm_sync_changes_record_idx").on(table.recordId),
]);

export interface PipelineStageState {
  status: "pending" | "running" | "done" | "failed" | "skipped";
  rowsIn?: number;
  rowsOut?: number;
  warnings?: number;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
}

export type PipelineStageName = "normalize" | "dedupe" | "resolve" | "dryrun" | "commit";

export interface FieldRecipe {
  transforms: string[];
}

export interface PipelineRecipe {
  fields: Record<string, FieldRecipe>;
  confidenceThreshold: number;
}

export interface DedupCluster {
  id: string;
  entityType: string;
  rowIds: number[];
  representativeRowId: number;
  similarity: number;
  signal: string;
  method: "exact" | "fuzzy" | "embedding";
  status: "proposed" | "accepted" | "rejected";
  preview: Record<string, unknown>[];
}

export interface IdentityLink {
  id: string;
  fromEntityType: string;
  fromRowId: number;
  toEntityType: string;
  toRowId: number;
  signal: string;
  similarity: number;
  method: "fk_overlap" | "shared_identifier" | "embedding";
  status: "proposed" | "accepted" | "rejected";
}

export interface DryRunRow {
  rowId: number;
  entityType: string;
  data: Record<string, unknown>;
  provenance: CellProvenance;
  warnings: RecordWarning[];
  needsReview: boolean;
}

export interface SavedViewDSL {
  kind: "query";
  entity: string;
  filters: Array<{ field: string; op: string; value?: unknown }>;
  sort?: { field: string; order: "asc" | "desc" } | null;
  limit?: number | null;
  aggregate?: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string | null; groupBy?: string | null } | null;
  project?: string[] | null;
  output: "table" | "chart" | "summary";
}

export const crmSavedViewsTable = pgTable("crm_saved_views", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  question: text("question"),
  dsl: jsonb("dsl").$type<SavedViewDSL>().notNull(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("crm_saved_views_crm_idx").on(table.crmId),
]);

export const crmInsightsTable = pgTable("crm_insights", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id"),
  kind: text("kind").notNull(),
  severity: text("severity", { enum: ["info", "warn", "alert"] }).notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({} as Record<string, unknown>),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("crm_insights_crm_idx").on(table.crmId),
  index("crm_insights_observed_idx").on(table.crmId, table.observedAt),
]);

export const rebuildJobsTable = pgTable("rebuild_jobs", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  sourceJobId: integer("source_job_id").references(() => extractionJobsTable.id, { onDelete: "set null" }),
  status: text("status", { enum: ["pending", "running", "awaiting_review", "ready_to_commit", "committed", "failed"] }).notNull().default("pending"),
  currentStage: text("current_stage", { enum: ["normalize", "dedupe", "resolve", "dryrun", "commit"] }).notNull().default("normalize"),
  stages: jsonb("stages").$type<Record<PipelineStageName, PipelineStageState>>().notNull().default({} as Record<PipelineStageName, PipelineStageState>),
  recipe: jsonb("recipe").$type<PipelineRecipe>().notNull().default({ fields: {}, confidenceThreshold: 0.6 } as PipelineRecipe),
  dedupClusters: jsonb("dedup_clusters").$type<DedupCluster[]>().notNull().default([] as DedupCluster[]),
  identityLinks: jsonb("identity_links").$type<IdentityLink[]>().notNull().default([] as IdentityLink[]),
  dryRunRows: jsonb("dry_run_rows").$type<DryRunRow[]>().notNull().default([] as DryRunRow[]),
  warnings: jsonb("warnings").$type<RecordWarning[]>().notNull().default([] as RecordWarning[]),
  rowsIn: integer("rows_in").notNull().default(0),
  rowsOut: integer("rows_out").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("rebuild_jobs_crm_idx").on(table.crmId),
  index("rebuild_jobs_status_idx").on(table.status),
]);
