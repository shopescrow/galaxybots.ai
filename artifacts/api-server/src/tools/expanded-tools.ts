import { z } from "zod";
import { registerTool, type ToolContext } from "./registry";
import { db, clientIntegrationsTable, toolActivityLogTable, sessionOutcomesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { isRateLimitError } from "@workspace/integrations-anthropic-ai/batch";
import pRetry from "p-retry";
import { decryptCredential } from "../utils/credential-encryption";
import { retrieveMemories } from "../services/memory";

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
  name: "consult_claude",
  description: "Send a prompt to Claude (claude-sonnet-4-6) for deep reasoning, strategic analysis, or long-form content generation. Use this when you need a second opinion, complex multi-step analysis, or high-quality drafts of documents, reports, or communications.",
  inputSchema: z.object({
    prompt: z.string().describe("The prompt or question to send to Claude"),
    systemPrompt: z.string().optional().describe("Optional system prompt to set Claude's context or role"),
  }),
  execute: async (input, context: ToolContext) => {
    try {
      await logToolActivity("consult_claude", context, { metadata: { promptLength: input.prompt.length } });
      const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: input.prompt },
      ];

      const response = await pRetry(
        async () => anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
          messages: chatMessages,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 10000,
          factor: 2,
          onFailedAttempt: (error) => {
            if (!isRateLimitError(error)) {
              throw new pRetry.AbortError(
                error instanceof Error ? error : new Error(String(error))
              );
            }
          },
        }
      );

      const textBlock = response.content.find((b: { type: string }) => b.type === "text");
      const responseText = textBlock && (textBlock as { type: string; text: string }).text || "";

      return {
        success: true,
        response: responseText,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to consult Claude" };
    }
  },
});

registerTool({
  name: "search_memory",
  description: "Search this bot's long-term memory for semantically relevant entries from past sessions. Use this to recall previous work, decisions, findings, or context from prior interactions with this client.",
  inputSchema: z.object({
    query: z.string().describe("The search query to find relevant memories"),
    limit: z.number().optional().describe("Maximum number of memory entries to return (default 5, max 20)"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.botId) {
      return { success: false, memories: [], error: "No bot context available for memory search." };
    }
    if (!context.clientId) {
      return { success: false, memories: [], error: "No client context available for memory search. Memory access requires a client session to ensure data isolation." };
    }
    try {
      await logToolActivity("search_memory", context, { metadata: { query: input.query } });
      const maxResults = Math.min(input.limit ?? 5, 20);
      const memories = await retrieveMemories({
        botId: context.botId,
        clientId: context.clientId,
        query: input.query,
        limit: maxResults,
      });
      return {
        success: true,
        memories: memories.map((m) => ({
          id: m.id,
          summary: m.summary,
          topic: m.topic,
          sourceType: m.sourceType,
          similarity: m.similarity,
          createdAt: m.createdAt,
        })),
        count: memories.length,
      };
    } catch (err) {
      return { success: false, memories: [], error: err instanceof Error ? err.message : "Failed to search memory" };
    }
  },
});

registerTool({
  name: "read_spreadsheet",
  description: "Read data from a Google Sheets spreadsheet. Returns the rows and cells in the specified range. Requires a Google Sheets credential configured in client integrations.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (from the URL: /d/{spreadsheetId}/edit)"),
    range: z.string().describe("The A1 notation range to read (e.g. 'Sheet1!A1:D100' or 'A1:Z50')"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, rows: [], error: "No Google Sheets credential configured for this client. Connect Google Sheets in the Integrations settings." };
    }
    try {
      await logToolActivity("read_spreadsheet", context, {
        url: `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}`,
        metadata: { range: input.range },
      });
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, rows: [], error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { values?: string[][] };
      return {
        success: true,
        rows: data.values ?? [],
        rowCount: (data.values ?? []).length,
        range: input.range,
      };
    } catch (err) {
      return { success: false, rows: [], error: err instanceof Error ? err.message : "Failed to read spreadsheet" };
    }
  },
});

