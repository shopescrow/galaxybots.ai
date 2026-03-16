import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const aeoRecommendationCacheTable = pgTable("aeo_recommendation_cache", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  cacheType: text("cache_type").notNull(),
  resultJson: jsonb("result_json").notNull(),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("aeo_recommendation_cache_url_type_idx").on(table.url, table.cacheType),
  index("aeo_recommendation_cache_cached_at_idx").on(table.cachedAt),
]);

export type AeoRecommendationCache = typeof aeoRecommendationCacheTable.$inferSelect;
