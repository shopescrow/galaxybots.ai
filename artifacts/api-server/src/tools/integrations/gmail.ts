import { z } from "zod";
import nodemailer from "nodemailer";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "send_email",
  description: "Send an email using the client's connected Gmail/SMTP credential. Requires the client to have a Gmail integration configured.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body text"),
  }),
  execute: withCredentialRetry("gmail", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "gmail");

    if (credential) {
      try {
        const response = await fetch("https://www.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: Buffer.from(
              `To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`
            ).toString("base64url"),
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          return { success: false, error: `Gmail API error: ${response.status} - ${errText}` };
        }
        return { success: true, message: `Email sent to ${input.to} via Gmail` };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Failed to send email via Gmail" };
      }
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM;

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: Number(smtpPort) || 587,
          secure: Number(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
          from: smtpFrom || smtpUser,
          to: input.to,
          subject: input.subject,
          text: input.body,
        });
        return { success: true, message: `Email sent to ${input.to} via SMTP` };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : "Failed to send email via SMTP" };
      }
    }

    return { success: false, error: "No email credential configured. Connect Gmail in Integrations settings or configure SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS)." };
  }),
});

registerTool({
  name: "read_email",
  description: "Read the most recent inbox emails using the client's connected Gmail credential. Returns subject, sender, and snippet for each message.",
  inputSchema: z.object({
    count: z.number().optional().describe("Number of recent emails to retrieve (default 5, max 20)"),
  }),
  execute: withCredentialRetry("gmail", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "gmail");
    if (!credential) {
      return { success: false, emails: [], error: "No Gmail credential configured for this client." };
    }
    const maxResults = Math.min(input.count ?? 5, 20);
    try {
      const listRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`, {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!listRes.ok) {
        return { success: false, emails: [], error: `Gmail API error: ${listRes.status}` };
      }
      const listData = await listRes.json() as { messages?: Array<{ id: string }> };
      if (!listData.messages || listData.messages.length === 0) {
        return { success: true, emails: [], message: "No messages found" };
      }
      const emails = await Promise.all(
        listData.messages.slice(0, maxResults).map(async (msg: { id: string }) => {
          const msgRes = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, {
            headers: { Authorization: `Bearer ${credential}` },
          });
          if (!msgRes.ok) return null;
          const msgData = await msgRes.json() as { snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
          const headers = msgData.payload?.headers ?? [];
          return {
            subject: headers.find((h: { name: string }) => h.name === "Subject")?.value ?? "(no subject)",
            from: headers.find((h: { name: string }) => h.name === "From")?.value ?? "(unknown)",
            snippet: msgData.snippet ?? "",
          };
        })
      );
      return { success: true, emails: emails.filter(Boolean) };
    } catch (err) {
      return { success: false, emails: [], error: err instanceof Error ? err.message : "Failed to read emails" };
    }
  }),
});
