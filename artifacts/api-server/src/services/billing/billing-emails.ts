import { db, clientsTable, invoicesTable, invoiceLineItemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "../../utils/email.js";
import { generateInvoicePdf } from "./invoice-pdf.js";
import { storedToComposed } from "./invoice-helpers.js";

const APP_URL = () => process.env["APP_URL"] || "https://galaxybots.ai";

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function brandedWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e0e0f0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:linear-gradient(135deg,#12102e 0%,#1a1535 100%);border:1px solid #2d2a5e;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#7c3aed 0%,#2563eb 100%);padding:24px 32px;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">GalaxyBots.ai</h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">AI Executive Team Platform</p>
      </div>
      <div style="padding:32px;">
        ${content}
      </div>
      <div style="padding:20px 32px;border-top:1px solid #2d2a5e;text-align:center;">
        <p style="margin:0;color:#6b7280;font-size:12px;">
          © ${new Date().getFullYear()} GalaxyBots.ai — Questions? 
          <a href="mailto:support@galaxybots.ai" style="color:#7c3aed;">support@galaxybots.ai</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function getClientEmail(clientId: number): Promise<{ email: string; name: string; company: string } | null> {
  const [client] = await db
    .select({ email: clientsTable.contactEmail, name: clientsTable.contactName, company: clientsTable.companyName })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));
  return client ?? null;
}

export async function sendInvoiceEmail(invoiceId: number): Promise<void> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const contact = await getClientEmail(invoice.clientId);
  if (!contact) {
    console.warn(`[billing-email] No contact found for client ${invoice.clientId}, skipping invoice email`);
    return;
  }

  const lineItems = await db
    .select()
    .from(invoiceLineItemsTable)
    .where(eq(invoiceLineItemsTable.invoiceId, invoiceId))
    .orderBy(invoiceLineItemsTable.sortOrder);

  const composed = storedToComposed(invoice, lineItems);
  const total = parseFloat(invoice.total);
  const isPaid = invoice.status === "paid";
  const payUrl = `${APP_URL()}/billing/statements?pay=${invoiceId}`;

  let pdfBuffer: Buffer | null = null;
  try {
    const meta = {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      dueAt: invoice.dueAt?.toISOString() ?? null,
      clientName: contact.company,
    };
    pdfBuffer = await generateInvoicePdf(composed, meta);
  } catch (err) {
    console.warn("[billing-email] Could not generate PDF attachment:", err);
  }

  const payButton = !isPaid
    ? `<div style="text-align:center;margin:24px 0;">
        <a href="${payUrl}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
          Pay Now — ${fmtMoney(total)}
        </a>
      </div>`
    : `<div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
        <span style="color:#4ade80;font-weight:600;">✓ Paid — Thank you!</span>
      </div>`;

  const html = brandedWrapper(`
    <h2 style="margin:0 0 8px;color:#e0e0f0;font-size:20px;">Invoice ${invoice.invoiceNumber}</h2>
    <p style="color:#9ca3af;margin:0 0 24px;">Hi ${contact.name}, your invoice for ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)} is ready.</p>
    
    <div style="background:#0f0e2a;border:1px solid #2d2a5e;border-radius:8px;padding:20px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;color:#9ca3af;font-size:14px;">Invoice Number</td>
          <td style="padding:6px 0;text-align:right;color:#e0e0f0;font-size:14px;font-weight:600;">${invoice.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#9ca3af;font-size:14px;">Period</td>
          <td style="padding:6px 0;text-align:right;color:#e0e0f0;font-size:14px;">${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#9ca3af;font-size:14px;">Status</td>
          <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600;color:${isPaid ? "#4ade80" : "#f59e0b"};">${invoice.status.toUpperCase()}</td>
        </tr>
        ${invoice.dueAt ? `<tr>
          <td style="padding:6px 0;color:#9ca3af;font-size:14px;">Due Date</td>
          <td style="padding:6px 0;text-align:right;color:#e0e0f0;font-size:14px;">${fmtDate(invoice.dueAt)}</td>
        </tr>` : ""}
        <tr style="border-top:1px solid #2d2a5e;">
          <td style="padding:12px 0 6px;color:#e0e0f0;font-size:16px;font-weight:700;">Total Due</td>
          <td style="padding:12px 0 6px;text-align:right;color:#7c3aed;font-size:20px;font-weight:700;">${fmtMoney(total)}</td>
        </tr>
      </table>
    </div>

    ${payButton}
    
    <p style="color:#6b7280;font-size:13px;text-align:center;margin-top:16px;">
      ${pdfBuffer ? "Your invoice PDF is attached to this email." : ""}
      View full statement details in your <a href="${APP_URL()}/billing/statements" style="color:#7c3aed;">account portal</a>.
    </p>
  `);

  const nodemailer = await import("nodemailer");
  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[billing-email] SMTP not configured — stub: would send invoice ${invoice.invoiceNumber} to ${contact.email}`);
    return;
  }

  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: Number(process.env["SMTP_PORT"] ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOpts: Record<string, unknown> = {
    from: process.env["SMTP_FROM"] || smtpUser,
    to: contact.email,
    subject: `Invoice ${invoice.invoiceNumber} — ${fmtMoney(total)} ${isPaid ? "(Paid)" : "Due"}`,
    html,
  };

  if (pdfBuffer) {
    mailOpts["attachments"] = [{
      filename: `galaxybots-${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }];
  }

  await transporter.sendMail(mailOpts);
  console.log(`[billing-email] Invoice email sent for ${invoice.invoiceNumber} to ${contact.email}`);
}

