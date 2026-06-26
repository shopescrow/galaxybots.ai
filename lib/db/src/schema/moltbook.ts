import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { botsTable } from "./bots";

export const moltbookAccountsTable = pgTable("moltbook_accounts", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  agentName: text("agent_name").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  claimUrl: text("claim_url"),
  verificationCode: text("verification_code"),
  status: text("status", { enum: ["pending", "active", "disabled"] }).notNull().default("pending"),
  autonomousMode: boolean("autonomous_mode").notNull().default(false),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("moltbook_accounts_bot_id_idx").on(table.botId),
  index("moltbook_accounts_status_idx").on(table.status),
]);

export const moltbookApprovalQueueTable = pgTable("moltbook_approval_queue", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => moltbookAccountsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
  actionType: text("action_type", { enum: ["post", "comment"] }).notNull(),
  targetSubmolt: text("target_submolt"),
  targetThread: text("target_thread"),
  body: text("body").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected", "sent"] }).notNull().default("pending"),
  decidedBy: text("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (table) => [
  index("moltbook_approval_queue_account_id_idx").on(table.accountId),
  index("moltbook_approval_queue_status_idx").on(table.status),
]);

export const insertMoltbookAccountSchema = createInsertSchema(moltbookAccountsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMoltbookApprovalSchema = createInsertSchema(moltbookApprovalQueueTable).omit({
  id: true,
  createdAt: true,
  decidedAt: true,
});

export type MoltbookAccount = typeof moltbookAccountsTable.$inferSelect;
export type InsertMoltbookAccount = z.infer<typeof insertMoltbookAccountSchema>;
export type MoltbookApproval = typeof moltbookApprovalQueueTable.$inferSelect;
export type InsertMoltbookApproval = z.infer<typeof insertMoltbookApprovalSchema>;
