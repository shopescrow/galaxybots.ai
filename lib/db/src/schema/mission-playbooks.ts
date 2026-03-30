import { pgTable, serial, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const missionPlaybooksTable = pgTable("mission_playbooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  steps: jsonb("steps").notNull().default([]),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMissionPlaybookSchema = createInsertSchema(missionPlaybooksTable).omit({ id: true, createdAt: true });
export type MissionPlaybook = typeof missionPlaybooksTable.$inferSelect;
export type InsertMissionPlaybook = z.infer<typeof insertMissionPlaybookSchema>;
