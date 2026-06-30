import type { Invoice, InvoiceLineItem } from "@workspace/db";
import type { ComposedInvoice } from "./invoice-builder.js";

export function storedToComposed(invoice: Invoice, lineItems: InvoiceLineItem[]): ComposedInvoice {
  const byBot = lineItems
    .filter((li) => li.lineType === "usage_bot")
    .map((li) => ({ botId: li.botId, botName: li.botName ?? "Platform / Unattributed", credits: Number(li.quantity), llmCalls: 0, llmCostUsd: 0 }));
  const byModel = lineItems
    .filter((li) => li.lineType === "usage_model")
    .map((li) => ({ model: li.model ?? "unknown", modelTier: li.modelTier ?? "frontier", credits: Number(li.quantity), events: 0, llmCostUsd: 0 }));
  const byRoute = lineItems
    .filter((li) => li.lineType === "usage_route")
    .map((li) => ({ route: li.serviceRoute ?? "unknown", credits: Number(li.quantity), events: 0 }));
  const byDay = lineItems
    .filter((li) => li.lineType === "usage_day")
    .map((li) => ({ day: li.usageDay ?? "", credits: Number(li.quantity), events: 0 }));

  const attribution: ComposedInvoice["attribution"] = {
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    totals: { totalCredits: invoice.usedCredits, totalEvents: 0, llmCalls: 0, llmCostUsd: 0, toolCalls: 0 },
    byBot,
    byModel,
    byTier: [],
    byRoute,
    byDay,
    toolActivity: [],
  };

  return {
    clientId: invoice.clientId,
    subscriptionId: invoice.subscriptionId,
    planId: invoice.planId,
    planTier: invoice.planTier,
    status: invoice.status === "finalized" || invoice.status === "draft" ? invoice.status : "finalized",
    invoiceNumber: invoice.invoiceNumber,
    periodStart: invoice.periodStart.toISOString(),
    periodEnd: invoice.periodEnd.toISOString(),
    includedCredits: invoice.includedCredits,
    usedCredits: invoice.usedCredits,
    overageCredits: invoice.overageCredits,
    overageRatePerCredit: parseFloat(invoice.overageRatePerCredit),
    baseSubtotal: parseFloat(invoice.baseSubtotal),
    addonSubtotal: parseFloat(invoice.addonSubtotal),
    usageSubtotal: parseFloat(invoice.usageSubtotal),
    overageSubtotal: parseFloat(invoice.overageSubtotal),
    subtotal: parseFloat(invoice.subtotal),
    taxRate: parseFloat(invoice.taxRate),
    taxAmount: parseFloat(invoice.taxAmount),
    total: parseFloat(invoice.total),
    currency: invoice.currency,
    lineItems: lineItems
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((li) => ({
        lineType: li.lineType,
        description: li.description,
        botId: li.botId,
        botName: li.botName,
        model: li.model,
        modelTier: li.modelTier,
        serviceRoute: li.serviceRoute,
        usageDay: li.usageDay,
        quantity: Number(li.quantity),
        unitRate: Number(li.unitRate),
        amount: Number(li.amount),
        sortOrder: li.sortOrder,
      })),
    attribution,
  };
}
