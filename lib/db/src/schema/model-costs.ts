import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modelCostsTable = pgTable("model_costs", {
  id: serial("id").primaryKey(),
  model: text("model").notNull().unique(),
  inputCostPerToken: numeric("input_cost_per_token").notNull(),
  outputCostPerToken: numeric("output_cost_per_token").notNull(),
  contextWindow: numeric("context_window").notNull().default("128000"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModelCostSchema = createInsertSchema(modelCostsTable).omit({
  id: true,
  updatedAt: true,
});

export type ModelCost = typeof modelCostsTable.$inferSelect;
export type InsertModelCost = z.infer<typeof insertModelCostSchema>;
