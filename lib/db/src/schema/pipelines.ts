import { pgTable, serial, text, timestamp, integer, jsonb, boolean, varchar, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export const pipelinesTable = pgTable("pipelines", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull().default("manual"),
  triggerConfig: jsonb("trigger_config").default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pipelineStepsTable = pgTable("pipeline_steps", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  instruction: text("instruction").notNull(),
  stepType: text("step_type").notNull().default("generative"),
  qualityThreshold: numeric("quality_threshold"),
  maxGateRetries: integer("max_gate_retries").notNull().default(2),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineRunsTable = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  triggerType: text("trigger_type").notNull().default("manual"),
  triggerData: jsonb("trigger_data").default({}),
  coordinatorTrace: jsonb("coordinator_trace").$type<Record<string, unknown>>(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineRunStepsTable = pgTable("pipeline_run_steps", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => pipelineRunsTable.id, { onDelete: "cascade" }),
  stepId: integer("step_id").notNull().references(() => pipelineStepsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  instruction: text("instruction").notNull(),
  status: text("status").notNull().default("pending"),
  output: text("output"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pipelineTriggersTable = pgTable("pipeline_triggers", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  triggerType: varchar("trigger_type", { length: 50 }).notNull().default("generic"),
  endpointSlug: varchar("endpoint_slug", { length: 100 }).notNull().unique(),
  signingSecret: text("signing_secret").notNull(),
  label: text("label"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const triggerEventsTable = pgTable("trigger_events", {
  id: serial("id").primaryKey(),
  triggerId: integer("trigger_id").notNull().references(() => pipelineTriggersTable.id, { onDelete: "cascade" }),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelinesTable.id, { onDelete: "cascade" }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payloadPreview: text("payload_preview"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message"),
  runId: integer("run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPipelineSchema = createInsertSchema(pipelinesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPipelineStepSchema = createInsertSchema(pipelineStepsTable).omit({ id: true, createdAt: true });
export const insertPipelineRunSchema = createInsertSchema(pipelineRunsTable).omit({ id: true, createdAt: true });
export const insertPipelineRunStepSchema = createInsertSchema(pipelineRunStepsTable).omit({ id: true, createdAt: true });
export const insertPipelineTriggerSchema = createInsertSchema(pipelineTriggersTable).omit({ id: true, createdAt: true });
export const insertTriggerEventSchema = createInsertSchema(triggerEventsTable).omit({ id: true, createdAt: true });

export type Pipeline = typeof pipelinesTable.$inferSelect;
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type PipelineStep = typeof pipelineStepsTable.$inferSelect;
export type InsertPipelineStep = z.infer<typeof insertPipelineStepSchema>;
export type PipelineRun = typeof pipelineRunsTable.$inferSelect;
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRunStep = typeof pipelineRunStepsTable.$inferSelect;
export type InsertPipelineRunStep = z.infer<typeof insertPipelineRunStepSchema>;
export type PipelineTrigger = typeof pipelineTriggersTable.$inferSelect;
export type InsertPipelineTrigger = z.infer<typeof insertPipelineTriggerSchema>;
export type TriggerEvent = typeof triggerEventsTable.$inferSelect;
export type InsertTriggerEvent = z.infer<typeof insertTriggerEventSchema>;
