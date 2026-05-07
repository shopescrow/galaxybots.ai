import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "send_sms",
  description: "Send an SMS message via Twilio using the client's connected Twilio credential. The credential must be a JSON string with accountSid and authToken fields.",
  inputSchema: z.object({
    to: z.string().describe("Recipient phone number in E.164 format (e.g. +15551234567)"),
    from: z.string().describe("Sender phone number in E.164 format — must be a Twilio number on the account (e.g. +15559876543)"),
    body: z.string().describe("SMS message body text"),
  }),
  execute: withCredentialRetry("twilio", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "twilio");
    if (!credential) {
      return { success: false, error: "No Twilio credential configured for this client. Connect Twilio in Integrations settings." };
    }
    let accountSid: string;
    let authToken: string;
    try {
      const parsed = JSON.parse(credential) as { accountSid?: string; authToken?: string };
      accountSid = parsed.accountSid ?? "";
      authToken = parsed.authToken ?? "";
    } catch {
      return { success: false, error: "Invalid Twilio credential format. Expected JSON: {\"accountSid\":\"...\",\"authToken\":\"...\"}" };
    }
    if (!accountSid || !authToken) {
      return { success: false, error: "Twilio credential must include both accountSid and authToken." };
    }
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: input.to,
        From: input.from,
        Body: input.body,
      });
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Twilio API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { sid: string; status: string };
      return { success: true, messageSid: data.sid, status: data.status, message: `SMS sent to ${input.to}` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to send SMS via Twilio" };
    }
  }),
});
