import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, clientIntegrationsTable, toolActivityLogTable, documentsTable, bingolingoContentTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";
import { decryptCredential } from "../utils/credential-encryption";

async function getClientCredential(clientId: number | undefined, service: string): Promise<string | null> {
  if (!clientId) return null;
  const [row] = await db
    .select()
    .from(clientIntegrationsTable)
    .where(and(
      eq(clientIntegrationsTable.clientId, clientId),
      eq(clientIntegrationsTable.service, service),
      eq(clientIntegrationsTable.status, "connected")
    ));
  if (!row) return null;
  return decryptCredential(row.credential);
}

async function resolveSlackChannel(token: string, channelNameOrId: string): Promise<string | null> {
  if (channelNameOrId.startsWith("C") && /^C[A-Z0-9]+$/.test(channelNameOrId)) {
    return channelNameOrId;
  }
  const cleanName = channelNameOrId.replace(/^#/, "");
  try {
    let cursor: string | undefined;
    do {
      const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as {
        ok: boolean;
        channels?: Array<{ id: string; name: string }>;
        response_metadata?: { next_cursor?: string };
      };
      if (!data.ok) return null;
      const match = data.channels?.find((c) => c.name === cleanName);
      if (match) return match.id;
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    return null;
  }
  return null;
}

async function logToolActivity(toolName: string, context: ToolContext, extra?: { url?: string; metadata?: unknown }) {
  await db.insert(toolActivityLogTable).values({
    toolName,
    clientId: context.clientId ?? null,
    sessionId: context.sessionId ?? null,
    botName: context.botName ?? null,
    url: extra?.url ?? null,
    metadata: {
      ...(extra?.metadata as Record<string, unknown> ?? {}),
      conversationId: context.conversationId ?? null,
    },
  });
}

registerTool({
  name: "send_email",
  description: "Send an email using the client's connected Gmail/SMTP credential. Requires the client to have a Gmail integration configured.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body text"),
  }),
  execute: async (input, context: ToolContext) => {
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
  },
});

registerTool({
  name: "read_email",
  description: "Read the most recent inbox emails using the client's connected Gmail credential. Returns subject, sender, and snippet for each message.",
  inputSchema: z.object({
    count: z.number().optional().describe("Number of recent emails to retrieve (default 5, max 20)"),
  }),
  execute: async (input, context: ToolContext) => {
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
  },
});

registerTool({
  name: "post_slack_message",
  description: "Post a message to a Slack channel using the platform-level Slack Bot Token. Use this to send notifications or updates to team channels.",
  inputSchema: z.object({
    channel: z.string().describe("Slack channel name (without #) or channel ID"),
    text: z.string().describe("Message text to post"),
  }),
  execute: async (input, context: ToolContext) => {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return { success: false, error: "Slack Bot Token not configured. Set SLACK_BOT_TOKEN environment variable." };
    }
    try {
      const channelId = await resolveSlackChannel(token, input.channel);
      if (!channelId) {
        return { success: false, error: `Could not find Slack channel: ${input.channel}` };
      }
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: channelId, text: input.text }),
      });
      const data = await response.json() as { ok: boolean; error?: string; ts?: string };
      if (!data.ok) {
        return { success: false, error: `Slack API error: ${data.error}` };
      }
      return { success: true, message: `Message posted to #${input.channel}`, timestamp: data.ts };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to post Slack message" };
    }
  },
});

registerTool({
  name: "read_slack_channel",
  description: "Read recent messages from a Slack channel using the platform-level Slack Bot Token.",
  inputSchema: z.object({
    channel: z.string().describe("Slack channel name (without #) or channel ID"),
    count: z.number().optional().describe("Number of recent messages to retrieve (default 10, max 50)"),
  }),
  execute: async (input, context: ToolContext) => {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      return { success: false, messages: [], error: "Slack Bot Token not configured." };
    }
    const limit = Math.min(input.count ?? 10, 50);
    try {
      const channelId = await resolveSlackChannel(token, input.channel);
      if (!channelId) {
        return { success: false, messages: [], error: `Could not find Slack channel: ${input.channel}` };
      }
      const response = await fetch(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json() as { ok: boolean; error?: string; messages?: Array<{ text: string; user?: string; ts?: string }> };
      if (!data.ok) {
        return { success: false, messages: [], error: `Slack API error: ${data.error}` };
      }
      return {
        success: true,
        messages: (data.messages ?? []).map((m) => ({
          text: m.text,
          user: m.user ?? "unknown",
          timestamp: m.ts,
        })),
      };
    } catch (err) {
      return { success: false, messages: [], error: err instanceof Error ? err.message : "Failed to read Slack channel" };
    }
  },
});

