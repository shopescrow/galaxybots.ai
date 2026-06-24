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

export const platformCausalPatternsTable = pgTable(
  "platform_causal_patterns",
  {
    id: serial("id").primaryKey(),
    industryVertical: text("industry_vertical").notNull(),
    companySizeTier: text("company_size_tier").notNull(),
    contextType: text("context_type").notNull(),
    actionType: text("action_type").notNull(),
    outcomeType: text("outcome_type").notNull(),
    effectSize: real("effect_size").notNull().default(0),
    evidenceCount: integer("evidence_count").notNull().default(0),
    confidence: real("confidence").notNull().default(0),
    clientCount: integer("client_count").notNull().default(0),
    pooledMean: real("pooled_mean"),
    pooledStdDev: real("pooled_std_dev"),
    confidenceIntervalLow: real("confidence_interval_low"),
    confidenceIntervalHigh: real("confidence_interval_high"),
    quarantined: integer("quarantined").notNull().default(0),
    lastAggregatedAt: timestamp("last_aggregated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("platform_causal_patterns_vertical_idx").on(table.industryVertical),
    index("platform_causal_patterns_action_type_idx").on(table.actionType),
    index("platform_causal_patterns_context_type_idx").on(table.contextType),
    index("platform_causal_patterns_last_aggregated_idx").on(table.lastAggregatedAt),
  ],
);

export const insertPlatformCausalPatternSchema = createInsertSchema(
  platformCausalPatternsTable,
).omit({ id: true, createdAt: true });

export type PlatformCausalPattern = typeof platformCausalPatternsTable.$inferSelect;
export type InsertPlatformCausalPattern = z.infer<typeof insertPlatformCausalPatternSchema>;
