import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botVariantAssignmentsTable = pgTable(
  "bot_variant_assignments",
  {
    id: serial("id").primaryKey(),
    botRole: text("bot_role").notNull(),
    variantAConfigId: integer("variant_a_config_id"),
    variantBConfigId: integer("variant_b_config_id"),
    assignmentWeightA: real("assignment_weight_a").notNull().default(0.8),
    assignmentWeightB: real("assignment_weight_b").notNull().default(0.2),
    performanceDelta: real("performance_delta"),
    weeksOfSignificance: integer("weeks_of_significance").notNull().default(0),
    lastTTestPValue: real("last_t_test_p_value"),
    lastTTestStatistic: real("last_t_test_statistic"),
    sampleSizeA: integer("sample_size_a").notNull().default(0),
    sampleSizeB: integer("sample_size_b").notNull().default(0),
    meanOutcomeA: real("mean_outcome_a"),
    meanOutcomeB: real("mean_outcome_b"),
    championDeclaredAt: timestamp("champion_declared_at", { withTimezone: true }),
    championVariant: text("champion_variant"),
    status: text("status").notNull().default("active"),
    retiredConfigId: integer("retired_config_id"),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bot_variant_assignments_bot_role_idx").on(table.botRole),
    index("bot_variant_assignments_status_idx").on(table.status),
    index("bot_variant_assignments_champion_declared_at_idx").on(table.championDeclaredAt),
  ],
);

export const insertBotVariantAssignmentSchema = createInsertSchema(
  botVariantAssignmentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type BotVariantAssignment = typeof botVariantAssignmentsTable.$inferSelect;
export type InsertBotVariantAssignment = z.infer<typeof insertBotVariantAssignmentSchema>;