registerTool({
  name: "create_document",
  description: "Create a new Notion page/document using the client's Notion integration token. Creates a page in the workspace with the given title and content.",
  inputSchema: z.object({
    title: z.string().describe("Document title"),
    content: z.string().describe("Document content (plain text)"),
    parentPageId: z.string().optional().describe("Parent page ID to nest under. If not provided, the first available page in the workspace will be used."),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "notion");
    if (!credential) {
      return { success: false, error: "No Notion credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
    try {
      let parentId = input.parentPageId;
      if (!parentId) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({ filter: { value: "page", property: "object" }, page_size: 1 }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { results: Array<{ id: string }> };
          parentId = searchData.results[0]?.id;
        }
        if (!parentId) {
          return { success: false, error: "No parentPageId provided and no pages found in workspace. Please provide a parentPageId." };
        }
      }
      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { page_id: parentId },
          properties: {
            title: { title: [{ text: { content: input.title } }] },
          },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: input.content } }],
              },
            },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Notion API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { id: string; url: string };
      return { success: true, pageId: data.id, url: data.url, title: input.title };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create Notion document" };
    }
  },
});

registerTool({
  name: "read_document",
  description: "Read a Notion page by ID or search for one by title. Returns the page title and text content.",
  inputSchema: z.object({
    pageId: z.string().optional().describe("Notion page ID to read directly"),
    searchTitle: z.string().optional().describe("Search for a page by title (used if pageId not provided)"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "notion");
    if (!credential) {
      return { success: false, error: "No Notion credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };
    try {
      let targetPageId = input.pageId;
      if (!targetPageId && input.searchTitle) {
        const searchRes = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers,
          body: JSON.stringify({ query: input.searchTitle, filter: { value: "page", property: "object" }, page_size: 1 }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json() as { results: Array<{ id: string }> };
          targetPageId = searchData.results[0]?.id;
        }
      }
      if (!targetPageId) {
        return { success: false, error: "Page not found. Provide a pageId or a valid searchTitle." };
      }

      const pageRes = await fetch(`https://api.notion.com/v1/pages/${targetPageId}`, { headers });
      let pageTitle = "";
      if (pageRes.ok) {
        const pageData = await pageRes.json() as { properties?: { title?: { title?: Array<{ plain_text: string }> }; [key: string]: unknown } };
        const titleProp = pageData.properties?.title;
        if (titleProp && "title" in titleProp && Array.isArray(titleProp.title)) {
          pageTitle = titleProp.title.map((t: { plain_text: string }) => t.plain_text).join("");
        }
        if (!pageTitle) {
          for (const prop of Object.values(pageData.properties ?? {})) {
            const p = prop as { type?: string; title?: Array<{ plain_text: string }> };
            if (p.type === "title" && p.title) {
              pageTitle = p.title.map((t) => t.plain_text).join("");
              break;
            }
          }
        }
      }

      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${targetPageId}/children?page_size=100`, { headers });
      if (!blocksRes.ok) {
        return { success: false, error: `Notion API error: ${blocksRes.status}` };
      }
      const blocksData = await blocksRes.json() as { results: Array<{ type: string; [key: string]: unknown }> };
      const textParts: string[] = [];
      for (const block of blocksData.results) {
        const blockContent = (block as Record<string, unknown>)[block.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
        if (blockContent?.rich_text) {
          textParts.push(blockContent.rich_text.map((t) => t.plain_text).join(""));
        }
      }
      return { success: true, pageId: targetPageId, title: pageTitle, content: textParts.join("\n") };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to read Notion document" };
    }
  },
});

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
  execute: async (input, context: ToolContext) => {
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
  },
});

registerTool({
  name: "list_calendar_events",
  description: "List upcoming Google Calendar events using the client's Google Calendar credential.",
  inputSchema: z.object({
    count: z.number().optional().describe("Number of upcoming events to retrieve (default 10, max 50)"),
  }),
  execute: async (input, context: ToolContext) => {
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
  },
});

registerTool({
  name: "crm_upsert_contact",
  description: "Create or update a HubSpot contact by email using the client's HubSpot private app token.",
  inputSchema: z.object({
    email: z.string().describe("Contact email address"),
    firstName: z.string().optional().describe("Contact first name"),
    lastName: z.string().optional().describe("Contact last name"),
    company: z.string().optional().describe("Contact company name"),
    phone: z.string().optional().describe("Contact phone number"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "hubspot");
    if (!credential) {
      return { success: false, error: "No HubSpot credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    };
    try {
      const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: input.email }] }],
          limit: 1,
        }),
      });
      const searchData = await searchRes.json() as { total: number; results: Array<{ id: string }> };

      const properties: Record<string, string> = { email: input.email };
      if (input.firstName) properties.firstname = input.firstName;
      if (input.lastName) properties.lastname = input.lastName;
      if (input.company) properties.company = input.company;
      if (input.phone) properties.phone = input.phone;

      if (searchData.total > 0) {
        const contactId = searchData.results[0].id;
        const updateRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ properties }),
        });
        if (!updateRes.ok) {
          return { success: false, error: `HubSpot update error: ${updateRes.status}` };
        }
        return { success: true, action: "updated", contactId };
      } else {
        const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
          method: "POST",
          headers,
          body: JSON.stringify({ properties }),
        });
        if (!createRes.ok) {
          return { success: false, error: `HubSpot create error: ${createRes.status}` };
        }
        const data = await createRes.json() as { id: string };
        return { success: true, action: "created", contactId: data.id };
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to upsert HubSpot contact" };
    }
  },
});

registerTool({
  name: "crm_create_deal",
  description: "Create a deal in HubSpot CRM using the client's HubSpot private app token.",
  inputSchema: z.object({
    dealName: z.string().describe("Deal name"),
    stage: z.string().optional().describe("Deal stage (e.g. 'appointmentscheduled', 'qualifiedtobuy', 'closedwon')"),
    amount: z.number().optional().describe("Deal amount in dollars"),
    contactEmail: z.string().optional().describe("Associated contact email"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "hubspot");
    if (!credential) {
      return { success: false, error: "No HubSpot credential configured for this client." };
    }
    const headers = {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    };
    try {
      const properties: Record<string, string | number> = { dealname: input.dealName };
      if (input.stage) properties.dealstage = input.stage;
      if (input.amount !== undefined) properties.amount = input.amount;

      const response = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
        method: "POST",
        headers,
        body: JSON.stringify({ properties }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `HubSpot deal error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { id: string };
      return { success: true, dealId: data.id, dealName: input.dealName };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create HubSpot deal" };
    }
  },
});

registerTool({
  name: "create_issue",
  description: "Create an issue in Linear using the platform-level Linear API key. For project management and task tracking.",
  inputSchema: z.object({
    title: z.string().describe("Issue title"),
    description: z.string().optional().describe("Issue description (markdown supported)"),
    priority: z.number().optional().describe("Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
    teamId: z.string().optional().describe("Linear team ID (uses first available team if not provided)"),
  }),
  execute: async (input, context: ToolContext) => {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Linear API key not configured. Set LINEAR_API_KEY environment variable." };
    }
    try {
      let teamId = input.teamId;
      if (!teamId) {
        const teamsRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "{ teams { nodes { id name } } }" }),
        });
        const teamsData = await teamsRes.json() as { data?: { teams?: { nodes: Array<{ id: string }> } } };
        teamId = teamsData.data?.teams?.nodes[0]?.id;
        if (!teamId) return { success: false, error: "No Linear teams found." };
      }

      const mutation = `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`;
      const variables = {
        input: {
          title: input.title,
          description: input.description ?? "",
          priority: input.priority ?? 0,
          teamId,
        },
      };
      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables }),
      });
      const data = await response.json() as { data?: { issueCreate?: { success: boolean; issue?: { id: string; identifier: string; title: string; url: string } } } };
      if (data.data?.issueCreate?.success) {
        const issue = data.data.issueCreate.issue;
        return { success: true, issueId: issue?.id, identifier: issue?.identifier, url: issue?.url };
      }
      return { success: false, error: "Failed to create Linear issue" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create Linear issue" };
    }
  },
});

