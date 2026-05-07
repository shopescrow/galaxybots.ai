import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const slaTiersTable = pgTable("sla_tiers", {
  id: serial("id").primaryKey(),
  tierId: text("tier_id").notNull().unique(),
  tierName: text("tier_name").notNull(),
  responseTargetMs: integer("response_target_ms").notNull(),
  completionTargetMinutes: integer("completion_target_minutes").notNull(),
  escalationChannels: jsonb("escalation_channels").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botSlaOverridesTable = pgTable("bot_sla_overrides", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull(),
  clientId: integer("client_id").notNull(),
  responseTargetMs: integer("response_target_ms"),
  completionTargetMinutes: integer("completion_target_minutes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botSlaEventsTable = pgTable("bot_sla_events", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull(),
  clientId: integer("client_id").notNull(),
  sessionId: integer("session_id"),
  eventType: text("event_type").notNull().$type<"response" | "completion">(),
  directedAt: timestamp("directed_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  approvalHoldMs: integer("approval_hold_ms").notNull().default(0),
  netDurationMs: integer("net_duration_ms"),
  targetMs: integer("target_ms").notNull(),
  breached: boolean("breached").notNull().default(false),
  breachNotifiedAt: timestamp("breach_notified_at", { withTimezone: true }),
  tier: text("tier").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSlaTierSchema = createInsertSchema(slaTiersTable).omit({ id: true, createdAt: true });
export const insertBotSlaOverrideSchema = createInsertSchema(botSlaOverridesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBotSlaEventSchema = createInsertSchema(botSlaEventsTable).omit({ id: true, createdAt: true });

export type SlaTier = typeof slaTiersTable.$inferSelect;
export type BotSlaOverride = typeof botSlaOverridesTable.$inferSelect;
export type BotSlaEvent = typeof botSlaEventsTable.$inferSelect;
export type InsertBotSlaEvent = z.infer<typeof insertBotSlaEventSchema>;
