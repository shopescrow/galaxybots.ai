import { pgTable, serial, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const missionTemplatesTable = pgTable("mission_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  estimatedDuration: text("estimated_duration"),
  recommendedBots: jsonb("recommended_bots").notNull().default([]),
  objectiveTemplate: text("objective_template").notNull(),
  successCriteria: text("success_criteria"),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  createdBy: text("created_by"),
  clientId: integer("client_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMissionTemplateSchema = createInsertSchema(missionTemplatesTable).omit({
  id: true,
  createdAt: true,
});

export type MissionTemplate = typeof missionTemplatesTable.$inferSelect;
export type InsertMissionTemplate = z.infer<typeof insertMissionTemplateSchema>;
