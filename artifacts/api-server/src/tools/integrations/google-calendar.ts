import { z } from "zod";
import { registerTool, type ToolContext } from "../registry";
import { getClientCredential, withCredentialRetry } from "./_shared";

registerTool({
  name: "create_calendar_event",
  description: "Create a Google Calendar event using the client's Google Calendar API credential.",
  inputSchema: z.object({
    title: z.string().describe("Event title/summary"),
    description: z.string().optional().describe("Event description"),
    startTime: z.string().describe("Event start time in ISO 8601 format (e.g. 2025-01-15T09:00:00-05:00)"),
    endTime: z.string().describe("Event end time in ISO 8601 format"),
    attendees: z.array(z.string()).optional().describe("List of attendee email addresses"),
  }),
  execute: withCredentialRetry("google_calendar", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_calendar");
    if (!credential) {
      return { success: false, error: "No Google Calendar credential configured for this client." };
    }
    try {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.title,
          description: input.description ?? "",
          start: { dateTime: input.startTime },
          end: { dateTime: input.endTime },
          attendees: (input.attendees ?? []).map((email) => ({ email })),
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Calendar API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { id: string; htmlLink: string };
      return { success: true, eventId: data.id, link: data.htmlLink };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create calendar event" };
    }
  }),
});

registerTool({
  name: "list_calendar_events",
  description: "List upcoming Google Calendar events using the client's Google Calendar credential.",
  inputSchema: z.object({
    count: z.number().optional().describe("Number of upcoming events to retrieve (default 10, max 50)"),
  }),
  execute: withCredentialRetry("google_calendar", async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_calendar");
    if (!credential) {
      return { success: false, events: [], error: "No Google Calendar credential configured for this client." };
    }
    const maxResults = Math.min(input.count ?? 10, 50);
    const now = new Date().toISOString();
    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(now)}&orderBy=startTime&singleEvents=true`,
        { headers: { Authorization: `Bearer ${credential}` } }
      );
      if (!response.ok) {
        return { success: false, events: [], error: `Calendar API error: ${response.status}` };
      }
      const data = await response.json() as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> };
      return {
        success: true,
        events: (data.items ?? []).map((e) => ({
          id: e.id,
          title: e.summary ?? "(no title)",
          start: e.start?.dateTime ?? e.start?.date ?? "",
          end: e.end?.dateTime ?? e.end?.date ?? "",
        })),
      };
    } catch (err) {
      return { success: false, events: [], error: err instanceof Error ? err.message : "Failed to list calendar events" };
    }
  }),
});
