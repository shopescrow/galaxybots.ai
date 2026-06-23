import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const beliefCategoryEnum = [
  "market_conditions",
  "client_facts",
  "competitor_intel",
  "product_knowledge",
  "relationship_dynamics",
  "operational",
] as const;
export type BeliefCategory = (typeof beliefCategoryEnum)[number];

export const BELIEF_HALF_LIFE_DAYS: Record<BeliefCategory, number> = {
  market_conditions: 14,
  client_facts: 365,
  competitor_intel: 30,
  product_knowledge: 90,
  relationship_dynamics: 60,
  operational: 7,
};

export const botBeliefsTable = pgTable(
  "bot_beliefs",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    beliefText: text("belief_text").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    evidenceCount: integer("evidence_count").notNull().default(1),
    lastConfirmedAt: timestamp("last_confirmed_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    contradictedById: integer("contradicted_by_id"),
    category: text("category").notNull().default("operational"),
    halfLifeDays: integer("half_life_days").notNull().default(30),
    immutable: boolean("immutable").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bot_beliefs_bot_id_idx").on(table.botId),
    index("bot_beliefs_client_id_idx").on(table.clientId),
    index("bot_beliefs_category_idx").on(table.category),
  ],
);

export const clientBeliefsTable = pgTable(
  "client_beliefs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    authorBotId: integer("author_bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    beliefText: text("belief_text").notNull(),
    confidence: real("confidence").notNull().default(0.5),
    category: text("category").notNull().default("client_facts"),
    conflictResolutionStatus: text("conflict_resolution_status")
      .notNull()
      .default("none"),
    contradictedById: integer("contradicted_by_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("client_beliefs_client_id_idx").on(table.clientId),
    index("client_beliefs_author_bot_id_idx").on(table.authorBotId),
  ],
);

export const episodicSummariesTable = pgTable(
  "episodic_summaries",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    narrative: text("narrative").notNull(),
    anchorEvents: jsonb("anchor_events")
      .$type<
        Array<{
          timestamp: string;
          event: string;
          significance: string;
          permanent: boolean;
        }>
      >()
      .default([]),
    turningPoints: jsonb("turning_points").$type<string[]>().default([]),
    decisions: jsonb("decisions").$type<string[]>().default([]),
    outcomes: jsonb("outcomes").$type<string[]>().default([]),
    forwardImplications: jsonb("forward_implications")
      .$type<string[]>()
      .default([]),
    modelUsed: text("model_used").notNull().default("glm-5.2-long"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("episodic_summaries_bot_id_idx").on(table.botId),
    index("episodic_summaries_client_id_idx").on(table.clientId),
    index("episodic_summaries_period_idx").on(
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

export const securityEventsTable = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    contentHash: text("content_hash"),
    disposition: text("disposition").notNull().default("quarantined"),
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "set null",
    }),
    sessionId: integer("session_id"),
    detectionPatterns: jsonb("detection_patterns")
      .$type<string[]>()
      .default([]),
    adversarialScore: real("adversarial_score"),
    rawContentPreview: text("raw_content_preview"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: integer("reviewed_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("security_events_event_type_idx").on(table.eventType),
    index("security_events_bot_id_idx").on(table.botId),
    index("security_events_client_id_idx").on(table.clientId),
    index("security_events_disposition_idx").on(table.disposition),
  ],
);

export const pendingBeliefUpdatesTable = pgTable(
  "pending_belief_updates",
  {
    id: serial("id").primaryKey(),
    botId: integer("bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    existingBeliefId: integer("existing_belief_id"),
    proposedBeliefText: text("proposed_belief_text").notNull(),
    proposedConfidence: real("proposed_confidence").notNull(),
    currentConfidence: real("current_confidence").notNull(),
    confidenceDelta: real("confidence_delta").notNull(),
    triggerSource: text("trigger_source").notNull(),
    corroborationCount: integer("corroboration_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pending_belief_updates_bot_id_idx").on(table.botId),
    index("pending_belief_updates_status_idx").on(table.status),
  ],
);

export const insertBotBeliefSchema = createInsertSchema(botBeliefsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertClientBeliefSchema = createInsertSchema(
  clientBeliefsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEpisodicSummarySchema = createInsertSchema(
  episodicSummariesTable,
).omit({ id: true, createdAt: true });
export const insertSecurityEventSchema = createInsertSchema(
  securityEventsTable,
).omit({ id: true, createdAt: true });
export const insertPendingBeliefUpdateSchema = createInsertSchema(
  pendingBeliefUpdatesTable,
).omit({ id: true, createdAt: true });

export type BotBelief = typeof botBeliefsTable.$inferSelect;
export type InsertBotBelief = z.infer<typeof insertBotBeliefSchema>;
export type ClientBelief = typeof clientBeliefsTable.$inferSelect;
export type InsertClientBelief = z.infer<typeof insertClientBeliefSchema>;
export type EpisodicSummary = typeof episodicSummariesTable.$inferSelect;
export type InsertEpisodicSummary = z.infer<typeof insertEpisodicSummarySchema>;
export type SecurityEvent = typeof securityEventsTable.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type PendingBeliefUpdate = typeof pendingBeliefUpdatesTable.$inferSelect;
export type InsertPendingBeliefUpdate = z.infer<
  typeof insertPendingBeliefUpdateSchema
>;
