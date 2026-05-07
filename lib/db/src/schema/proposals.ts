import { pgTable, serial, text, timestamp, integer, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export interface ProposalSection {
  id: string;
  title: string;
  content: string;
  order: number;
  speakerNotes?: string;
}

export const proposalsTable = pgTable("proposals", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  prospectName: text("prospect_name").notNull(),
  prospectIndustry: text("prospect_industry"),
  type: text("type").notNull().default("proposal"),
  status: text("status").notNull().default("draft"),
  sections: jsonb("sections").$type<ProposalSection[]>().default([]),
  prospectDetails: jsonb("prospect_details").$type<Record<string, unknown>>().default({}),
  shareToken: text("share_token").unique(),
  value: numeric("value"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProposalSchema = createInsertSchema(proposalsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Proposal = typeof proposalsTable.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
