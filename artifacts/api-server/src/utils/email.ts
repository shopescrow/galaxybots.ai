import nodemailer from "nodemailer";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Shared transactional email utility for the API server.
 *
 * Reads SMTP credentials from environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Throws a descriptive error when credentials are missing rather than
 * silently succeeding, so callers can surface a meaningful failure to the user.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    const missing = [
      !smtpHost && "SMTP_HOST",
      !smtpUser && "SMTP_USER",
      !smtpPass && "SMTP_PASS",
    ].filter(Boolean).join(", ");
    throw new Error(
      `Email delivery is not configured. Missing environment variables: ${missing}. ` +
      `Set SMTP_HOST, SMTP_USER, SMTP_PASS (and optionally SMTP_PORT, SMTP_FROM) to enable email delivery.`
    );
  }

  const smtpPort = Number(process.env.SMTP_PORT ?? 587);
  const fromAddress = process.env.SMTP_FROM || smtpUser;

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.text ? { text: opts.text } : {}),
  });

  console.log(`[email] Delivered "${opts.subject}" to ${opts.to}`);
}
