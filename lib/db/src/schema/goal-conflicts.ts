import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botAssignmentsTable } from "./memory";
import { clientsTable } from "./clients";

export const goalConflictsTable = pgTable(
  "goal_conflicts",
  {
    id: serial("id").primaryKey(),
    goalAId: integer("goal_a_id")
      .notNull()
      .references(() => botAssignmentsTable.id, { onDelete: "cascade" }),
    goalBId: integer("goal_b_id")
      .notNull()
      .references(() => botAssignmentsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    conflictType: text("conflict_type").notNull(),
    resolution: text("resolution"),
    resolutionReason: text("resolution_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").notNull().default("system"),
    escalatedToHuman: integer("escalated_to_human").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("goal_conflicts_goal_a_id_idx").on(table.goalAId),
    index("goal_conflicts_goal_b_id_idx").on(table.goalBId),
    index("goal_conflicts_client_id_idx").on(table.clientId),
    index("goal_conflicts_resolved_by_idx").on(table.resolvedBy),
  ],
);

export const insertGoalConflictSchema = createInsertSchema(
  goalConflictsTable,
).omit({ id: true, createdAt: true });

export type GoalConflict = typeof goalConflictsTable.$inferSelect;
export type InsertGoalConflict = z.infer<typeof insertGoalConflictSchema>;