registerTool({
  name: "update_issue",
  description: "Update an existing Linear issue's status using the platform-level Linear API key.",
  inputSchema: z.object({
    issueId: z.string().describe("Linear issue ID or identifier (e.g. 'ENG-123')"),
    status: z.string().optional().describe("New status name (e.g. 'In Progress', 'Done', 'Todo')"),
    priority: z.number().optional().describe("New priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low"),
    title: z.string().optional().describe("Updated title"),
  }),
  execute: async (input, context: ToolContext) => {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      return { success: false, error: "Linear API key not configured. Set LINEAR_API_KEY environment variable." };
    }
    try {
      const updateFields: Record<string, unknown> = {};
      if (input.title) updateFields.title = input.title;
      if (input.priority !== undefined) updateFields.priority = input.priority;

      if (input.status) {
        const stateQuery = `{ workflowStates { nodes { id name } } }`;
        const stateRes = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: stateQuery }),
        });
        const stateData = await stateRes.json() as { data?: { workflowStates?: { nodes: Array<{ id: string; name: string }> } } };
        const matchState = stateData.data?.workflowStates?.nodes.find(
          (s) => s.name.toLowerCase() === input.status!.toLowerCase()
        );
        if (matchState) {
          updateFields.stateId = matchState.id;
        }
      }

      const mutation = `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title url } } }`;
      const response = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ query: mutation, variables: { id: input.issueId, input: updateFields } }),
      });
      const data = await response.json() as { data?: { issueUpdate?: { success: boolean; issue?: { id: string; identifier: string; title: string; url: string } } } };
      if (data.data?.issueUpdate?.success) {
        const issue = data.data.issueUpdate.issue;
        return { success: true, issueId: issue?.id, identifier: issue?.identifier };
      }
      return { success: false, error: "Failed to update Linear issue" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to update Linear issue" };
    }
  },
});

