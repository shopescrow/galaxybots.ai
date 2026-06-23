import { pgTable, serial, text, timestamp, integer, jsonb, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";

export const TASK_CATEGORIES = ["research", "analysis", "execution", "review", "legal", "financial"] as const;
export const COORDINATOR_ROLES = ["thinker", "worker", "verifier"] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export type CoordinatorRole = (typeof COORDINATOR_ROLES)[number];

export const coordinatorWeightsTable = pgTable(
  "coordinator_weights",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
    taskCategory: text("task_category").notNull(),
    role: text("role").notNull(),
    weight: numeric("weight", { precision: 10, scale: 6 }).notNull().default("1.0"),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueBotCategoryRole: uniqueIndex("coordinator_weights_bot_category_role_idx").on(
      table.botId,
      table.taskCategory,
      table.role,
    ),
  }),
);

export const insertCoordinatorWeightSchema = createInsertSchema(coordinatorWeightsTable).omit({
  id: true,
  createdAt: true,
});

export type CoordinatorWeight = typeof coordinatorWeightsTable.$inferSelect;
export type InsertCoordinatorWeight = z.infer<typeof insertCoordinatorWeightSchema>;

export interface RoleAssignment {
  botId: number;
  botName: string;
  role: CoordinatorRole;
  weight: number;
  reasoning: string;
}

export interface CoordinatorPlan {
  runId?: number;
  taskCategory: TaskCategory;
  taskDescription: string;
  thinker: RoleAssignment;
  worker: RoleAssignment;
  verifier: RoleAssignment;
  roleAssignments: RoleAssignment[];
  /**
   * Step-index → role mapping (0-based, matches pipeline step order).
   * This is the authoritative lookup used during execution — not botId —
   * so role collision in 2-bot pipelines and ordering are both guaranteed.
   */
  roleByStepIndex: Record<number, CoordinatorRole>;
  timestamp: number;
  weightsSnapshot: Record<string, Record<string, number>>;
  /** Quality scores recorded per step, populated during execution. */
  qualityScores?: Record<string, number>;
}
