import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const llmUsageLogTable = pgTable("llm_usage_log", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id"),
  botId: integer("bot_id"),
  sessionId: integer("session_id"),
  conversationId: integer("conversation_id"),
  model: text("model").notNull(),
  modelTier: text("model_tier"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  estimatedCostUsd: numeric("estimated_cost_usd").notNull().default("0"),
  latencyMs: integer("latency_ms").notNull().default(0),
  calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLlmUsageLogSchema = createInsertSchema(llmUsageLogTable).omit({
  id: true,
  calledAt: true,
});

export type LlmUsageLog = typeof llmUsageLogTable.$inferSelect;
export type InsertLlmUsageLog = z.infer<typeof insertLlmUsageLogSchema>;
