/**
 * SMS delivery utility using the Twilio REST API.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID   — Twilio account SID
 *   TWILIO_AUTH_TOKEN    — Twilio auth token
 *   TWILIO_FROM_NUMBER   — Twilio phone number (e.g. "+15551234567")
 *
 * Throws a descriptive error when credentials are missing rather than
 * silently succeeding, so callers can surface a meaningful failure.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const missing = [
      !accountSid && "TWILIO_ACCOUNT_SID",
      !authToken && "TWILIO_AUTH_TOKEN",
      !fromNumber && "TWILIO_FROM_NUMBER",
    ].filter(Boolean).join(", ");
    throw new Error(
      `SMS delivery is not configured. Missing environment variables: ${missing}. ` +
      `Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to enable SMS delivery.`
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams({ To: to, From: fromNumber, Body: body });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Twilio SMS error (${response.status}): ${errorBody}`);
  }

  console.log(`[sms] Delivered SMS to ${to}`);
}
