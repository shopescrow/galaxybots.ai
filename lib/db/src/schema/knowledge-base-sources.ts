import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const knowledgeBaseSourcesTable = pgTable("knowledge_base_sources", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default({}),
  syncSchedule: text("sync_schedule").notNull().default("daily"),
  status: text("status").notNull().default("pending"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  documentCount: integer("document_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kb_sources_client_id_idx").on(table.clientId),
  index("kb_sources_source_type_idx").on(table.sourceType),
]);

export const kbSourceDocumentsTable = pgTable("kb_source_documents", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().references(() => knowledgeBaseSourcesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  externalId: text("external_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash"),
  sourceUrl: text("source_url"),
  lastModified: timestamp("last_modified", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kb_src_docs_source_id_idx").on(table.sourceId),
  index("kb_src_docs_client_id_idx").on(table.clientId),
  index("kb_src_docs_external_id_idx").on(table.externalId),
]);

export const kbSourceChunksTable = pgTable("kb_source_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => kbSourceDocumentsTable.id, { onDelete: "cascade" }),
  sourceId: integer("source_id").notNull().references(() => knowledgeBaseSourcesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  embedding: jsonb("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kb_src_chunks_document_id_idx").on(table.documentId),
  index("kb_src_chunks_source_id_idx").on(table.sourceId),
  index("kb_src_chunks_client_id_idx").on(table.clientId),
]);

export const insertKnowledgeBaseSourceSchema = createInsertSchema(knowledgeBaseSourcesTable).omit({ id: true, createdAt: true, updatedAt: true, lastSyncAt: true, lastSyncStatus: true, lastSyncError: true, documentCount: true });
export const insertKbSourceDocumentSchema = createInsertSchema(kbSourceDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKbSourceChunkSchema = createInsertSchema(kbSourceChunksTable).omit({ id: true, createdAt: true });

export type KnowledgeBaseSource = typeof knowledgeBaseSourcesTable.$inferSelect;
export type InsertKnowledgeBaseSource = z.infer<typeof insertKnowledgeBaseSourceSchema>;
export type KbSourceDocument = typeof kbSourceDocumentsTable.$inferSelect;
export type InsertKbSourceDocument = z.infer<typeof insertKbSourceDocumentSchema>;
export type KbSourceChunk = typeof kbSourceChunksTable.$inferSelect;
export type InsertKbSourceChunk = z.infer<typeof insertKbSourceChunkSchema>;
