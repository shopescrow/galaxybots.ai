import { pgTable, serial, text, timestamp, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";

export const botAuditLogTable = pgTable("bot_audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  reasoning: text("reasoning").notNull(),
  confidence: real("confidence").notNull(),
  requiresReview: boolean("requires_review").notNull().default(false),
  clientId: integer("client_id"),
  botId: integer("bot_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BotAuditLog = typeof botAuditLogTable.$inferSelect;
