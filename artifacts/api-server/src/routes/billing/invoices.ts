import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { db, invoicesTable, invoiceLineItemsTable, clientsTable, accountSubscriptionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { composeInvoice, finalizeInvoice } from "../../services/billing/invoice-builder.js";
import { closeCycleForSubscription } from "../../services/billing/cycle-close.js";
import { generateInvoicePdf, type InvoicePdfMeta } from "../../services/billing/invoice-pdf.js";
import { storedToComposed } from "../../services/billing/invoice-helpers.js";
import { getStripeClient } from "../../services/billing/stripe-customer.js";

const router: IRouter = Router();

async function getClientName(clientId: number): Promise<string | null> {
  const [c] = await db
    .select({ name: clientsTable.companyName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return c?.name ?? null;
}

// List a client's invoices (owner, admin, or client role can view their own).
router.get("/billing/invoices", authenticate, requireRole("owner", "admin", "client"), async (req, res): Promise<void> => {
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
        dunningStep: invoicesTable.dunningStep,
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
router.get("/billing/invoices/draft", authenticate, requireRole("owner", "admin", "client"), async (req, res): Promise<void> => {
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
router.get("/billing/invoices/:id", authenticate, requireRole("owner", "admin", "client"), async (req, res): Promise<void> => {
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

// Create a Stripe-hosted checkout session to pay a specific unpaid invoice.
router.post("/billing/invoices/:id/pay", authenticate, requireRole("owner", "admin", "client"), async (req, res): Promise<void> => {
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

    // Only block payment if already settled or voided — allow finalized, failed, pending_3ds.
    if (invoice.status === "paid" || invoice.status === "void") {
      res.status(409).json({ error: `Invoice is already ${invoice.status}` });
      return;
    }

    // Sanity guard: only payable statuses.
    const payableStatuses = ["finalized", "failed", "pending_3ds"];
    if (!payableStatuses.includes(invoice.status)) {
      res.status(409).json({ error: `Invoice status '${invoice.status}' is not payable` });
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "Stripe is not configured" });
      return;
    }

    const appUrl = process.env["APP_URL"] || req.headers.origin || "";
    const totalCents = Math.round(parseFloat(invoice.total) * 100);

    const [sub] = await db
      .select({ stripeCustomerId: accountSubscriptionsTable.stripeCustomerId })
      .from(accountSubscriptionsTable)
      .where(eq(accountSubscriptionsTable.clientId, clientId));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...(sub?.stripeCustomerId ? { customer: sub.stripeCustomerId } : {}),
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: `Invoice ${invoice.invoiceNumber}` },
          unit_amount: totalCents,
        },
        quantity: 1,
      }],
      metadata: { invoiceId: String(id), clientId: String(clientId) },
      success_url: `${appUrl}/billing/statements?checkout=success&invoiceId=${id}`,
      cancel_url: `${appUrl}/billing/statements?checkout=cancelled`,
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating invoice pay session:", err);
    res.status(500).json({ error: "Failed to create payment session" });
  }
});

// Close the current billing cycle: finalize an immutable invoice, reset credits
// to the allotment, advance the cycle window, optionally settle.
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
router.get("/billing/invoices/:id/pdf", authenticate, requireRole("owner", "admin", "client"), async (req, res): Promise<void> => {
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
