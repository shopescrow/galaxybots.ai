import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";
import { clientsTable } from "./clients";

export const botHandoffRequestsTable = pgTable(
  "bot_handoff_requests",
  {
    id: serial("id").primaryKey(),
    sourceBotId: integer("source_bot_id")
      .notNull()
      .references(() => botsTable.id, { onDelete: "cascade" }),
    targetBotId: integer("target_bot_id").references(() => botsTable.id, {
      onDelete: "set null",
    }),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "cascade",
    }),
    sessionId: integer("session_id"),
    assignmentId: integer("assignment_id"),
    reason: text("reason").notNull(),
    terminationReason: text("termination_reason").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().default({}),
    recommendedRecipientName: text("recommended_recipient_name"),
    status: text("status").notNull().default("pending"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resultingAssignmentId: integer("resulting_assignment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bot_handoff_requests_source_bot_id_idx").on(table.sourceBotId),
    index("bot_handoff_requests_target_bot_id_idx").on(table.targetBotId),
    index("bot_handoff_requests_client_id_idx").on(table.clientId),
    index("bot_handoff_requests_status_idx").on(table.status),
  ],
);

export const insertBotHandoffRequestSchema = createInsertSchema(
  botHandoffRequestsTable,
).omit({ id: true, createdAt: true });

export type BotHandoffRequest = typeof botHandoffRequestsTable.$inferSelect;
export type InsertBotHandoffRequest = z.infer<
  typeof insertBotHandoffRequestSchema
>;
