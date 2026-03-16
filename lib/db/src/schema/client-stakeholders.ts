import { pgTable, serial, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const clientStakeholdersTable = pgTable("client_stakeholders", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  lastPin: text("last_pin"),
  pinExpiry: timestamp("pin_expiry", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("client_stakeholder_email_unique").on(table.clientId, table.email),
]);

export const insertClientStakeholderSchema = createInsertSchema(clientStakeholdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastPin: true,
  pinExpiry: true,
});

export type ClientStakeholder = typeof clientStakeholdersTable.$inferSelect;
export type InsertClientStakeholder = z.infer<typeof insertClientStakeholderSchema>;
