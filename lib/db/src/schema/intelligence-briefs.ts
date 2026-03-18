import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const intelligenceBriefsTable = pgTable("intelligence_briefs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  briefType: text("brief_type", { enum: ["morning", "weekly"] }).notNull().default("morning"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  deliveryChannels: jsonb("delivery_channels").$type<{ email: boolean; slack: boolean }>().notNull().default({ email: false, slack: false }),
  deliveredAt: jsonb("delivered_at").$type<{ email?: string; slack?: string }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("intelligence_briefs_client_generated_idx").on(table.clientId, table.generatedAt),
  index("intelligence_briefs_client_type_idx").on(table.clientId, table.briefType),
]);

export const briefingSettingsTable = pgTable("briefing_settings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  emailEnabled: integer("email_enabled").notNull().default(0),
  emailRecipients: text("email_recipients").array(),
  slackEnabled: integer("slack_enabled").notNull().default(0),
  slackChannel: text("slack_channel").default("galaxybots-brief"),
  deliveryHour: integer("delivery_hour").notNull().default(7),
  deliveryMinute: integer("delivery_minute").notNull().default(30),
  timezone: text("timezone").notNull().default("America/Toronto"),
  lastMorningBriefAt: timestamp("last_morning_brief_at", { withTimezone: true }),
  lastWeeklyBriefAt: timestamp("last_weekly_brief_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IntelligenceBrief = typeof intelligenceBriefsTable.$inferSelect;
export type InsertIntelligenceBrief = typeof intelligenceBriefsTable.$inferInsert;
export type BriefingSettings = typeof briefingSettingsTable.$inferSelect;
export type InsertBriefingSettings = typeof briefingSettingsTable.$inferInsert;
