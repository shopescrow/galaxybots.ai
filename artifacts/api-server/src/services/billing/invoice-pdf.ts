import type { ComposedInvoice } from "./invoice-builder.js";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export interface InvoicePdfMeta {
  invoiceNumber: string;
  status: string;
  issuedAt?: string | null;
  dueAt?: string | null;
  clientName?: string | null;
}

export function renderInvoiceHtml(inv: ComposedInvoice, meta: InvoicePdfMeta): string {
  const a = inv.attribution;

  const usageRow = (label: string, credits: number) =>
    `<tr><td>${esc(label)}</td><td class="num">${credits.toLocaleString()}</td></tr>`;

  const byBotRows = a.byBot.map((b) => usageRow(b.botName, b.credits)).join("");
  const byModelRows = a.byModel.map((m) => usageRow(`${m.model} (${m.modelTier})`, m.credits)).join("");
  const byRouteRows = a.byRoute.map((r) => usageRow(r.route, r.credits)).join("");
  const byDayRows = a.byDay.map((d) => usageRow(d.day, d.credits)).join("");

  const chargeLines = inv.lineItems.filter(
    (li) => li.lineType === "base" || li.lineType === "addon" || li.lineType === "overage",
  );
  const chargeRows = chargeLines
    .map(
      (li) =>
        `<tr><td>${esc(li.description)}</td><td class="num">${li.quantity.toLocaleString()}</td><td class="num">${
          li.unitRate ? money(li.unitRate) : "—"
        }</td><td class="num">${money(li.amount)}</td></tr>`,
    )
    .join("");

  const overagePct = inv.usedCredits > 0 ? Math.round((inv.overageCredits / inv.usedCredits) * 100) : 0;

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 40px; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 20px; margin-bottom: 28px; }
  .brand { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .brand span { color: #7c3aed; }
  .brand-sub { color: #6b7280; font-size: 11px; margin-top: 4px; }
  .inv-meta { text-align: right; font-size: 12px; }
  .inv-meta .num { font-size: 20px; font-weight: 800; color: #7c3aed; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge.finalized { background: #ede9fe; color: #6d28d9; }
  .badge.draft { background: #fef3c7; color: #b45309; }
  .badge.paid { background: #d1fae5; color: #047857; }
  .badge.void { background: #fee2e2; color: #b91c1c; }
  .grid2 { display: flex; gap: 40px; margin-bottom: 28px; }
  .grid2 > div { flex: 1; }
  .label { text-transform: uppercase; letter-spacing: 1px; font-size: 9px; color: #9ca3af; margin-bottom: 4px; font-weight: 700; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.8px; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #9ca3af; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  td.num, th.num { text-align: right; }
  .tables3 { display: flex; gap: 16px; }
  .tables3 > div { flex: 1; }
  .totals { margin-top: 20px; margin-left: auto; width: 280px; }
  .totals tr td { border: none; padding: 4px 8px; }
  .totals .grand td { border-top: 2px solid #7c3aed; font-size: 16px; font-weight: 800; padding-top: 10px; }
  .totals .grand td:last-child { color: #7c3aed; }
  .overage-note { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 12px; margin: 12px 0; color: #9a3412; font-size: 11px; }
  .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="brand">Galaxy<span>Bots</span>.ai</div>
      <div class="brand-sub">AI Executive Workforce · Statement of Account</div>
    </div>
    <div class="inv-meta">
      <div class="label">Invoice</div>
      <div class="num">${esc(meta.invoiceNumber)}</div>
      <div style="margin-top:6px"><span class="badge ${esc(meta.status)}">${esc(meta.status)}</span></div>
    </div>
  </div>

  <div class="grid2">
    <div>
      <div class="label">Billed To</div>
      <div style="font-weight:700">${esc(meta.clientName || `Client #${inv.clientId}`)}</div>
      <div style="color:#6b7280">${esc(inv.planTier ? inv.planTier.toUpperCase() + " Plan" : "")}</div>
    </div>
    <div>
      <div class="label">Billing Period</div>
      <div>${fmtDate(inv.periodStart)} → ${fmtDate(inv.periodEnd)}</div>
      ${meta.issuedAt ? `<div class="label" style="margin-top:8px">Issued</div><div>${fmtDate(meta.issuedAt)}</div>` : ""}
      ${meta.dueAt ? `<div class="label" style="margin-top:8px">Due</div><div>${fmtDate(meta.dueAt)}</div>` : ""}
    </div>
  </div>

  <h2>Charges</h2>
  <table>
    <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${chargeRows}</tbody>
  </table>

  ${
    inv.overageCredits > 0
      ? `<div class="overage-note"><strong>Overage:</strong> ${inv.usedCredits.toLocaleString()} credits used against a ${inv.includedCredits.toLocaleString()} allotment — ${inv.overageCredits.toLocaleString()} over (${overagePct}%), billed at ${money(inv.overageRatePerCredit)}/credit.</div>`
      : `<div class="overage-note" style="background:#f0fdf4;border-color:#bbf7d0;color:#166534"><strong>Within allotment:</strong> ${inv.usedCredits.toLocaleString()} of ${inv.includedCredits.toLocaleString()} included credits used — no overage.</div>`
  }

  <h2>Usage Attribution</h2>
  <div class="tables3">
    <div>
      <div class="label">By Bot</div>
      <table><thead><tr><th>Bot</th><th class="num">Credits</th></tr></thead><tbody>${byBotRows || '<tr><td colspan="2">No usage</td></tr>'}</tbody></table>
    </div>
    <div>
      <div class="label">By Model / Tier</div>
      <table><thead><tr><th>Model</th><th class="num">Credits</th></tr></thead><tbody>${byModelRows || '<tr><td colspan="2">No usage</td></tr>'}</tbody></table>
    </div>
  </div>
  <div class="tables3" style="margin-top:16px">
    <div>
      <div class="label">By Service / Route</div>
      <table><thead><tr><th>Route</th><th class="num">Credits</th></tr></thead><tbody>${byRouteRows || '<tr><td colspan="2">No usage</td></tr>'}</tbody></table>
    </div>
    <div>
      <div class="label">By Day</div>
      <table><thead><tr><th>Day</th><th class="num">Credits</th></tr></thead><tbody>${byDayRows || '<tr><td colspan="2">No usage</td></tr>'}</tbody></table>
    </div>
  </div>

  <table class="totals">
    <tr><td>Base subscription</td><td class="num">${money(inv.baseSubtotal)}</td></tr>
    <tr><td>Add-ons</td><td class="num">${money(inv.addonSubtotal)}</td></tr>
    <tr><td>Overage</td><td class="num">${money(inv.overageSubtotal)}</td></tr>
    <tr><td>Subtotal</td><td class="num">${money(inv.subtotal)}</td></tr>
    <tr><td>Tax (${(inv.taxRate * 100).toFixed(2)}%)</td><td class="num">${money(inv.taxAmount)}</td></tr>
    <tr class="grand"><td>Total Due</td><td class="num">${money(inv.total)}</td></tr>
  </table>

  <div class="footer">
    GalaxyBots.ai · Generated ${fmtDate(new Date().toISOString())} · This statement reconciles with recorded usage events for the period.
  </div>
</body></html>`;
}

/**
 * Renders a branded invoice PDF using the bundled Chromium via playwright-core.
 */
export async function generateInvoicePdf(inv: ComposedInvoice, meta: InvoicePdfMeta): Promise<Buffer> {
  const html = renderInvoiceHtml(inv, meta);
  const pw = await import("playwright-core");
  const executablePath = process.env["REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE"] || undefined;
  const browser = await pw.chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
