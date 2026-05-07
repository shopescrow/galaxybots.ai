import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const workflowsTable = pgTable("workflows", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull().default("manual"),
  triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().default({}),
  nodes: jsonb("nodes").$type<unknown[]>().notNull().default([]),
  edges: jsonb("edges").$type<unknown[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  runCount: integer("run_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").references(() => workflowsTable.id, { onDelete: "cascade" }).notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  triggeredBy: text("triggered_by").notNull().default("manual"),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  log: jsonb("log").$type<unknown[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvalSlaConfigsTable = pgTable("approval_sla_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull().unique(),
  defaultSlaMinutes: integer("default_sla_minutes").notNull().default(240),
  timeSensitiveSlaMinutes: integer("time_sensitive_sla_minutes").notNull().default(60),
  secondaryApproverEmail: text("secondary_approver_email"),
  trustedCategories: text("trusted_categories").array().notNull().default(["web_search", "read_email"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkflowSchema = createInsertSchema(workflowsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowRunSchema = createInsertSchema(workflowRunsTable).omit({ id: true, createdAt: true });
export const insertApprovalSlaConfigSchema = createInsertSchema(approvalSlaConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Workflow = typeof workflowsTable.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;
export type ApprovalSlaConfig = typeof approvalSlaConfigsTable.$inferSelect;
export type InsertApprovalSlaConfig = z.infer<typeof insertApprovalSlaConfigSchema>;