export async function sendDunningEmail(invoiceId: number, step: number): Promise<void> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) return;

  const contact = await getClientEmail(invoice.clientId);
  if (!contact) return;

  const total = parseFloat(invoice.total);
  const payUrl = `${APP_URL()}/billing/statements?pay=${invoiceId}`;

  type DunningConfig = { subject: string; headline: string; body: string; urgent: boolean };
  const stepConfig: Record<number, DunningConfig> = {
    1: {
      subject: `Gentle reminder: Invoice ${invoice.invoiceNumber} is due`,
      headline: "A quick reminder about your invoice",
      body: `Your invoice for ${fmtMoney(total)} was due on ${fmtDate(invoice.dueAt ?? new Date())}. No action needed if payment is already in transit — otherwise, use the button below to settle it now.`,
      urgent: false,
    },
    2: {
      subject: `Action required: Invoice ${invoice.invoiceNumber} — ${fmtMoney(total)} overdue`,
      headline: "Your invoice needs attention",
      body: `Invoice ${invoice.invoiceNumber} for ${fmtMoney(total)} is now overdue. To keep your GalaxyBots.ai services running without interruption, please make payment at your earliest convenience.`,
      urgent: true,
    },
    3: {
      subject: `URGENT: Service restrictions in 7 days — Invoice ${invoice.invoiceNumber}`,
      headline: "Service restrictions approaching",
      body: `Invoice ${invoice.invoiceNumber} for ${fmtMoney(total)} remains unpaid. <strong>In 7 days, bot deployments and new API key creation will be restricted</strong> until the balance is settled. Please act now to avoid disruption.`,
      urgent: true,
    },
    4: {
      subject: `Service restricted — Invoice ${invoice.invoiceNumber} unpaid`,
      headline: "Your account has been restricted",
      body: `Invoice ${invoice.invoiceNumber} for ${fmtMoney(total)} is unpaid. New bot deployments and API key creation are now <strong>restricted</strong>. Your existing bots continue to respond. Settle the invoice below to restore full access.`,
      urgent: true,
    },
  };

  const config = stepConfig[step] ?? stepConfig[1];
  const borderColor = config.urgent ? "#ef4444" : "#f59e0b";
  const bgColor = config.urgent ? "#1a0000" : "#1a1200";

  const html = brandedWrapper(`
    <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:20px;margin-bottom:20px;">
      <h2 style="margin:0 0 8px;color:#e0e0f0;font-size:18px;">${config.headline}</h2>
      <p style="color:#d1d5db;margin:0;font-size:14px;line-height:1.6;">${config.body}</p>
    </div>

    <div style="background:#0f0e2a;border:1px solid #2d2a5e;border-radius:8px;padding:16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#9ca3af;font-size:14px;">Invoice</td>
          <td style="text-align:right;color:#e0e0f0;font-size:14px;font-weight:600;">${invoice.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="color:#9ca3af;font-size:14px;padding-top:6px;">Amount</td>
          <td style="text-align:right;color:#7c3aed;font-size:18px;font-weight:700;padding-top:6px;">${fmtMoney(total)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:20px 0;">
      <a href="${payUrl}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Pay Invoice Now
      </a>
    </div>

    <p style="color:#6b7280;font-size:13px;text-align:center;">
      Need help? <a href="mailto:support@galaxybots.ai" style="color:#7c3aed;">Contact support</a>
    </p>
  `);

  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[billing-email] SMTP stub: dunning step ${step} for invoice ${invoice.invoiceNumber} → ${contact.email}`);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: Number(process.env["SMTP_PORT"] ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: process.env["SMTP_FROM"] || smtpUser,
    to: contact.email,
    subject: config.subject,
    html,
  });
  console.log(`[billing-email] Dunning step ${step} email sent for ${invoice.invoiceNumber} → ${contact.email}`);
}

export async function sendUsageAlertEmail(clientId: number, thresholdPct: number, used: number, included: number): Promise<void> {
  const contact = await getClientEmail(clientId);
  if (!contact) return;

  const isOver = thresholdPct >= 100;
  const subject = isOver
    ? `⚠️ Credit allotment exceeded — overage charges now active`
    : `Heads up: You've used ${thresholdPct}% of your included credits`;

  const html = brandedWrapper(`
    <div style="background:${isOver ? "#1a0500" : "#1a1200"};border:1px solid ${isOver ? "#f97316" : "#f59e0b"};border-radius:8px;padding:20px;margin-bottom:20px;">
      <h2 style="margin:0 0 8px;color:#e0e0f0;font-size:18px;">
        ${isOver ? "You've exceeded your included credit allotment" : `You've used ${thresholdPct}% of your credits`}
      </h2>
      <p style="color:#d1d5db;margin:0;font-size:14px;line-height:1.6;">
        ${isOver
          ? `Your account has used <strong>${used.toLocaleString()} credits</strong>, surpassing your included allotment of <strong>${included.toLocaleString()} credits</strong>. Overage charges are now being applied to your invoice.`
          : `Your account has used <strong>${used.toLocaleString()} of ${included.toLocaleString()}</strong> included credits this billing cycle. You have ${(included - used).toLocaleString()} credits remaining before overage charges begin.`
        }
      </p>
    </div>

    <div style="text-align:center;margin:20px 0;">
      <a href="${APP_URL()}/billing/statements" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
        View Usage Details
      </a>
    </div>

    <p style="color:#6b7280;font-size:13px;text-align:center;">
      To increase your credit allotment, consider upgrading your plan in the 
      <a href="${APP_URL()}/billing" style="color:#7c3aed;">billing portal</a>.
    </p>
  `);

  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[billing-email] SMTP stub: usage alert ${thresholdPct}% for client ${clientId} → ${contact.email}`);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: Number(process.env["SMTP_PORT"] ?? 587),
    secure: Number(process.env["SMTP_PORT"] ?? 587) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: process.env["SMTP_FROM"] || smtpUser,
    to: contact.email,
    subject,
    html,
  });
  console.log(`[billing-email] Usage alert (${thresholdPct}%) sent to ${contact.email}`);
}
