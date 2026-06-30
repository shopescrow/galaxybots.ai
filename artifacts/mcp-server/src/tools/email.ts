import { z } from "zod";
import nodemailer from "nodemailer";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerEmailTool(server: McpServer): void {
  server.tool(
    "send_email",
    "Send an email via SMTP. Requires SMTP_HOST, SMTP_USER, and SMTP_PASS to be set. Returns a structured integration_not_configured error when credentials are absent.",
    {
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body content (plain text or HTML)"),
      from: z.string().email().optional().describe("Sender email address (defaults to SMTP_FROM or SMTP_USER)"),
    },
    async ({ to, subject, body, from }) => {
      console.log(`[MCP] send_email: to=${to}, subject="${subject}"`);
      try {
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (!smtpHost || !smtpUser || !smtpPass) {
          const missing = [
            !smtpHost && "SMTP_HOST",
            !smtpUser && "SMTP_USER",
            !smtpPass && "SMTP_PASS",
          ].filter(Boolean).join(", ");
          console.warn(`[MCP] send_email: SMTP not configured — missing: ${missing}`);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: "integration_not_configured",
                missing,
                message: `Email sending is not available because the following SMTP environment variables are not set: ${missing}. Ask your administrator to configure them.`,
              }, null, 2),
            }],
            isError: true,
          };
        }

        const smtpPort = Number(process.env.SMTP_PORT ?? 587);
        const fromAddress = from || process.env.SMTP_FROM || smtpUser;

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: fromAddress,
          to,
          subject,
          text: body,
        });

        console.log(`[MCP] send_email: Email sent successfully to ${to}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `Email sent successfully to ${to}`,
              from: fromAddress,
              subject,
            }, null, 2),
          }],
        };
      } catch (error) {
        console.error("[MCP] send_email: Error", error);
        return {
          content: [{ type: "text" as const, text: `Error sending email: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
