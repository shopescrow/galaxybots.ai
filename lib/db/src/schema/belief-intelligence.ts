import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const beliefDomainMapTable = pgTable(
  "belief_domain_map",
  {
    id: serial("id").primaryKey(),
    taskCategory: text("task_category").notNull(),
    beliefDomains: jsonb("belief_domains").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("belief_domain_map_task_category_idx").on(table.taskCategory),
  ],
);

export const personaDivergenceLogTable = pgTable(
  "persona_divergence_log",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientAId: integer("client_a_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    clientBId: integer("client_b_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    cosineSimilarity: real("cosine_similarity").notNull(),
    mostDivergentCategory: text("most_divergent_category"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("persona_divergence_log_bot_id_idx").on(table.botId),
    index("persona_divergence_log_computed_at_idx").on(table.computedAt),
  ],
);

export const personaDivergenceAlertTable = pgTable(
  "persona_divergence_alert",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    botName: text("bot_name").notNull(),
    clientAId: integer("client_a_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    clientBId: integer("client_b_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    cosineSimilarity: real("cosine_similarity").notNull(),
    mostDivergentCategory: text("most_divergent_category"),
    severity: text("severity").notNull().default("low"),
    summary: text("summary").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("persona_divergence_alert_bot_id_idx").on(table.botId),
    index("persona_divergence_alert_resolved_idx").on(table.resolvedAt),
  ],
);

export const insertBeliefDomainMapSchema = createInsertSchema(beliefDomainMapTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPersonaDivergenceLogSchema = createInsertSchema(personaDivergenceLogTable).omit({
  id: true,
  computedAt: true,
});
export const insertPersonaDivergenceAlertSchema = createInsertSchema(personaDivergenceAlertTable).omit({
  id: true,
  createdAt: true,
});

export type BeliefDomainMap = typeof beliefDomainMapTable.$inferSelect;
export type InsertBeliefDomainMap = z.infer<typeof insertBeliefDomainMapSchema>;
export type PersonaDivergenceLog = typeof personaDivergenceLogTable.$inferSelect;
export type InsertPersonaDivergenceLog = z.infer<typeof insertPersonaDivergenceLogSchema>;
export type PersonaDivergenceAlert = typeof personaDivergenceAlertTable.$inferSelect;
export type InsertPersonaDivergenceAlert = z.infer<typeof insertPersonaDivergenceAlertSchema>;
