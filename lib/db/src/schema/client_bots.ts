import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientBotsTable = pgTable("client_bots", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  botId: integer("bot_id").notNull(),
  status: text("status").notNull().default("active"),
  hiredAt: timestamp("hired_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertClientBotSchema = createInsertSchema(clientBotsTable).omit({
  id: true,
  hiredAt: true,
});

export type ClientBot = typeof clientBotsTable.$inferSelect;
export type InsertClientBot = z.infer<typeof insertClientBotSchema>;