registerTool({
  name: "write_spreadsheet",
  description: "Write data to a Google Sheets spreadsheet. Overwrites cells in the specified range with the provided values. Requires a Google Sheets credential configured in client integrations.",
  inputSchema: z.object({
    spreadsheetId: z.string().describe("The Google Sheets spreadsheet ID (from the URL: /d/{spreadsheetId}/edit)"),
    range: z.string().describe("The A1 notation range to write (e.g. 'Sheet1!A1:D5')"),
    values: z.array(z.array(z.string())).describe("2D array of values to write — rows, then columns (e.g. [['Name','Value'],['Alice','100']])"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "google_sheets");
    if (!credential) {
      return { success: false, error: "No Google Sheets credential configured for this client. Connect Google Sheets in the Integrations settings." };
    }
    try {
      await logToolActivity("write_spreadsheet", context, {
        url: `https://sheets.googleapis.com/v4/spreadsheets/${input.spreadsheetId}`,
        metadata: { range: input.range, rowCount: input.values.length },
      });
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}?valueInputOption=USER_ENTERED`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: input.range,
          majorDimension: "ROWS",
          values: input.values,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Google Sheets API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { updatedCells?: number; updatedRows?: number; updatedRange?: string };
      return {
        success: true,
        updatedCells: data.updatedCells ?? 0,
        updatedRows: data.updatedRows ?? 0,
        updatedRange: data.updatedRange ?? input.range,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to write spreadsheet" };
    }
  },
});

registerTool({
  name: "create_github_issue",
  description: "Create a GitHub issue in a repository. Use this to track engineering tasks, bugs, or feature requests. Requires a GitHub credential configured in client integrations.",
  inputSchema: z.object({
    repo: z.string().describe("Repository in 'owner/repo' format (e.g. 'acme-corp/my-app')"),
    title: z.string().describe("Issue title"),
    body: z.string().optional().describe("Issue body/description (markdown supported)"),
    labels: z.array(z.string()).optional().describe("Optional list of label names to apply"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "github");
    if (!credential) {
      return { success: false, error: "No GitHub credential configured for this client. Connect GitHub in the Integrations settings." };
    }
    try {
      await logToolActivity("create_github_issue", context, {
        url: `https://github.com/${input.repo}/issues`,
        metadata: { repo: input.repo, title: input.title },
      });
      const response = await fetch(`https://api.github.com/repos/${input.repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: input.title,
          body: input.body ?? "",
          labels: input.labels ?? [],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `GitHub API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { number: number; html_url: string; id: number };
      return {
        success: true,
        issueNumber: data.number,
        issueId: data.id,
        url: data.html_url,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to create GitHub issue" };
    }
  },
});

registerTool({
  name: "post_tweet",
  description: "Post a tweet/post on Twitter/X using the client's Twitter API v2 credential. Use this for marketing announcements, content publishing, and social media campaigns. Requires a Twitter credential configured in client integrations.",
  inputSchema: z.object({
    text: z.string().describe("Tweet text (max 280 characters)"),
  }),
  execute: async (input, context: ToolContext) => {
    const credential = await getClientCredential(context.clientId, "twitter");
    if (!credential) {
      return { success: false, error: "No Twitter/X credential configured for this client. Connect Twitter in the Integrations settings." };
    }
    if (input.text.length > 280) {
      return { success: false, error: `Tweet text is ${input.text.length} characters; Twitter limit is 280 characters.` };
    }
    try {
      await logToolActivity("post_tweet", context, { metadata: { textLength: input.text.length } });
      const response = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: input.text }),
      });
      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Twitter API error: ${response.status} - ${errText}` };
      }
      const data = await response.json() as { data?: { id: string; text: string } };
      return {
        success: true,
        tweetId: data.data?.id,
        text: data.data?.text,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to post tweet" };
    }
  },
});

registerTool({
  name: "get_roi_summary",
  description: "Query this client's ROI and session outcome data from the platform. Returns aggregated stats including total sessions, hours saved, top performing bots, and most-used tools. Use this for executive summaries, performance reports, and impact analysis.",
  inputSchema: z.object({
    limit: z.number().optional().describe("Number of recent sessions to include (default 50, max 200)"),
  }),
  execute: async (input, context: ToolContext) => {
    if (!context.clientId) {
      return { success: false, error: "No client context available for ROI summary." };
    }
    try {
      await logToolActivity("get_roi_summary", context);
      const maxRows = Math.min(input.limit ?? 50, 200);
      const rows = await db
        .select()
        .from(sessionOutcomesTable)
        .where(eq(sessionOutcomesTable.clientId, context.clientId))
        .orderBy(desc(sessionOutcomesTable.createdAt))
        .limit(maxRows);

      const totalSessions = rows.length;
      let totalHoursSaved = 0;
      let totalToolCalls = 0;
      const botCounts: Record<string, number> = {};
      const toolCounts: Record<string, number> = {};

      for (const row of rows) {
        totalHoursSaved += parseFloat(String(row.estimatedHoursSaved ?? "0"));
        totalToolCalls += row.toolsExecutedTotal ?? 0;

        if (Array.isArray(row.botsDeployed)) {
          for (const bot of row.botsDeployed as Array<{ botId: number; botName: string; department: string }>) {
            botCounts[bot.botName] = (botCounts[bot.botName] ?? 0) + 1;
          }
        }

        if (row.toolsExecuted && typeof row.toolsExecuted === "object") {
          for (const [toolName, callCount] of Object.entries(row.toolsExecuted as Record<string, number>)) {
            toolCounts[toolName] = (toolCounts[toolName] ?? 0) + (callCount as number);
          }
        }
      }

      const topBots = (Object.entries(botCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, sessions]) => ({ name, sessions }));

      const topTools = (Object.entries(toolCounts) as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, calls]) => ({ name, calls }));

      return {
        success: true,
        totalSessions,
        totalHoursSaved: Math.round(totalHoursSaved * 10) / 10,
        totalToolCalls,
        topBots,
        topTools,
        periodCovered: rows.length > 0 ? {
          from: rows[rows.length - 1]?.createdAt,
          to: rows[0]?.createdAt,
        } : null,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Failed to retrieve ROI summary" };
    }
  },
});
