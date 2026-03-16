import { pgTable, serial, text, timestamp, integer, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const knowledgeBaseDocumentsTable = pgTable("knowledge_base_documents", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sourceFilename: text("source_filename").notNull(),
  fileType: text("file_type").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kb_documents_client_id_idx").on(table.clientId),
]);

export const knowledgeBaseChunksTable = pgTable("knowledge_base_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => knowledgeBaseDocumentsTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  chunkText: text("chunk_text").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("kb_chunks_document_id_idx").on(table.documentId),
  index("kb_chunks_client_id_idx").on(table.clientId),
]);

export const insertKnowledgeBaseDocumentSchema = createInsertSchema(knowledgeBaseDocumentsTable).omit({ id: true, uploadedAt: true });
export const insertKnowledgeBaseChunkSchema = createInsertSchema(knowledgeBaseChunksTable).omit({ id: true, createdAt: true });

export type KnowledgeBaseDocument = typeof knowledgeBaseDocumentsTable.$inferSelect;
export type InsertKnowledgeBaseDocument = z.infer<typeof insertKnowledgeBaseDocumentSchema>;
export type KnowledgeBaseChunk = typeof knowledgeBaseChunksTable.$inferSelect;
export type InsertKnowledgeBaseChunk = z.infer<typeof insertKnowledgeBaseChunkSchema>;
