import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { extractionJobsTable } from "./extraction-jobs";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("crm_records_crm_idx").on(table.crmId),
  index("crm_records_entity_idx").on(table.crmId, table.entityType),
]);
