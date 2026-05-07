import { pgTable, serial, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const callDebriefsTable = pgTable("call_debriefs", {
  id: serial("id").primaryKey(),
  callLogId: integer("call_log_id").notNull().unique(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  callerName: text("caller_name"),
  callerIntent: text("caller_intent"),
  keyConcerns: text("key_concerns"),
  urgencyScore: integer("urgency_score"),
  recommendedAction: text("recommended_action"),
  followUpMessage: text("follow_up_message"),
  isNewProspect: integer("is_new_prospect").notNull().default(0),
  pipelineTriggered: integer("pipeline_triggered").notNull().default(0),
  rawDebrief: jsonb("raw_debrief"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("call_debriefs_client_id_idx").on(table.clientId),
  index("call_debriefs_call_log_id_idx").on(table.callLogId),
]);

export const voiceScriptsTable = pgTable("voice_scripts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  scriptType: text("script_type").notNull().default("outbound"),
  title: text("title").notNull(),
  objective: text("objective"),
  targetPersona: text("target_persona"),
  desiredOutcome: text("desired_outcome"),
  scriptContent: text("script_content").notNull(),
  generatedBy: text("generated_by"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("voice_scripts_client_id_idx").on(table.clientId),
]);

export const meetingRecordingsTable = pgTable("meeting_recordings", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  durationSeconds: integer("duration_seconds"),
  transcriptText: text("transcript_text"),
  summary: jsonb("summary"),
  status: text("status").notNull().default("pending"),
  originalFilename: text("original_filename"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("meeting_recordings_client_id_idx").on(table.clientId),
]);

export const insertCallDebriefSchema = createInsertSchema(callDebriefsTable).omit({ id: true, createdAt: true });
export const insertVoiceScriptSchema = createInsertSchema(voiceScriptsTable).omit({ id: true, createdAt: true });
export const insertMeetingRecordingSchema = createInsertSchema(meetingRecordingsTable).omit({ id: true, createdAt: true });

export type CallDebrief = typeof callDebriefsTable.$inferSelect;
export type InsertCallDebrief = z.infer<typeof insertCallDebriefSchema>;
export type VoiceScript = typeof voiceScriptsTable.$inferSelect;
export type InsertVoiceScript = z.infer<typeof insertVoiceScriptSchema>;
export type MeetingRecording = typeof meetingRecordingsTable.$inferSelect;
export type InsertMeetingRecording = z.infer<typeof insertMeetingRecordingSchema>;
