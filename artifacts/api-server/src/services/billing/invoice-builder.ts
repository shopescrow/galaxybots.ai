import {
  db,
  subscriptionPlansTable,
  accountSubscriptionsTable,
  accessorialAddonsTable,
  accessorialSubscriptionsTable,
  invoicesTable,
  invoiceLineItemsTable,
  type InsertInvoiceLineItem,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { aggregateUsageAttribution, type UsageAttribution } from "./usage-attribution.js";

const DEFAULT_TAX_RATE = parseFloat(process.env["INVOICE_TAX_RATE"] || "0");

export interface ComposedLineItem {
  lineType: string;
  description: string;
  botId?: number | null;
  botName?: string | null;
  model?: string | null;
  modelTier?: string | null;
  serviceRoute?: string | null;
  usageDay?: string | null;
  quantity: number;
  unitRate: number;
  amount: number;
  sortOrder: number;
}

export interface ComposedInvoice {
  clientId: number;
  subscriptionId: number | null;
  planId: number | null;
  planTier: string | null;
  status: "draft" | "finalized";
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  includedCredits: number;
  usedCredits: number;
  overageCredits: number;
  overageRatePerCredit: number;
  baseSubtotal: number;
  addonSubtotal: number;
  usageSubtotal: number;
  overageSubtotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  lineItems: ComposedLineItem[];
  attribution: UsageAttribution;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtMonthDay(iso: string): string {
  return iso.slice(0, 10);
}

interface ActiveSub {
  id: number;
  planId: number;
  planTier: string;
  monthlyPrice: string;
  includedCredits: number;
  overageRatePerCredit: string;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  creditBalance: number;
}

async function getActiveSubscription(clientId: number): Promise<ActiveSub | null> {
  const [sub] = await db
    .select({
      id: accountSubscriptionsTable.id,
      planId: accountSubscriptionsTable.planId,
      planTier: subscriptionPlansTable.tier,
      monthlyPrice: subscriptionPlansTable.monthlyPrice,
      includedCredits: subscriptionPlansTable.includedCredits,
      overageRatePerCredit: subscriptionPlansTable.overageRatePerCredit,
      billingCycleStart: accountSubscriptionsTable.billingCycleStart,
      billingCycleEnd: accountSubscriptionsTable.billingCycleEnd,
      creditBalance: accountSubscriptionsTable.creditBalance,
    })
    .from(accountSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(accountSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(and(eq(accountSubscriptionsTable.clientId, clientId), eq(accountSubscriptionsTable.status, "active")));
  return sub ?? null;
}

async function getActiveAddons(clientId: number) {
  return db
    .select({
      id: accessorialAddonsTable.id,
      key: accessorialAddonsTable.key,
      name: accessorialAddonsTable.name,
      monthlyPrice: accessorialAddonsTable.monthlyPrice,
    })
    .from(accessorialSubscriptionsTable)
    .innerJoin(accessorialAddonsTable, eq(accessorialSubscriptionsTable.addonId, accessorialAddonsTable.id))
    .where(and(eq(accessorialSubscriptionsTable.clientId, clientId), eq(accessorialSubscriptionsTable.status, "active")));
}

export async function generateInvoiceNumber(clientId: number, periodEnd: Date): Promise<string> {
  const ym = `${periodEnd.getUTCFullYear()}${String(periodEnd.getUTCMonth() + 1).padStart(2, "0")}`;
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoicesTable)
    .where(eq(invoicesTable.clientId, clientId));
  const seq = String(Number(count) + 1).padStart(4, "0");
  return `INV-${ym}-${clientId}-${seq}`;
}

/**
 * Composes (but does not persist) an invoice for the given client and period.
 * Pricing comes from the plan / add-ons; overage uses the plan's
 * overageRatePerCredit; tax uses the configurable INVOICE_TAX_RATE.
 */
export async function composeInvoice(
  clientId: number,
  opts?: { periodStart?: Date; periodEnd?: Date; taxRate?: number },
): Promise<ComposedInvoice> {
  const sub = await getActiveSubscription(clientId);
  if (!sub) {
    throw new Error("No active subscription found for this client");
  }

  const periodStart = opts?.periodStart ?? new Date(sub.billingCycleStart);
  const periodEnd = opts?.periodEnd ?? new Date(sub.billingCycleEnd);
  const taxRate = opts?.taxRate ?? DEFAULT_TAX_RATE;

  const [addons, attribution] = await Promise.all([
    getActiveAddons(clientId),
    aggregateUsageAttribution(clientId, periodStart, periodEnd),
  ]);

  const includedCredits = sub.includedCredits;
  const usedCredits = attribution.totals.totalCredits;
  const overageCredits = Math.max(0, usedCredits - includedCredits);
  const overageRate = parseFloat(sub.overageRatePerCredit);
  const basePrice = parseFloat(sub.monthlyPrice);

  const lineItems: ComposedLineItem[] = [];
  let sortOrder = 0;

  // Base subscription fee.
  lineItems.push({
    lineType: "base",
    description: `${sub.planTier.charAt(0).toUpperCase() + sub.planTier.slice(1)} plan — base subscription`,
    quantity: 1,
    unitRate: basePrice,
    amount: round2(basePrice),
    sortOrder: sortOrder++,
  });

  // Add-ons.
  let addonSubtotal = 0;
  for (const addon of addons) {
    const price = parseFloat(addon.monthlyPrice);
    addonSubtotal += price;
    lineItems.push({
      lineType: "addon",
      description: `Add-on — ${addon.name}`,
      quantity: 1,
      unitRate: price,
      amount: round2(price),
      sortOrder: sortOrder++,
    });
  }

  // Included credit allotment (informational).
  lineItems.push({
    lineType: "allotment",
    description: `Included credit allotment (${includedCredits.toLocaleString()} credits)`,
    quantity: includedCredits,
    unitRate: 0,
    amount: 0,
    sortOrder: sortOrder++,
  });

  // Metered usage summary (informational — covered by base up to the allotment).
  lineItems.push({
    lineType: "usage_summary",
    description: `Metered usage this period (${usedCredits.toLocaleString()} of ${includedCredits.toLocaleString()} included credits)`,
    quantity: usedCredits,
    unitRate: 0,
    amount: 0,
    sortOrder: sortOrder++,
  });

  // Usage attribution detail (informational, amount 0) — full drill-down stored
  // so finalized invoices render without recomputing live usage.
  for (const b of attribution.byBot) {
    lineItems.push({
      lineType: "usage_bot",
      description: `Usage — ${b.botName}`,
      botId: b.botId,
      botName: b.botName,
      quantity: b.credits,
      unitRate: 0,
      amount: 0,
      sortOrder: sortOrder++,
    });
  }
  for (const m of attribution.byModel) {
    lineItems.push({
      lineType: "usage_model",
      description: `Usage — ${m.model} (${m.modelTier})`,
      model: m.model,
      modelTier: m.modelTier,
      quantity: m.credits,
      unitRate: 0,
      amount: 0,
      sortOrder: sortOrder++,
    });
  }
  for (const r of attribution.byRoute) {
    lineItems.push({
      lineType: "usage_route",
      description: `Usage — ${r.route}`,
      serviceRoute: r.route,
      quantity: r.credits,
      unitRate: 0,
      amount: 0,
      sortOrder: sortOrder++,
    });
  }
  for (const d of attribution.byDay) {
    lineItems.push({
      lineType: "usage_day",
      description: `Usage — ${d.day}`,
      usageDay: d.day,
      quantity: d.credits,
      unitRate: 0,
      amount: 0,
      sortOrder: sortOrder++,
    });
  }

  // Itemized overage — billable, broken out by bot (its source).
  let overageSubtotal = 0;
  if (overageCredits > 0 && overageRate > 0) {
    if (usedCredits > 0 && attribution.byBot.length > 0) {
      let allocated = 0;
      attribution.byBot.forEach((b, idx) => {
        const isLast = idx === attribution.byBot.length - 1;
        const botOverage = isLast
          ? overageCredits - allocated
          : Math.round((b.credits / usedCredits) * overageCredits);
        allocated += botOverage;
        if (botOverage <= 0) return;
        const amount = round2(botOverage * overageRate);
        overageSubtotal += amount;
        lineItems.push({
          lineType: "overage",
          description: `Overage — ${b.botName} (${botOverage.toLocaleString()} credits over allotment)`,
          botId: b.botId,
          botName: b.botName,
          quantity: botOverage,
          unitRate: overageRate,
          amount,
          sortOrder: sortOrder++,
        });
      });
    } else {
      const amount = round2(overageCredits * overageRate);
      overageSubtotal += amount;
      lineItems.push({
        lineType: "overage",
        description: `Overage — ${overageCredits.toLocaleString()} credits over allotment`,
        quantity: overageCredits,
        unitRate: overageRate,
        amount,
        sortOrder: sortOrder++,
      });
    }
  }

  const baseSubtotal = round2(basePrice);
  addonSubtotal = round2(addonSubtotal);
  overageSubtotal = round2(overageSubtotal);
  const usageSubtotal = 0;
  const subtotal = round2(baseSubtotal + addonSubtotal + usageSubtotal + overageSubtotal);
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);

  return {
    clientId,
    subscriptionId: sub.id,
    planId: sub.planId,
    planTier: sub.planTier,
    status: "draft",
    invoiceNumber: null,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    includedCredits,
    usedCredits,
    overageCredits,
    overageRatePerCredit: overageRate,
    baseSubtotal,
    addonSubtotal,
    usageSubtotal,
    overageSubtotal,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: "USD",
    lineItems,
    attribution,
  };
}

/**
 * Finalizes an invoice for the given period: writes an immutable invoice row +
 * stored line items. Returns the persisted invoice id and number.
 */
export async function finalizeInvoice(
  clientId: number,
  opts?: { periodStart?: Date; periodEnd?: Date; taxRate?: number; dueInDays?: number },
): Promise<{ invoiceId: number; invoiceNumber: string; composed: ComposedInvoice }> {
  const composed = await composeInvoice(clientId, opts);
  const periodEnd = new Date(composed.periodEnd);
  const invoiceNumber = await generateInvoiceNumber(clientId, periodEnd);
  const now = new Date();
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + (opts?.dueInDays ?? 14));

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      clientId,
      subscriptionId: composed.subscriptionId,
      planId: composed.planId,
      invoiceNumber,
      status: "finalized",
      periodStart: new Date(composed.periodStart),
      periodEnd,
      planTier: composed.planTier,
      includedCredits: composed.includedCredits,
      usedCredits: composed.usedCredits,
      overageCredits: composed.overageCredits,
      overageRatePerCredit: String(composed.overageRatePerCredit),
      baseSubtotal: String(composed.baseSubtotal),
      addonSubtotal: String(composed.addonSubtotal),
      usageSubtotal: String(composed.usageSubtotal),
      overageSubtotal: String(composed.overageSubtotal),
      subtotal: String(composed.subtotal),
      taxRate: String(composed.taxRate),
      taxAmount: String(composed.taxAmount),
      total: String(composed.total),
      currency: composed.currency,
      issuedAt: now,
      dueAt,
    })
    .returning({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber });

  if (!invoice) throw new Error("Failed to persist invoice");

  const rows: InsertInvoiceLineItem[] = composed.lineItems.map((li) => ({
    invoiceId: invoice.id,
    lineType: li.lineType,
    description: li.description,
    botId: li.botId ?? null,
    botName: li.botName ?? null,
    model: li.model ?? null,
    modelTier: li.modelTier ?? null,
    serviceRoute: li.serviceRoute ?? null,
    usageDay: li.usageDay ?? null,
    quantity: String(li.quantity),
    unitRate: String(li.unitRate),
    amount: String(li.amount),
    sortOrder: li.sortOrder,
  }));
  if (rows.length > 0) {
    await db.insert(invoiceLineItemsTable).values(rows);
  }

  // Fire-and-forget invoice email — errors are logged but never surface to the caller.
  import("./billing-emails.js").then(({ sendInvoiceEmail }) => {
    sendInvoiceEmail(invoice.id).catch((err) => {
      console.error(`[invoice-builder] Failed to send invoice email for #${invoice.id}:`, err);
    });
  }).catch(() => {});

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, composed };
}

export { fmtMonthDay };