registerTool({
  name: "run_code",
  description: "Execute sandboxed JavaScript code and return the result. Useful for calculations, data transformations, and quick scripting tasks. Code runs in an isolated VM with a 5-second timeout.",
  inputSchema: z.object({
    code: z.string().describe("JavaScript code to execute"),
  }),
  execute: async (input, context: ToolContext) => {
    const MAX_OUTPUT_LENGTH = 10000;
    const TIMEOUT_MS = 5000;
    const MEMORY_LIMIT_MB = 64;

    const workerCode = `
      const { parentPort, workerData } = require("worker_threads");
      const vm = require("vm");
      const stdoutLogs = [];
      const stderrLogs = [];
      const sandbox = {
        console: {
          log: (...args) => stdoutLogs.push(args.map(String).join(" ")),
          error: (...args) => stderrLogs.push(args.map(String).join(" ")),
          warn: (...args) => stderrLogs.push(args.map(String).join(" ")),
          info: (...args) => stdoutLogs.push(args.map(String).join(" ")),
        },
        Math, Date, JSON, parseInt, parseFloat, isNaN, isFinite,
        Array, Object, String, Number, Boolean, RegExp, Map, Set,
        setTimeout: undefined, setInterval: undefined, setImmediate: undefined,
        process: undefined, require: undefined, global: undefined,
        globalThis: undefined, fetch: undefined,
      };
      try {
        const ctx = vm.createContext(sandbox);
        const script = new vm.Script(workerData.code, { timeout: ${TIMEOUT_MS} });
        const result = script.runInContext(ctx, { timeout: ${TIMEOUT_MS}, breakOnSigint: true });
        parentPort.postMessage({
          success: true,
          stdout: stdoutLogs.join("\\n"),
          stderr: stderrLogs.join("\\n"),
          result: result !== undefined ? String(result) : undefined,
        });
      } catch (err) {
        parentPort.postMessage({
          success: false,
          stdout: stdoutLogs.join("\\n"),
          stderr: stderrLogs.join("\\n"),
          error: err.message || "Code execution failed",
        });
      }
    `;

    try {
      const { Worker } = await import("worker_threads");
      const result = await new Promise<{
        success: boolean;
        stdout: string;
        stderr: string;
        result?: string;
        error?: string;
      }>((resolve) => {
        const worker = new Worker(workerCode, {
          eval: true,
          workerData: { code: input.code },
          resourceLimits: {
            maxOldGenerationSizeMb: MEMORY_LIMIT_MB,
            maxYoungGenerationSizeMb: MEMORY_LIMIT_MB / 4,
            stackSizeMb: 4,
          },
        });

        const timer = setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            stdout: "",
            stderr: "",
            error: "Code execution timed out (5s limit)",
          });
        }, TIMEOUT_MS + 1000);

        worker.on("message", (msg) => {
          clearTimeout(timer);
          resolve(msg);
          worker.terminate();
        });

        worker.on("error", (err) => {
          clearTimeout(timer);
          const isOOM = err.message.includes("out of memory") || err.message.includes("allocation");
          resolve({
            success: false,
            stdout: "",
            stderr: "",
            error: isOOM ? "Code execution exceeded memory limit (64MB)" : err.message,
          });
        });

        worker.on("exit", (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            resolve({
              success: false,
              stdout: "",
              stderr: "",
              error: `Worker exited with code ${code}`,
            });
          }
        });
      });

      await logToolActivity("run_code", context, { metadata: { codeLength: input.code.length } });

      return {
        success: result.success,
        stdout: (result.stdout || "").slice(0, MAX_OUTPUT_LENGTH),
        stderr: (result.stderr || "").slice(0, MAX_OUTPUT_LENGTH),
        result: result.result?.slice(0, MAX_OUTPUT_LENGTH),
        error: result.error,
      };
    } catch (err) {
      await logToolActivity("run_code", context, { metadata: { error: true } });
      return {
        success: false,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err.message : "Code execution failed",
      };
    }
  },
});

