import { pgTable, serial, text, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const clientCostCapsTable = pgTable("client_cost_caps", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }).unique(),
  monthlyCapUsd: numeric("monthly_cap_usd").notNull().default("0"),
  alertAt80Pct: boolean("alert_at_80_pct").notNull().default(true),
  pauseAutonomousOnExhaust: boolean("pause_autonomous_on_exhaust").notNull().default(false),
  alerted80Pct: boolean("alerted_80_pct").notNull().default(false),
  alerted100Pct: boolean("alerted_100_pct").notNull().default(false),
  alertResetMonth: text("alert_reset_month"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsApiKeysTable = pgTable("analytics_api_keys", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull().unique(),
  label: text("label").notNull().default("default"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientCostCapSchema = createInsertSchema(clientCostCapsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnalyticsApiKeySchema = createInsertSchema(analyticsApiKeysTable).omit({
  id: true,
  createdAt: true,
});

export type ClientCostCap = typeof clientCostCapsTable.$inferSelect;
export type InsertClientCostCap = z.infer<typeof insertClientCostCapSchema>;
export type AnalyticsApiKey = typeof analyticsApiKeysTable.$inferSelect;
export type InsertAnalyticsApiKey = z.infer<typeof insertAnalyticsApiKeySchema>;
