import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";
import { botAssignmentsTable } from "./memory";

export const uncertaintySchedulesTable = pgTable(
  "uncertainty_schedules",
  {
    id: serial("id").primaryKey(),
    beliefId: integer("belief_id"),
    goalId: integer("goal_id")
      .notNull()
      .references(() => botAssignmentsTable.id, { onDelete: "cascade" }),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    beliefText: text("belief_text").notNull(),
    currentConfidence: real("current_confidence").notNull(),
    requiredConfidence: real("required_confidence").notNull().default(0.7),
    scheduledGatherAt: timestamp("scheduled_gather_at", {
      withTimezone: true,
    }).notNull(),
    status: text("status").notNull().default("pending"),
    gatheredAt: timestamp("gathered_at", { withTimezone: true }),
    confidenceAfterGather: real("confidence_after_gather"),
    leadTimeDays: integer("lead_time_days").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("uncertainty_schedules_goal_id_idx").on(table.goalId),
    index("uncertainty_schedules_bot_id_idx").on(table.botId),
    index("uncertainty_schedules_status_idx").on(table.status),
    index("uncertainty_schedules_scheduled_gather_at_idx").on(
      table.scheduledGatherAt,
    ),
  ],
);

export const insertUncertaintyScheduleSchema = createInsertSchema(
  uncertaintySchedulesTable,
).omit({ id: true, createdAt: true });

export type UncertaintySchedule =
  typeof uncertaintySchedulesTable.$inferSelect;
export type InsertUncertaintySchedule = z.infer<
  typeof insertUncertaintyScheduleSchema
>;
