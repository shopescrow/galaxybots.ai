import { pgTable, serial, text, timestamp, integer, numeric, uniqueIndex, real, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const TASK_CATEGORIES = ["research", "analysis", "execution", "review", "legal", "financial"] as const;
export const COORDINATOR_ROLES = ["thinker", "worker", "verifier"] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];

export const coordinatorWeightsTable = pgTable(
  "coordinator_weights",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
    taskCategory: text("task_category").notNull(),
    role: text("role").notNull(),
    weight: numeric("weight", { precision: 10, scale: 6 }).notNull().default("1.0"),
    sampleCount: integer("sample_count").notNull().default(0),
    modelVersion: text("model_version"),
    modelTier: text("model_tier"),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueClientBotCategoryRole: uniqueIndex("coordinator_weights_client_bot_category_role_idx").on(
      table.clientId,
      table.botId,
      table.taskCategory,
      table.role,
    ),
  }),
);

export const coordinatorWeightArchiveTable = pgTable("coordinator_weight_archive", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull(),
  taskCategory: text("task_category").notNull(),
  role: text("role").notNull(),
  weight: numeric("weight", { precision: 10, scale: 6 }).notNull(),
  sampleCount: integer("sample_count").notNull().default(0),
  modelVersion: text("model_version"),
  reason: text("reason").notNull().default("model_version_change"),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coordinatorGlobalPriorsTable = pgTable("coordinator_global_priors", {
  id: serial("id").primaryKey(),
  taskCategory: text("task_category").notNull(),
  role: text("role").notNull(),
  priorWeight: numeric("prior_weight", { precision: 10, scale: 6 }).notNull().default("1.0"),
  totalRunCount: integer("total_run_count").notNull().default(0),
  modelVersion: text("model_version"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const weightSnapshotsTable = pgTable("weight_snapshots", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  snapshotType: text("snapshot_type").notNull().default("pre_cycle"),
  data: jsonb("data").notNull().default({}),
  avgQualityAtTime: real("avg_quality_at_time"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coordinatorClientSettingsTable = pgTable(
  "coordinator_client_settings",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
    settingKey: text("setting_key").notNull(),
    settingValue: text("setting_value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientSettingUq: uniqueIndex("coordinator_client_settings_uq").on(table.clientId, table.settingKey),
    clientIdIdx: index("coordinator_client_settings_client_id_idx").on(table.clientId),
  }),
);

export const insertCoordinatorWeightSchema = createInsertSchema(coordinatorWeightsTable).omit({
  id: true,
  createdAt: true,
});

export type CoordinatorWeight = typeof coordinatorWeightsTable.$inferSelect;
export type InsertCoordinatorWeight = z.infer<typeof insertCoordinatorWeightSchema>;
export type WeightSnapshot = typeof weightSnapshotsTable.$inferSelect;

export interface RoleAssignment {
  botId: number;
  botName: string;
  role: CoordinatorRole;
  weight: number;
  reasoning: string;
}

export interface BeliefSuppression {
  botId: number;
  role: "thinker";
  reason: "active_contradiction";
  contradictionRef: string;
}

export interface CoordinatorPlan {
  runId?: number;
  taskCategory: TaskCategory;
  taskDescription: string;
  thinker: RoleAssignment;
  worker: RoleAssignment;
  verifier: RoleAssignment;
  roleAssignments: RoleAssignment[];
  roleByStepIndex: Record<number, CoordinatorRole>;
  timestamp: number;
  weightsSnapshot: Record<string, Record<string, number>>;
  qualityScores?: Record<string, number>;
  beliefSuppressions?: BeliefSuppression[];
}
