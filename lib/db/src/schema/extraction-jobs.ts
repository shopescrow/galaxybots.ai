import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

export const extractionJobsTable = pgTable("extraction_jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sourceUrl: text("source_url").notNull(),
  status: text("status", { enum: ["pending", "running", "paused", "completed", "failed"] }).notNull().default("pending"),
  extractionType: text("extraction_type", { enum: ["table", "list", "contacts", "custom"] }).notNull().default("custom"),
  fieldMapping: jsonb("field_mapping").$type<{ fields: string[]; instructions?: string }>().default({ fields: [] }),
  totalPages: integer("total_pages").notNull().default(0),
  pagesCompleted: integer("pages_completed").notNull().default(0),
  rowsExtracted: integer("rows_extracted").notNull().default(0),
  errorMessage: text("error_message"),
  extractedData: jsonb("extracted_data").$type<Record<string, unknown>[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("extraction_jobs_status_idx").on(table.status),
]);

export const extractionPagesTable = pgTable("extraction_pages", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => extractionJobsTable.id, { onDelete: "cascade" }),
  pageUrl: text("page_url").notNull(),
  pageNumber: integer("page_number").notNull().default(1),
  status: text("status", { enum: ["pending", "captured", "extracted", "failed"] }).notNull().default("pending"),
  screenshotBase64: text("screenshot_base64"),
  extractedRows: jsonb("extracted_rows").$type<Record<string, unknown>[]>().default([]),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("extraction_pages_job_idx").on(table.jobId),
]);
