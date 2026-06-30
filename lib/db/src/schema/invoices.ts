import { pgTable, serial, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id").notNull(),
    subscriptionId: integer("subscription_id"),
    planId: integer("plan_id"),
    invoiceNumber: text("invoice_number").notNull().unique(),
    status: text("status").notNull().default("draft"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    planTier: text("plan_tier"),
    includedCredits: integer("included_credits").notNull().default(0),
    usedCredits: integer("used_credits").notNull().default(0),
    overageCredits: integer("overage_credits").notNull().default(0),
    overageRatePerCredit: numeric("overage_rate_per_credit", { precision: 10, scale: 4 }).notNull().default("0"),
    baseSubtotal: numeric("base_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    addonSubtotal: numeric("addon_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    usageSubtotal: numeric("usage_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    overageSubtotal: numeric("overage_subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    pdfReference: text("pdf_reference"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    dunningStep: integer("dunning_step").notNull().default(0),
    nextDunningAt: timestamp("next_dunning_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invoices_client_idx").on(table.clientId),
    index("invoices_status_idx").on(table.status),
  ],
);

export const invoiceLineItemsTable = pgTable(
  "invoice_line_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull(),
    lineType: text("line_type").notNull(),
    description: text("description").notNull(),
    botId: integer("bot_id"),
    botName: text("bot_name"),
    model: text("model"),
    modelTier: text("model_tier"),
    serviceRoute: text("service_route"),
    usageDay: text("usage_day"),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("0"),
    unitRate: numeric("unit_rate", { precision: 12, scale: 6 }).notNull().default("0"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("invoice_line_items_invoice_idx").on(table.invoiceId)],
);

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItemsTable).omit({
  id: true,
  createdAt: true,
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type InvoiceLineItem = typeof invoiceLineItemsTable.$inferSelect;
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;
