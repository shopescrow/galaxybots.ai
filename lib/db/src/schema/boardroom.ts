import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const boardroomMessagesTable = pgTable("boardroom_messages", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id"),
  botName: text("bot_name"),
  botTitle: text("bot_title"),
  role: text("role").notNull().default("bot"),
  contentEncoded: text("content_encoded").notNull(),
  contentEnglish: text("content_english").notNull(),
  topic: text("topic"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("boardroom_messages_client_id_idx").on(table.clientId),
]);

export const insertBoardroomMessageSchema = createInsertSchema(boardroomMessagesTable).omit({
  id: true,
  createdAt: true,
});

export type BoardroomMessage = typeof boardroomMessagesTable.$inferSelect;
export type InsertBoardroomMessage = z.infer<typeof insertBoardroomMessageSchema>;
