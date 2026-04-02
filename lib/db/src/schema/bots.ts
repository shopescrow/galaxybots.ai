import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  department: text("department").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  responsibilities: text("responsibilities").array().notNull().default([]),
  personality: text("personality").notNull(),
  avatar: text("avatar"),
  voiceId: text("voice_id"),
  declaration: text("declaration"),
  addonType: text("addon_type"),
  rank: text("rank").notNull().default("analyst"),
  isAvailable: boolean("is_available").notNull().default(true),
  isAiGenerated: boolean("is_ai_generated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({ id: true, createdAt: true });
export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof botsTable.$inferSelect;
