import { pgTable, serial, text, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { extractionJobsTable } from "./extraction-jobs";

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

export const crmBlueprintsTable = pgTable("crm_blueprints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sourceJobId: integer("source_job_id").references(() => extractionJobsTable.id, { onDelete: "set null" }),
  status: text("status", { enum: ["draft", "committed"] }).notNull().default("draft"),
  definition: jsonb("definition").$type<CrmBlueprintDef>().notNull().default({ entities: [] } as CrmBlueprintDef),
  recordCount: integer("record_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_blueprints_status_idx").on(table.status),
  index("crm_blueprints_source_job_idx").on(table.sourceJobId),
]);

export const crmRecordsTable = pgTable("crm_records", {
  id: serial("id").primaryKey(),
  crmId: integer("crm_id").notNull().references(() => crmBlueprintsTable.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  provenance: jsonb("provenance").$type<CellProvenance>().notNull().default({} as CellProvenance),
  warnings: jsonb("warnings").$type<RecordWarning[]>().notNull().default([] as RecordWarning[]),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_records_crm_idx").on(table.crmId),
  index("crm_records_entity_idx").on(table.crmId, table.entityType),
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