function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    return isPrivateIP(mapped);
  }
  return false;
}

registerTool({
  name: "scrape_webpage",
  description: "Fetch a web page URL and extract its text content. Strips HTML tags and returns clean readable text. Every scrape is logged for compliance.",
  inputSchema: z.object({
    url: z.string().describe("The URL to scrape"),
    maxLength: z.number().optional().describe("Maximum characters to return (default 5000)"),
  }),
  execute: async (input, context: ToolContext) => {
    const maxLen = input.maxLength ?? 5000;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(input.url);
    } catch {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "invalid_url" } });
      return { success: false, error: "Invalid URL." };
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "invalid_protocol" } });
      return { success: false, error: "Only HTTP and HTTPS URLs are supported." };
    }

    const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".local") ||
        hostname.endsWith(".internal") || hostname === "metadata.google.internal") {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "blocked_hostname" } });
      return { success: false, error: "Scraping internal/private network addresses is not allowed." };
    }

    try {
      const dns = await import("node:dns");
      const { resolve4, resolve6 } = dns.promises;
      const ips: string[] = [];
      try {
        const v4 = await resolve4(hostname);
        ips.push(...v4);
      } catch {}
      try {
        const v6 = await resolve6(hostname);
        ips.push(...v6);
      } catch {}

      if (ips.length === 0) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "dns_failed" } });
        return { success: false, error: "Could not resolve hostname." };
      }

      const privateIp = ips.find(isPrivateIP);
      if (privateIp) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "private_ip", resolvedIp: privateIp } });
        return { success: false, error: "Scraping internal/private network addresses is not allowed." };
      }

      const response = await fetch(input.url, {
        headers: { "User-Agent": "GalaxyBots/1.0 (Web Scraper)" },
        signal: AbortSignal.timeout(15000),
        redirect: "manual",
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { denied: true, reason: "redirect_blocked", redirectTo: location } });
        return { success: false, error: "Redirects are not followed for security reasons. Target URL redirects to: " + (location || "unknown") };
      }
      if (!response.ok) {
        await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { httpStatus: response.status } });
        return { success: false, error: `HTTP ${response.status} from ${input.url}` };
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      $("script, style, nav, footer, header, noscript, iframe").remove();
      const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxLen);
      const title = $("title").text().trim();

      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { title, contentLength: text.length } });

      return { success: true, url: input.url, title, content: text };
    } catch (err) {
      await logToolActivity("scrape_webpage", context, { url: input.url, metadata: { error: true } });
      return { success: false, error: err instanceof Error ? err.message : "Failed to scrape webpage" };
    }
  },
});

