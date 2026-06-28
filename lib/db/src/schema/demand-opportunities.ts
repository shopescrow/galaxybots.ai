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
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export const DEMAND_OPPORTUNITY_STATUSES = [
  "pending",
  "queued",
  "approved",
  "rejected",
  "produced",
] as const;
export type DemandOpportunityStatus =
  (typeof DEMAND_OPPORTUNITY_STATUSES)[number];

export interface DemandEvidence {
  searchSignals: string[];
  trendSignals: string[];
  competitorExamples: string[];
  sources: string[];
}

/**
 * Niche opportunities produced by the demand-research bot. Each record scores a
 * niche by demand signal vs. competition, carries supporting evidence, and feeds
 * the prioritized creation queue that the asset creator bots consume.
 */
export const demandOpportunitiesTable = pgTable(
  "demand_opportunities",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    botId: integer("bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    category: text("category").notNull(),
    niche: text("niche").notNull(),
    title: text("title").notNull(),
    suggestedAngle: text("suggested_angle").notNull(),
    suggestedAssetType: text("suggested_asset_type"),
    demandScore: real("demand_score").notNull().default(0),
    competitionScore: real("competition_score").notNull().default(0),
    opportunityScore: real("opportunity_score").notNull().default(0),
    evidence: jsonb("evidence")
      .$type<DemandEvidence>()
      .default({
        searchSignals: [],
        trendSignals: [],
        competitorExamples: [],
        sources: [],
      }),
    rank: integer("rank"),
    pinned: boolean("pinned").notNull().default(false),
    status: text("status").notNull().default("pending"),
    resultingAssetId: integer("resulting_asset_id"),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    lastScoredAt: timestamp("last_scored_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("demand_opportunities_client_id_idx").on(table.clientId),
    index("demand_opportunities_status_idx").on(table.status),
    index("demand_opportunities_category_idx").on(table.category),
    index("demand_opportunities_opportunity_score_idx").on(
      table.opportunityScore,
    ),
  ],
);

export const insertDemandOpportunitySchema = createInsertSchema(
  demandOpportunitiesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type DemandOpportunity = typeof demandOpportunitiesTable.$inferSelect;
export type InsertDemandOpportunity = z.infer<
  typeof insertDemandOpportunitySchema
>;
