import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const ollamaConfigTable = pgTable("ollama_config", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  model: text("model").notNull().default("llama3.2:3b"),
  host: text("host").notNull().default("localhost:11434"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OllamaConfig = typeof ollamaConfigTable.$inferSelect;
export type InsertOllamaConfig = typeof ollamaConfigTable.$inferInsert;