const SABRINA_SUPABASE_URL = process.env.SABRINA_SUPABASE_URL ?? "https://fnrmbtzxuuzmydocnpux.supabase.co";
const SABRINA_ANON_KEY = process.env.SABRINA_ANON_KEY ?? "";

registerTool({
  name: "browse_sabrina_automations",
  description: "Search the Sabrina Automations public catalog for pre-built automation workflows. Returns matching automations with titles, descriptions, categories, platforms, and template download URLs. No credentials required.",
  inputSchema: z.object({
    keyword: z.string().optional().describe("Text to search for in automation title or description"),
    category: z.string().optional().describe("Filter by category (e.g. 'Marketing', 'Sales', 'Customer Support')"),
    platform: z.string().optional().describe("Filter by platform (e.g. 'n8n', 'make', 'zapier')"),
  }),
  execute: async (input, context: ToolContext) => {
    try {
      const params = new URLSearchParams();
      params.set("select", "id,title,description,categories,platform,tools_used,tutorial_url,template_url");
      params.set("limit", "10");

      if (input.keyword) {
        params.set("or", `(title.ilike.*${input.keyword}*,description.ilike.*${input.keyword}*)`);
      }
      if (input.category) {
        params.set("categories", `cs.{${input.category}}`);
      }
      if (input.platform) {
        params.set("platform", `eq.${input.platform}`);
      }

      const url = `${SABRINA_SUPABASE_URL}/rest/v1/automations?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          apikey: SABRINA_ANON_KEY,
          Authorization: `Bearer ${SABRINA_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const errText = await response.text();
        await logToolActivity("browse_sabrina_automations", context, {
          metadata: { keyword: input.keyword, category: input.category, platform: input.platform, httpStatus: response.status, error: true },
        });
        return { success: false, automations: [], error: `Sabrina API error: ${response.status} - ${errText}` };
      }

      const automations = await response.json() as Array<{
        id: string;
        title: string;
        description: string;
        categories: string[];
        platform: string;
        tools_used: string[];
        tutorial_url: string | null;
        template_url: string | null;
      }>;

      await logToolActivity("browse_sabrina_automations", context, {
        metadata: { keyword: input.keyword, category: input.category, platform: input.platform, resultCount: automations.length },
      });

      return { success: true, automations };
    } catch (err) {
      await logToolActivity("browse_sabrina_automations", context, {
        metadata: { keyword: input.keyword, category: input.category, platform: input.platform, error: true },
      });
      return { success: false, automations: [], error: err instanceof Error ? err.message : "Failed to browse Sabrina automations" };
    }
  },
});

