import { pgTable, serial, text, timestamp, integer, real, vector, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

/**
 * Semantic cache for conductor agent + summary outputs.
 *
 * Near-duplicate sub-queries (within and across sessions) are deduped by
 * embedding similarity, returning a cached completion instead of re-calling
 * the model. Entries are strictly isolated per client (client_id, with NULL
 * reserved for global/anonymous flows) and expire via expires_at (TTL).
 */
export const semanticCacheTable = pgTable("semantic_cache", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  // "agent" (sub-task / perspective output) or "summary" (synthesis / final answer)
  cacheKind: text("cache_kind").notNull(),
  taskCategory: text("task_category"),
  queryText: text("query_text").notNull(),
  responseText: text("response_text").notNull(),
  model: text("model"),
  embedding: vector("embedding", { dimensions: 1536 }),
  hitCount: integer("hit_count").notNull().default(0),
  savedCostUsd: real("saved_cost_usd").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("semantic_cache_client_kind_idx").on(table.clientId, table.cacheKind),
  index("semantic_cache_expires_idx").on(table.expiresAt),
]);

export const insertSemanticCacheSchema = createInsertSchema(semanticCacheTable).omit({
  id: true,
  createdAt: true,
});

export type SemanticCacheEntry = typeof semanticCacheTable.$inferSelect;
export type InsertSemanticCacheEntry = z.infer<typeof insertSemanticCacheSchema>;
