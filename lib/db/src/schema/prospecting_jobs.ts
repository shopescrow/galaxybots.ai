import { pgTable, serial, text, timestamp, integer, jsonb, numeric, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const prospectingJobsTable = pgTable("prospecting_jobs", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  location: text("location"),
  limit: integer("limit").notNull().default(50),
  status: text("status", { enum: ["pending", "running", "completed", "failed", "paused", "human_review"] }).notNull().default("pending"),
  totalFound: integer("total_found").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  successfulCount: integer("successful_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  humanReviewCount: integer("human_review_count").notNull().default(0),
  totalCostCredits: numeric("total_cost_credits").notNull().default("0"),
  checkpointData: jsonb("checkpoint_data"),
  requestedBy: text("requested_by"),
  source: text("source", { enum: ["galaxybots", "piratemonster"] }).notNull().default("galaxybots"),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("prospecting_jobs_client_id_idx").on(table.clientId),
  index("prospecting_jobs_status_idx").on(table.status),
  index("prospecting_jobs_idempotency_key_idx").on(table.idempotencyKey),
]);

export type ProspectingJob = typeof prospectingJobsTable.$inferSelect;
export type InsertProspectingJob = typeof prospectingJobsTable.$inferInsert;
