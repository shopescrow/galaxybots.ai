import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const clientIntegrationsTable = pgTable("client_integrations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  service: text("service").notNull(),
  credential: text("credential").notNull(),
  status: text("status").notNull().default("connected"),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertClientIntegrationSchema = createInsertSchema(clientIntegrationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ClientIntegration = typeof clientIntegrationsTable.$inferSelect;
export type InsertClientIntegration = z.infer<typeof insertClientIntegrationSchema>;
