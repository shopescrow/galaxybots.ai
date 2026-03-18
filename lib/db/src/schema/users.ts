import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export interface OnboardingState {
  companyProfile: boolean;
  firstClient: boolean;
  industry: boolean;
  integrations: boolean;
  firstMission: boolean;
  dismissed: boolean;
  completedAt: string | null;
  companyProfileStartedAt?: string | null;
  firstClientStartedAt?: string | null;
  industryStartedAt?: string | null;
  integrationsStartedAt?: string | null;
  firstMissionStartedAt?: string | null;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  companyProfile: false,
  firstClient: false,
  industry: false,
  integrations: false,
  firstMission: false,
  dismissed: false,
  completedAt: null,
};

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"),
  displayName: text("display_name"),
  bypassPayment: boolean("bypass_payment").notNull().default(false),
  onboarding: jsonb("onboarding").$type<OnboardingState>().default(DEFAULT_ONBOARDING),
  ssoProvider: text("sso_provider"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
