import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { taskSessionsTable } from "./task-sessions";

export const worldStateTable = pgTable("world_state", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => taskSessionsTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorldStateSchema = createInsertSchema(worldStateTable).omit({ id: true, createdAt: true, updatedAt: true });
export type WorldState = typeof worldStateTable.$inferSelect;
export type InsertWorldState = z.infer<typeof insertWorldStateSchema>;
