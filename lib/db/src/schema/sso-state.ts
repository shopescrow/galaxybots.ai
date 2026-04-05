import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const ssoStateTable = pgTable("sso_state", {
  id: serial("id").primaryKey(),
  stateKey: text("state_key").notNull().unique(),
  stateData: jsonb("state_data").notNull(),
  stateType: text("state_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type SsoState = typeof ssoStateTable.$inferSelect;
