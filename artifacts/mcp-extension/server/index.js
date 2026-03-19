#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.MCP_API_KEY || "";
const API_BASE = process.env.GALAXYBOTS_API_BASE || "https://galaxybots.ai/api";
const DEFAULT_DEPARTMENT = process.env.DEFAULT_DEPARTMENT || "Executive";

const authHeaders = API_KEY
  ? { "Authorization": `Bearer ${API_KEY}`, "Content-Type": "application/json" }
  : { "Content-Type": "application/json" };

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${errBody || res.statusText}`);
  }
  return res.json();
}

function toText(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toError(err) {
  return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
}

const server = new McpServer({
  name: "galaxybots-mcp",
  version: "1.0.0",
});

server.tool(
  "list_bots",
  "List all GalaxyBots AI Directors with their department, title, and description.",
  {},
  async () => {
    try { return toText(await apiGet("/bots")); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "get_bot",
  "Get the full profile of a specific AI Director by name or ID.",
  {
    identifier: z.union([z.string(), z.number()]).describe("Bot ID (number) or bot name (string, case-insensitive)"),
  },
  async ({ identifier }) => {
    try { return toText(await apiGet(`/bots/${encodeURIComponent(String(identifier))}`)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "send_message_to_bot",
  "Send a message to any AI Director and receive their expert response.",
  {
    botId: z.number().describe("The bot ID to send the message to"),
    message: z.string().describe("The message content to send to the bot"),
    conversationId: z.number().optional().describe("Optional existing conversation ID"),
  },
  async (args) => {
    try { return toText(await apiPost("/bots/message", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "analyze_task",
  "Submit a business objective to Optima Prime and receive a full team proposal.",
  {
    objective: z.string().describe("The business objective or task to analyze"),
  },
  async (args) => {
    try { return toText(await apiPost("/tasks/analyze", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "create_task_session",
  "Launch a Task Room with a defined objective and a selected team of AI Directors.",
  {
    objective: z.string().describe("The task or objective for the session"),
    botIds: z.array(z.number()).describe("Array of bot IDs to include in the session"),
  },
  async (args) => {
    try { return toText(await apiPost("/task-sessions", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "list_task_sessions",
  "View recent task sessions with status, team size, and objective.",
  {
    limit: z.number().optional().describe("Max sessions to return (default 10)"),
  },
  async ({ limit }) => {
    try { return toText(await apiGet(`/task-sessions?limit=${limit ?? 10}`)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "memory_search",
  "Search AI Director memory for past conversations, decisions, and context.",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results (default 10)"),
  },
  async (args) => {
    try { return toText(await apiPost("/memory/search", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "pm_get_score",
  "Get the Cloud 9 AEO score for any URL across 9 AI engines.",
  {
    url: z.string().url().describe("The URL to get the AEO score for"),
  },
  async ({ url }) => {
    try { return toText(await apiGet(`/aeo/score?url=${encodeURIComponent(url)}`)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "pm_request_scan",
  "Request a new AEO scan for a URL.",
  {
    url: z.string().url().describe("The URL to scan"),
  },
  async (args) => {
    try { return toText(await apiPost("/aeo/scan", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "pm_get_recommendations",
  "Retrieve AI-powered AEO improvement recommendations for a URL.",
  {
    url: z.string().url().describe("The URL to get recommendations for"),
  },
  async ({ url }) => {
    try { return toText(await apiGet(`/aeo/recommendations?url=${encodeURIComponent(url)}`)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "pm_compare_urls",
  "Compare AEO scores for 2-5 URLs side by side.",
  {
    urls: z.array(z.string().url()).min(2).max(5).describe("2-5 URLs to compare"),
  },
  async (args) => {
    try { return toText(await apiPost("/aeo/compare", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "calculate_roi",
  "Calculate ROI of GalaxyBots AI Directors versus human executive salaries.",
  {
    num_directors: z.number().describe("Number of AI Directors needed (1-51)"),
    human_salary_per_director: z.number().optional().describe("Average annual salary per human executive (default: $250,000)"),
  },
  async (args) => {
    try { return toText(await apiPost("/gtm/roi", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "get_pricing_recommendation",
  "Get the right GalaxyBots subscription tier for your company.",
  {
    company_revenue: z.number().describe("Annual company revenue in USD"),
    employee_count: z.number().describe("Total number of employees"),
    need_white_label: z.boolean().optional().describe("Whether you need white-label/reselling capabilities"),
  },
  async (args) => {
    try { return toText(await apiPost("/gtm/pricing", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "generate_roi_report",
  "Generate a shareable one-page ROI report for your board.",
  {
    num_directors: z.number().describe("Number of AI Directors"),
    human_cost: z.number().describe("Annual human executive cost"),
    galaxybots_cost: z.number().describe("Annual GalaxyBots cost"),
    savings: z.number().describe("Annual savings"),
    tier: z.string().describe("Recommended GalaxyBots tier"),
    company_name: z.string().optional().describe("Optional company name to personalize the report"),
  },
  async (args) => {
    try { return toText(await apiPost("/gtm/roi-report", args)); }
    catch (e) { return toError(e); }
  }
);

server.tool(
  "request_demo",
  "Book a live demo with the GalaxyBots team.",
  {
    name: z.string().describe("Your full name"),
    email: z.string().email().describe("Your work email address"),
    company: z.string().describe("Your company name"),
    message: z.string().optional().describe("Optional: your use case or questions"),
  },
  async (args) => {
    try { return toText(await apiPost("/gtm/demo", args)); }
    catch (e) { return toError(e); }
  }
);

const transport = new StdioServerTransport();

console.error(`[GalaxyBots] Starting local stdio MCP server`);
console.error(`[GalaxyBots] Default department: ${DEFAULT_DEPARTMENT}`);
console.error(`[GalaxyBots] API base: ${API_BASE}`);
if (!API_KEY) {
  console.error("[GalaxyBots] No MCP_API_KEY set — requests will be unauthenticated (trial mode applies)");
} else {
  console.error("[GalaxyBots] API key loaded — full access enabled");
}

await server.connect(transport);
