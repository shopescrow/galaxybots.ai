import { pgTable, serial, text, timestamp, integer, boolean, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { botsTable } from "./bots";

export const botToolPermissionsTable = pgTable("bot_tool_permissions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "cascade" }).notNull(),
  toolName: text("tool_name").notNull(),
  allowed: boolean("allowed").notNull().default(true),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("bot_tool_perm_unique").on(table.clientId, table.botId, table.toolName),
]);

export const insertBotToolPermissionSchema = createInsertSchema(botToolPermissionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BotToolPermission = typeof botToolPermissionsTable.$inferSelect;
export type InsertBotToolPermission = z.infer<typeof insertBotToolPermissionSchema>;

export const pendingApprovalsTable = pgTable("pending_approvals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "cascade" }).notNull(),
  botName: text("bot_name"),
  toolName: text("tool_name").notNull(),
  toolInput: jsonb("tool_input"),
  status: text("status").notNull().default("pending"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  toolResult: jsonb("tool_result"),
  pausedLoopContext: jsonb("paused_loop_context"),
  sessionId: integer("session_id"),
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPendingApprovalSchema = createInsertSchema(pendingApprovalsTable).omit({
  id: true,
  createdAt: true,
});
export type PendingApproval = typeof pendingApprovalsTable.$inferSelect;
export type InsertPendingApproval = z.infer<typeof insertPendingApprovalSchema>;

export const brandVoiceConfigsTable = pgTable("brand_voice_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  toneDescription: text("tone_description"),
  prohibitedPhrases: text("prohibited_phrases").array().notNull().default([]),
  requiredDisclaimers: text("required_disclaimers").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("brand_voice_client_unique").on(table.clientId),
]);

export const insertBrandVoiceConfigSchema = createInsertSchema(brandVoiceConfigsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type BrandVoiceConfig = typeof brandVoiceConfigsTable.$inferSelect;
export type InsertBrandVoiceConfig = z.infer<typeof insertBrandVoiceConfigSchema>;

export const permissionProfileTemplatesTable = pgTable("permission_profile_templates", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPermissionProfileTemplateSchema = createInsertSchema(permissionProfileTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PermissionProfileTemplate = typeof permissionProfileTemplatesTable.$inferSelect;
export type InsertPermissionProfileTemplate = z.infer<typeof insertPermissionProfileTemplateSchema>;
