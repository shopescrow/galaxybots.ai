import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerEmailTool(server: McpServer): void {
  server.tool(
    "send_email",
    "Send an email via SendGrid. Requires SENDGRID_API_KEY to be set. In dev mode without the key, logs the email details and returns a stub response.",
    {
      to: z.string().email().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body content (plain text)"),
      from: z.string().email().optional().describe("Sender email address (defaults to SENDGRID_FROM_EMAIL or noreply@galaxybots.ai)"),
    },
    async ({ to, subject, body, from }) => {
      console.log(`[MCP] send_email: to=${to}, subject="${subject}"`);
      try {
        const apiKey = process.env.SENDGRID_API_KEY;
        const fromEmail = from || process.env.SENDGRID_FROM_EMAIL || "noreply@galaxybots.ai";

        if (!apiKey) {
          console.log("[MCP] send_email: SENDGRID_API_KEY not set, returning stub response");
          console.log(`[MCP] send_email: [STUB] Would send email from=${fromEmail} to=${to} subject="${subject}"`);
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                mode: "dev-stub",
                message: "SENDGRID_API_KEY is not set. Email was not sent. In production, this would deliver the email via SendGrid.",
                email: { from: fromEmail, to, subject, bodyPreview: body.substring(0, 200) },
              }, null, 2),
            }],
          };
        }

        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: fromEmail },
            subject,
            content: [{ type: "text/plain", value: body }],
          }),
        });

        if (!res.ok) {
          const errorBody = await res.text();
          throw new Error(`SendGrid API error (${res.status}): ${errorBody}`);
        }

        console.log(`[MCP] send_email: Email sent successfully to ${to}`);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              message: `Email sent successfully to ${to}`,
              from: fromEmail,
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
