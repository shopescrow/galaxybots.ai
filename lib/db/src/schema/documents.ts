import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export interface DocumentVersion {
  version: number;
  content: unknown;
  title: string;
  editedBy: string;
  createdAt: string;
}

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  sessionId: integer("session_id"),
  title: text("title").notNull(),
  content: jsonb("content").$type<unknown>().notNull(),
  department: text("department"),
  status: text("status").notNull().default("draft"),
  versionHistory: jsonb("version_history").$type<DocumentVersion[]>().default([]),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Document = typeof documentsTable.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