registerTool({
  name: "download_sabrina_automation",
  description: "Download and return the JSON workflow file for a specific Sabrina automation. Use the template_url from browse_sabrina_automations results.",
  inputSchema: z.object({
    template_url: z.string().describe("The template_url of the automation to download (from browse_sabrina_automations output)"),
  }),
  execute: async (input, context: ToolContext) => {
    const allowedPrefix = `${SABRINA_SUPABASE_URL}/storage/`;
    if (!input.template_url.startsWith(allowedPrefix)) {
      return { success: false, error: `Invalid template URL. Must start with ${allowedPrefix}` };
    }

    try {
      const response = await fetch(input.template_url, {
        headers: {
          apikey: SABRINA_ANON_KEY,
          Authorization: `Bearer ${SABRINA_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        await logToolActivity("download_sabrina_automation", context, {
          url: input.template_url,
          metadata: { httpStatus: response.status, error: true },
        });
        return { success: false, error: `Failed to download template: HTTP ${response.status}` };
      }

      const content = await response.json();

      await logToolActivity("download_sabrina_automation", context, {
        url: input.template_url,
        metadata: { contentSize: JSON.stringify(content).length },
      });

      return { success: true, template_url: input.template_url, workflow: JSON.stringify(content) };
    } catch (err) {
      await logToolActivity("download_sabrina_automation", context, {
        url: input.template_url,
        metadata: { error: true },
      });
      return { success: false, error: err instanceof Error ? err.message : "Failed to download automation template" };
    }
  },
});

registerTool({
  name: "create_studio_document",
  description: "Create a document in the Document Studio. This saves the document in-platform where the user can view, edit, and export it.",
  inputSchema: z.object({
    title: z.string().describe("Document title"),
    content: z.string().describe("Document content (plain text or markdown)"),
    department: z.string().optional().describe("Department the document belongs to"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) {
      return { success: false, error: "No client context available" };
    }

    const tiptapContent = {
      type: "doc",
      content: input.content.split("\n").map((line: string) => {
        if (line.startsWith("# ")) {
          return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: line.slice(2) }] };
        }
        if (line.startsWith("## ")) {
          return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: line.slice(3) }] };
        }
        if (line.startsWith("### ")) {
          return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: line.slice(4) }] };
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: line.slice(2) }] }] }],
          };
        }
        return { type: "paragraph", content: line ? [{ type: "text", text: line }] : [] };
      }),
    };

    try {
      const [doc] = await db.insert(documentsTable).values({
        clientId: context.clientId,
        title: input.title,
        content: tiptapContent,
        botId: context.botId ?? null,
        sessionId: context.sessionId ? parseInt(String(context.sessionId)) : null,
        department: input.department ?? null,
        status: "draft",
        versionHistory: [],
        currentVersion: 1,
      }).returning();

      await logToolActivity("create_studio_document", context, {
        metadata: { documentId: doc.id, title: input.title },
      });

      return { success: true, documentId: doc.id, title: input.title, message: `Document "${input.title}" created in Document Studio` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create document" };
    }
  },
});

registerTool({
  name: "bingolingo_create_content",
  description: "Generate AI-powered content via BingoLingo. Creates a blog post, LinkedIn article, Twitter/X thread, email newsletter, press release, or case study for the client. Requires the client to have a BingoLingo API key configured in Integrations.",
  inputSchema: z.object({
    contentType: z.enum(["blog", "linkedin", "twitter", "email", "press_release", "case_study"]).describe("Type of content to generate"),
    topic: z.string().describe("The topic or subject for the content"),
    tone: z.enum(["professional", "conversational", "thought_leadership", "educational", "bold"]).optional().describe("Writing tone (default: professional)"),
    keywords: z.array(z.string()).optional().describe("Optional keywords to incorporate into the content"),
  }),
  execute: async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BingoLingo-Key": apiKey,
        },
        body: JSON.stringify({
          contentType: input.contentType,
          topic: input.topic,
          tone: input.tone,
          keywords: input.keywords,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json();
      await logToolActivity("bingolingo_create_content", context, { metadata: { contentId: content.id, contentType: input.contentType, topic: input.topic } });
      return { success: true, content, message: `${input.contentType} content created as draft: "${content.title}"` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create BingoLingo content" };
    }
  },
});

registerTool({
  name: "bingolingo_publish",
  description: "Publish a draft piece of content on BingoLingo. Changes the status from draft to published and makes it visible on the client's public content hub.",
  inputSchema: z.object({
    contentId: z.number().describe("The ID of the BingoLingo content to publish"),
  }),
  execute: async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/publish`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BingoLingo-Key": apiKey,
        },
        body: JSON.stringify({ contentId: input.contentId }),
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json();
      await logToolActivity("bingolingo_publish", context, { metadata: { contentId: input.contentId } });
      return { success: true, content, message: `Content "${content.title}" published successfully` };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to publish BingoLingo content" };
    }
  },
});

registerTool({
  name: "bingolingo_list_content",
  description: "List content pieces from BingoLingo for the client. Filter by status (draft/published/archived) or content type.",
  inputSchema: z.object({
    status: z.enum(["draft", "published", "archived"]).optional().describe("Filter by content status"),
    type: z.enum(["blog", "linkedin", "twitter", "email", "press_release", "case_study"]).optional().describe("Filter by content type"),
  }),
  execute: async (input, context: ToolContext) => {
    const apiKey = await getClientCredential(context.clientId, "bingolingo");
    if (!apiKey) {
      return { success: false, error: "No BingoLingo API key configured. Connect BingoLingo in Integrations settings." };
    }
    try {
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3000}`;
      const params = new URLSearchParams();
      if (input.status) params.set("status", input.status);
      if (input.type) params.set("type", input.type);
      const response = await fetch(`${baseUrl}/api/bingolingo/ext/content?${params.toString()}`, {
        headers: { "X-BingoLingo-Key": apiKey },
      });
      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `BingoLingo API error: ${response.status} - ${err}` };
      }
      const content = await response.json();
      await logToolActivity("bingolingo_list_content", context, { metadata: { count: content.length, filters: input } });
      return { success: true, content, count: content.length };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to list BingoLingo content" };
    }
  },
});

registerTool({
  name: "read_sheet",
  description: "Read rows from a Google Sheet using the client's connected Google Sheets OAuth token. Returns an array of row arrays.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (found in the sheet URL)"),
    range: z.string().describe("A1 notation range to read (e.g. 'Sheet1!A1:D10')"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, rows: [], error: "No Google Sheets credential configured for this client. Connect Google Sheets in Integrations settings." };
    }
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, rows: [], error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { values?: string[][] };
      const rows = data.values ?? [];
      return { success: true, rows, rowCount: rows.length };
    } catch (err) {
      return { success: false, rows: [], error: err instanceof Error ? err.message : "Failed to read Google Sheet" };
    }
  },
});

registerTool({
  name: "write_sheet",
  description: "Append or update rows in a Google Sheet using the client's connected Google Sheets OAuth token.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (found in the sheet URL)"),
    range: z.string().describe("A1 notation range to write to (e.g. 'Sheet1!A1')"),
    rows: z.array(z.array(z.string())).describe("Array of row arrays to write (each row is an array of cell values)"),
    append: z.boolean().optional().describe("If true, append rows after existing data. If false, overwrite starting at the range. Defaults to true."),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, error: "No Google Sheets credential configured for this client. Connect Google Sheets in Integrations settings." };
    }
    const shouldAppend = input.append !== false;
    try {
      let url: string;
      let method: string;
      if (shouldAppend) {
        url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        method = "POST";
      } else {
        url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}?valueInputOption=USER_ENTERED`;
        method = "PUT";
      }
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ range: input.range, majorDimension: "ROWS", values: input.rows }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { updates?: { updatedRows?: number } };
      const updatedRows = data.updates?.updatedRows ?? input.rows.length;
      return { success: true, message: `${shouldAppend ? "Appended" : "Wrote"} ${updatedRows} row(s) to ${input.range}`, updatedRows };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to write to Google Sheet" };
    }
  },
});

registerTool({
  name: "send_sms",
  description: "Send an SMS message via Twilio using the client's connected Twilio credential. The credential must be a JSON string with accountSid and authToken fields.",
  inputSchema: z.object({
    to: z.string().describe("Recipient phone number in E.164 format (e.g. +15551234567)"),
    from: z.string().describe("Sender phone number in E.164 format — must be a Twilio number on the account (e.g. +15559876543)"),
    body: z.string().describe("SMS message body text"),
  }),
  execute: async (input, context: ToolContext) => {
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
  },
});
