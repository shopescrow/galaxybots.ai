import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userPreferencesTable = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").notNull().default("purple"),
  fontSize: text("font_size").notNull().default("md"),
  showBillingWidget: boolean("show_billing_widget").notNull().default(false),
  notifyApprovals: boolean("notify_approvals").notNull().default(true),
  notifyBotActions: boolean("notify_bot_actions").notNull().default(true),
  notifyCostAlerts: boolean("notify_cost_alerts").notNull().default(true),
  notifyScheduler: boolean("notify_scheduler").notNull().default(true),
  notifySystem: boolean("notify_system").notNull().default(true),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
