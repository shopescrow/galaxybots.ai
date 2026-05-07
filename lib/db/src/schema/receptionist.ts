import { pgTable, serial, text, timestamp, integer, boolean, jsonb, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const crmTypeEnum = pgEnum("crm_type", ["hubspot", "salesforce", "custom_webhook", "none"]);

export const receptionistConfigsTable = pgTable("receptionist_configs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }).unique(),
  elevenlabsAgentId: text("elevenlabs_agent_id"),
  twilioPhoneNumber: text("twilio_phone_number"),
  businessName: text("business_name"),
  businessHoursJson: jsonb("business_hours_json"),
  knowledgeBasePrompt: text("knowledge_base_prompt"),
  notificationEmail: text("notification_email"),
  crmType: crmTypeEnum("crm_type").notNull().default("none"),
  crmWebhookUrl: text("crm_webhook_url"),
  crmFieldMapJson: jsonb("crm_field_map_json"),
  isActive: boolean("is_active").notNull().default(true),
  improvementCallCount: integer("improvement_call_count").notNull().default(0),
  lastImprovedAt: timestamp("last_improved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const callLogsTable = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => receptionistConfigsTable.id, { onDelete: "cascade" }),
  twilioCallSid: text("twilio_call_sid").unique(),
  twilioRecordingUrl: text("twilio_recording_url"),
  direction: text("direction").notNull().default("inbound"),
  fromNumber: text("from_number"),
  toNumber: text("to_number"),
  status: text("status").notNull().default("initiated"),
  durationSeconds: integer("duration_seconds"),
  transcriptText: text("transcript_text"),
  transcriptSummary: text("transcript_summary"),
  crmSynced: boolean("crm_synced").notNull().default(false),
  crmSyncError: text("crm_sync_error"),
  emailSent: boolean("email_sent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("call_logs_config_id_idx").on(table.configId),
  index("call_logs_created_at_idx").on(table.createdAt),
]);

export const callImprovementRunsTable = pgTable("call_improvement_runs", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").notNull().references(() => receptionistConfigsTable.id, { onDelete: "cascade" }),
  callsAnalyzed: integer("calls_analyzed").notNull(),
  oldPromptSnapshot: text("old_prompt_snapshot"),
  newPrompt: text("new_prompt"),
  improvementNotes: text("improvement_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReceptionistConfigSchema = createInsertSchema(receptionistConfigsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallLogSchema = createInsertSchema(callLogsTable).omit({ id: true, createdAt: true });
export const insertCallImprovementRunSchema = createInsertSchema(callImprovementRunsTable).omit({ id: true, createdAt: true });

export type ReceptionistConfig = typeof receptionistConfigsTable.$inferSelect;
export type InsertReceptionistConfig = z.infer<typeof insertReceptionistConfigSchema>;
export type CallLog = typeof callLogsTable.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallImprovementRun = typeof callImprovementRunsTable.$inferSelect;
export type InsertCallImprovementRun = z.infer<typeof insertCallImprovementRunSchema>;
