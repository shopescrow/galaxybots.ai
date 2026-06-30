import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

/**
 * Per-tenant monthly token quota and degradation policy.
 *
 * monthlyTokenCap = 0 means unlimited (no quota enforcement).
 * softLimitPct    = degrade to EFFICIENT tier at this % of cap (default 80).
 * degradationPolicy:
 *   "downgrade" — switch to cheaper model tier (default; never blocks users).
 *   "shed"      — same as downgrade; explicitly signals "shed expensive models".
 *   "reject"    — hard 429 when quota exhausted.
 */
export const clientTokenQuotasTable = pgTable("client_token_quotas", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" })
    .unique(),
  monthlyTokenCap: integer("monthly_token_cap").notNull().default(0),
  softLimitPct: integer("soft_limit_pct").notNull().default(80),
  degradationPolicy: text("degradation_policy").notNull().default("downgrade"),
  alertAt80Pct: boolean("alert_at_80_pct").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClientTokenQuotaSchema = createInsertSchema(clientTokenQuotasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ClientTokenQuota = typeof clientTokenQuotasTable.$inferSelect;
export type InsertClientTokenQuota = z.infer<typeof insertClientTokenQuotaSchema>;
