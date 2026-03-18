import { pgTable, serial, varchar, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const prospectingPatternsTable = pgTable("prospecting_patterns", {
  id: serial("id").primaryKey(),
  patternType: varchar("pattern_type", { length: 50 }).notNull(), // e.g., 'email', 'phone', 'extraction'
  domainRegex: varchar("domain_regex", { length: 255 }).notNull(),
  hintText: varchar("hint_text", { length: 1000 }).notNull(),
  timesApplied: integer("times_applied").notNull().default(0),
  successAfterHint: integer("success_after_hint").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProspectingPatternSchema = createInsertSchema(prospectingPatternsTable);
export const selectProspectingPatternSchema = createSelectSchema(prospectingPatternsTable);

export type ProspectingPattern = typeof prospectingPatternsTable.$inferSelect;
export type InsertProspectingPattern = typeof prospectingPatternsTable.$inferInsert;
