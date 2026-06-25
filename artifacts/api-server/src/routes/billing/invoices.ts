import { Router, type IRouter, type Request, type Response } from "express";
import { db, invoicesTable, invoiceLineItemsTable, clientsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { composeInvoice, finalizeInvoice, type ComposedInvoice } from "../../services/billing/invoice-builder.js";
import { closeCycleForSubscription } from "../../services/billing/cycle-close.js";
import { generateInvoicePdf, type InvoicePdfMeta } from "../../services/billing/invoice-pdf.js";
import type { Invoice, InvoiceLineItem } from "@workspace/db";

const router: IRouter = Router();

function lineItemsToAttribution(lineItems: InvoiceLineItem[]): ComposedInvoice["attribution"] {
  const byBot = lineItems
    .filter((li) => li.lineType === "usage_bot")
    .map((li) => ({
      botId: li.botId,
      botName: li.botName ?? "Platform / Unattributed",
      credits: Number(li.quantity),
      llmCalls: 0,
      llmCostUsd: 0,
    }));
  const byModel = lineItems
    .filter((li) => li.lineType === "usage_model")
    .map((li) => ({
      model: li.model ?? "unknown",
      modelTier: li.modelTier ?? "frontier",
      credits: Number(li.quantity),
      events: 0,
      llmCostUsd: 0,
    }));
  const byRoute = lineItems
    .filter((li) => li.lineType === "usage_route")
    .map((li) => ({ route: li.serviceRoute ?? "unknown", credits: Number(li.quantity), events: 0 }));
  const byDay = lineItems
    .filter((li) => li.lineType === "usage_day")
    .map((li) => ({ day: li.usageDay ?? "", credits: Number(li.quantity), events: 0 }));
  return {
    periodStart: "",
    periodEnd: "",
    totals: { totalCredits: 0, totalEvents: 0, llmCalls: 0, llmCostUsd: 0, toolCalls: 0 },
    byBot,
    byModel,
    byTier: [],
    byRoute,
    byDay,
    toolActivity: [],
  };
}

function storedToComposed(invoice: Invoice, lineItems: InvoiceLineItem[]): ComposedInvoice {
  const attribution = lineItemsToAttribution(lineItems);
  attribution.periodStart = invoice.periodStart.toISOString();
  attribution.periodEnd = invoice.periodEnd.toISOString();
  attribution.totals.totalCredits = invoice.usedCredits;
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

async function getClientName(clientId: number): Promise<string | null> {
  const [c] = await db
    .select({ name: clientsTable.companyName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return c?.name ?? null;
}

// List a client's invoices.
router.get("/billing/invoices", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        periodStart: invoicesTable.periodStart,
        periodEnd: invoicesTable.periodEnd,
        total: invoicesTable.total,
        currency: invoicesTable.currency,
        issuedAt: invoicesTable.issuedAt,
        dueAt: invoicesTable.dueAt,
        paidAt: invoicesTable.paidAt,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.clientId, clientId))
      .orderBy(desc(invoicesTable.periodEnd));
    res.json({ invoices });
  } catch (err) {
    console.error("Error listing invoices:", err);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

// Live "current cycle to date" draft estimate.
router.get("/billing/invoices/draft", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const composed = await composeInvoice(clientId);
    res.json({ invoice: composed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to build draft";
    const status = msg.includes("No active subscription") ? 404 : 500;
    console.error("Error building draft invoice:", err);
    res.status(status).json({ error: msg });
  }
});

// Fetch a single finalized invoice with full line-item detail.
router.get("/billing/invoices/:id", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid invoice id" });
      return;
    }
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.clientId, clientId)));
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const lineItems = await db
      .select()
      .from(invoiceLineItemsTable)
      .where(eq(invoiceLineItemsTable.invoiceId, id))
      .orderBy(invoiceLineItemsTable.sortOrder);
    res.json({ invoice: storedToComposed(invoice, lineItems) });
  } catch (err) {
    console.error("Error fetching invoice:", err);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

// Close the current billing cycle: finalize an immutable invoice, reset credits
// to the allotment, advance the cycle window, optionally settle. `/finalize` is
// an alias so callers cannot finalize-without-settling and strand the credits.
async function handleCloseCycle(req: Request, res: Response): Promise<void> {
  try {
    const clientId = req.user!.clientId;
    const { attemptCharge } = req.body ?? {};
    const composed = await composeInvoice(clientId).catch(() => null);
    if (!composed || composed.subscriptionId == null) {
      res.status(404).json({ error: "No active subscription found for this client" });
      return;
    }
    const result = await closeCycleForSubscription(composed.subscriptionId, {
      attemptCharge: Boolean(attemptCharge),
      force: true,
    });
    res.status(result.skipped ? 200 : 201).json(result);
  } catch (err) {
    console.error("Error closing cycle:", err);
    res.status(500).json({ error: "Failed to close cycle" });
  }
}

router.post("/billing/invoices/close-cycle", authenticate, requireRole("owner", "admin"), handleCloseCycle);
router.post("/billing/invoices/finalize", authenticate, requireRole("owner", "admin"), handleCloseCycle);

// Download a branded PDF for a finalized invoice (or the live draft).
router.get("/billing/invoices/:id/pdf", authenticate, requireRole("owner", "admin"), async (req, res): Promise<void> => {
  try {
    const clientId = req.user!.clientId;
    const clientName = await getClientName(clientId);

    if (req.params.id === "draft") {
      const composed = await composeInvoice(clientId);
      const meta: InvoicePdfMeta = {
        invoiceNumber: "DRAFT — Current Cycle",
        status: "draft",
        clientName,
      };
      const pdf = await generateInvoicePdf(composed, meta);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="galaxybots-statement-draft.pdf"`);
      res.send(pdf);
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid invoice id" });
      return;
    }
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.clientId, clientId)));
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const lineItems = await db
      .select()
      .from(invoiceLineItemsTable)
      .where(eq(invoiceLineItemsTable.invoiceId, id))
      .orderBy(invoiceLineItemsTable.sortOrder);
    const composed = storedToComposed(invoice, lineItems);
    const meta: InvoicePdfMeta = {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      dueAt: invoice.dueAt?.toISOString() ?? null,
      clientName,
    };
    const pdf = await generateInvoicePdf(composed, meta);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="galaxybots-${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate PDF";
    console.error("Error generating invoice PDF:", err);
    res.status(500).json({ error: msg });
  }
});

export default router;
