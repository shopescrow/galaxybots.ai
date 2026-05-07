import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { clientsTable } from "./clients";
import { taskSessionsTable } from "./task-sessions";

export const guestSessionsTable = pgTable("guest_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  ipHash: text("ip_hash").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  taskSessionId: integer("task_session_id").references(() => taskSessionsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"),
  claimedByUserId: integer("claimed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  missionCompleted: boolean("mission_completed").notNull().default(false),
  roiData: text("roi_data"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGuestSessionSchema = createInsertSchema(guestSessionsTable).omit({
  id: true,
  createdAt: true,
});

export type GuestSession = typeof guestSessionsTable.$inferSelect;
export type InsertGuestSession = z.infer<typeof insertGuestSessionSchema>;
