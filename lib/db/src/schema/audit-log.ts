import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { usersTable } from "./users";

export const platformAuditLogTable = pgTable("platform_audit_log", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformAuditLogSchema = createInsertSchema(platformAuditLogTable).omit({
  id: true,
  createdAt: true,
});

export type PlatformAuditLog = typeof platformAuditLogTable.$inferSelect;
export type InsertPlatformAuditLog = z.infer<typeof insertPlatformAuditLogSchema>;
