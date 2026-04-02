import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBotTools } from "./bots.js";
import { registerClientTools } from "./clients.js";
import { registerMessagingTool } from "./messaging.js";
import { registerTaskAnalysisTool } from "./task-analysis.js";
import { registerTaskSessionTools } from "./task-sessions.js";
import { registerMemorySearchTool } from "./memory-search.js";
import { registerWebSearchTool } from "./web-search.js";
import { registerHttpFetchTool } from "./http-fetch.js";
import { registerEmailTool } from "./email.js";
import { registerMetricsTool } from "./metrics.js";
import { registerAuditLogTool } from "./audit-log.js";
import { registerKnowledgeTools } from "./knowledge.js";
import {
  registerPirateMonsterAllTools,
  registerPirateMonsterGalaxyBotsTools,
  type McpSessionContext,
} from "./piratemonster.js";
import {
  registerRequestDemoTool,
  registerCalculateRoiTool,
  registerGetPricingRecommendationTool,
  registerGenerateRoiReportTool,
  registerSocialProofResource,
} from "./gtm.js";
import { registerPdfTools } from "./pdf.js";

function makeFilteredServer(server: McpServer, allowedTools: string[]): McpServer {
  const toolSet = new Set(allowedTools);
  const proxy = new Proxy(server, {
    get(target, prop) {
      if (prop !== "tool") return (target as unknown as Record<string | symbol, unknown>)[prop];
      return function filteredTool(
        name: string,
        ...rest: unknown[]
      ) {
        if (!toolSet.has(name)) return;
        return (target.tool as Function).call(target, name, ...rest);
      };
    },
  }) as McpServer;
  return proxy;
}

export function registerAllTools(
  server: McpServer,
  callerType: "galaxybots" | "piratemonster" | "oauth" = "galaxybots",
  sessionCtx: McpSessionContext = { partnerKeyId: null, rateLimit: Infinity }
): void {
  console.log(`[MCP] Registering tools for caller type: ${callerType}`);

  registerSocialProofResource(server);

  if (callerType === "piratemonster") {
    registerPirateMonsterAllTools(server, sessionCtx);
    registerRequestDemoTool(server, sessionCtx);
    registerCalculateRoiTool(server, sessionCtx);
    registerGetPricingRecommendationTool(server, sessionCtx);
    registerGenerateRoiReportTool(server, sessionCtx);
    console.log("[MCP] PirateMonster + GTM tools registered successfully");
    return;
  }

  const allowedTools = sessionCtx.allowedTools;
  const effectiveServer = allowedTools !== null && allowedTools !== undefined
    ? makeFilteredServer(server, allowedTools)
    : server;

  registerBotTools(effectiveServer);
  registerClientTools(effectiveServer);
  registerMessagingTool(effectiveServer);
  registerTaskAnalysisTool(effectiveServer);
  registerTaskSessionTools(effectiveServer);
  registerMemorySearchTool(effectiveServer);
  registerWebSearchTool(effectiveServer);
  registerHttpFetchTool(effectiveServer);
  registerEmailTool(effectiveServer);
  registerMetricsTool(effectiveServer);
  registerAuditLogTool(effectiveServer);
  registerKnowledgeTools(effectiveServer);
  registerPdfTools(effectiveServer);
  registerRequestDemoTool(effectiveServer, sessionCtx);
  registerCalculateRoiTool(effectiveServer, sessionCtx);
  registerGetPricingRecommendationTool(effectiveServer, sessionCtx);
  registerGenerateRoiReportTool(effectiveServer, sessionCtx);

  if (callerType === "oauth") {
    registerPirateMonsterAllTools(effectiveServer, sessionCtx);
    if (allowedTools !== null && allowedTools !== undefined) {
      console.log(`[MCP] OAuth tools registered with scope filter: [${allowedTools.join(", ")}] (${allowedTools.length} allowed)`);
    } else {
      console.log("[MCP] OAuth tools registered (all GalaxyBots + all PirateMonster + GTM tools)");
    }
  } else {
    registerPirateMonsterGalaxyBotsTools(effectiveServer, sessionCtx);
    if (allowedTools !== null && allowedTools !== undefined) {
      console.log(`[MCP] Tools registered with scope filter: [${allowedTools.join(", ")}] (${allowedTools.length} tools)`);
    } else {
      console.log("[MCP] All tools registered successfully (GalaxyBots + pm_get_score + pm_get_recommendations + GTM)");
    }
  }
}

interface ToolManifestEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function getToolManifest(): ToolManifestEntry[] {
  return [
    {
      name: "list_bots",
      description: "List all GalaxyBots AI bots with their name, title, department, and description.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_bot",
      description: "Get full details of a specific GalaxyBots bot by ID (integer) or name (case-insensitive string match).",
      inputSchema: {
        type: "object",
        properties: {
          identifier: { type: ["number", "string"], description: "Bot ID (number) or bot name (string, case-insensitive)" },
        },
        required: ["identifier"],
      },
    },
    {
      name: "list_clients",
      description: "List all GalaxyBots clients with company name, industry, services, and target market. Requires admin scope.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_client",
      description: "Get a specific client's full business profile by ID. Returns company name, industry, services, target market, website, and business context.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Client ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_message_to_bot",
      description: "Send a message to a GalaxyBots bot in a conversation and receive its AI response. Supports progressToken for streaming chunk updates.",
      inputSchema: {
        type: "object",
        properties: {
          botId: { type: "number", description: "The bot ID to send the message to" },
          message: { type: "string", description: "The message content to send to the bot" },
          conversationId: { type: "number", description: "Optional existing conversation ID." },
          progressToken: { type: ["string", "number"], description: "Optional MCP progress token for streaming updates" },
        },
        required: ["botId", "message"],
      },
    },
    {
      name: "analyze_task",
      description: "Submit a business objective to Optima Prime and receive a team proposal. Supports progressToken for streaming updates.",
      inputSchema: {
        type: "object",
        properties: {
          objective: { type: "string", description: "The business objective or task to analyze" },
          progressToken: { type: ["string", "number"], description: "Optional MCP progress token for streaming updates" },
        },
        required: ["objective"],
      },
    },
    {
      name: "create_task_session",
      description: "Create a Task Room with a specified objective and list of bot IDs. Returns the created session with its team.",
      inputSchema: {
        type: "object",
        properties: {
          objective: { type: "string", description: "The task or objective for the session" },
          botIds: { type: "array", items: { type: "number" }, description: "Array of bot IDs to include in the session" },
        },
        required: ["objective", "botIds"],
      },
    },
    {
      name: "list_task_sessions",
      description: "List recent task sessions with their ID, objective, status, team size, and creation date.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max sessions to return (default 10)" },
        },
      },
    },
    {
      name: "memory_search",
      description: "Search bot memory for relevant past conversations, facts, and context.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "web_search",
      description: "Search the web for current information.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "http_fetch",
      description: "Fetch content from an external HTTP/HTTPS URL.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri", description: "URL to fetch" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method (default GET)" },
        },
        required: ["url"],
      },
    },
    {
      name: "send_email",
      description: "Send an email via the platform. Requires sender, recipient, subject, and body.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", format: "email", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (plain text or HTML)" },
          from: { type: "string", format: "email", description: "Sender email address (optional, defaults to platform address)" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "get_metrics",
      description: "Retrieve subscription and revenue metrics scoped to a client. Returns subscription count and MRR.",
      inputSchema: {
        type: "object",
        properties: {
          clientId: { type: "number", description: "Client ID to scope metrics to" },
        },
        required: ["clientId"],
      },
    },
    {
      name: "log_decision",
      description: "Record an AI action or decision to the audit log. Use requiresReview flag to mark low-confidence decisions for human review.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "Description of the action or decision taken" },
          context: { type: "string", description: "Additional context or reasoning" },
          requiresReview: { type: "boolean", description: "Whether this decision requires human review" },
        },
        required: ["action"],
      },
    },
    {
      name: "pm_get_score",
      description: "Get the Cloud 9 AEO score for a URL, including overall score (0-100), citation count, per-engine breakdown across 9 AI engines.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri", description: "The URL to get the AEO score for" },
        },
        required: ["url"],
      },
    },
    {
      name: "pm_request_scan",
      description: "Queue a new AEO scan for a URL. Emits progress notifications when progressToken is provided.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri", description: "The URL to scan" },
          progressToken: { type: ["string", "number"], description: "Optional MCP progress token for streaming scan progress" },
        },
        required: ["url"],
      },
    },
    {
      name: "pm_compare_urls",
      description: "Compare AEO scores side-by-side for 2-5 URLs. Supports progressToken for streaming updates.",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string", format: "uri" }, minItems: 2, maxItems: 5, description: "2-5 URLs to compare" },
          progressToken: { type: ["string", "number"], description: "Optional MCP progress token for streaming updates" },
        },
        required: ["urls"],
      },
    },
    {
      name: "pm_get_recommendations",
      description: "Get structured AEO improvement recommendations for a URL, based on stored scan data. Results are cached for 24 hours.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri", description: "The URL to get recommendations for" },
        },
        required: ["url"],
      },
    },
    {
      name: "pm_get_scan_status",
      description: "Check the status of a scan request by its request ID.",
      inputSchema: {
        type: "object",
        properties: {
          requestId: { type: "number", description: "The scan request ID to check" },
        },
        required: ["requestId"],
      },
    },
    {
      name: "request_demo",
      description: "Book a live demo with the GalaxyBots team. Provide your name, email, company, and an optional message.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Your full name" },
          email: { type: "string", format: "email", description: "Your work email address" },
          company: { type: "string", description: "Your company name" },
          message: { type: "string", description: "Optional: your use case or questions" },
        },
        required: ["name", "email", "company"],
      },
    },
    {
      name: "calculate_roi",
      description: "Calculate ROI of GalaxyBots AI Directors vs. human executives. Returns annual savings, savings percentage, cost multiple, and recommended tier.",
      inputSchema: {
        type: "object",
        properties: {
          num_directors: { type: "number", description: "Number of AI Directors needed (1-51)" },
          human_salary_per_director: { type: "number", description: "Average annual salary per human executive (default: $250,000)" },
        },
        required: ["num_directors"],
      },
    },
    {
      name: "get_pricing_recommendation",
      description: "Get a GalaxyBots subscription tier recommendation based on company revenue, headcount, and white-label needs.",
      inputSchema: {
        type: "object",
        properties: {
          company_revenue: { type: "number", description: "Annual company revenue in USD" },
          employee_count: { type: "number", description: "Total number of employees" },
          need_white_label: { type: "boolean", description: "Whether you need white-label/reselling capabilities" },
        },
        required: ["company_revenue", "employee_count"],
      },
    },
    {
      name: "generate_roi_report",
      description: "Generate a shareable one-page ROI summary report from calculate_roi output. Returns a public URL to share with your board.",
      inputSchema: {
        type: "object",
        properties: {
          num_directors: { type: "number", description: "Number of AI Directors" },
          human_cost: { type: "number", description: "Annual human executive cost" },
          galaxybots_cost: { type: "number", description: "Annual GalaxyBots cost" },
          savings: { type: "number", description: "Annual savings" },
          tier: { type: "string", description: "Recommended GalaxyBots tier" },
          company_name: { type: "string", description: "Optional company name to personalize the report" },
        },
        required: ["num_directors", "human_cost", "galaxybots_cost", "savings", "tier"],
      },
    },
    {
      name: "get_cloud9_score_explanation",
      description: "Get a clear explanation of the Cloud 9 Score (AEO score) methodology, the 9 AI platforms scored, what good scores look like, and how to improve.",
      inputSchema: {
        type: "object",
        properties: {
          detail_level: { type: "string", enum: ["basic", "advanced"], description: "'basic' for high-level overview, 'advanced' for full methodology and optimization tactics" },
        },
        required: ["detail_level"],
      },
    },
    {
      name: "get_risk_details",
      description: "Get full details of a specific risk from the GalaxyBots strategic risk register, including category, likelihood, impact, mitigations, and status.",
      inputSchema: {
        type: "object",
        properties: {
          risk_id: { type: "string", description: "Risk ID (e.g., 'R001', 'R002')" },
        },
        required: ["risk_id"],
      },
    },
    {
      name: "get_directors_by_department",
      description: "Get all GalaxyBots AI Directors (bots) in a specific department. Uses live database data.",
      inputSchema: {
        type: "object",
        properties: {
          department: { type: "string", description: "Department name to filter by (e.g., 'Marketing', 'Finance', 'Operations', 'Technology')" },
        },
        required: ["department"],
      },
    },
    {
      name: "analyze_pdf",
      description: "Analyze a PDF document from a public URL using GalaxyBots AI intelligence. Returns document type, summary, key insights, action items, extracted entities, risk flags, sentiment, and a recommended GalaxyBots director to handle the document.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public HTTPS URL of the PDF document to analyze" },
          depth: { type: "string", enum: ["standard", "deep"], description: "Analysis depth: standard (faster) or deep (thorough)" },
        },
        required: ["url"],
      },
    },
    {
      name: "extract_pdf_data",
      description: "Extract specific structured fields from a PDF document. Provide a schema of fields to extract. Returns extracted values as structured JSON with confidence scores.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public HTTPS URL of the PDF document" },
          schema: { type: "object", description: 'Fields to extract. Key = field name, value = type hint. E.g. {"invoice_number":"string","total_amount":"number"}', additionalProperties: { type: "string" } },
        },
        required: ["url", "schema"],
      },
    },
    {
      name: "classify_pdf_document",
      description: "Quickly classify a PDF document by type and get a director routing recommendation. Faster than full analysis — use when you only need document type and routing.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public HTTPS URL of the PDF document" },
        },
        required: ["url"],
      },
    },
    {
      name: "batch_analyze_pdfs",
      description: "Analyze multiple PDF documents at once (up to 20). Each PDF is classified, summarized, and intelligence-extracted in parallel. Returns results array with success/error per document.",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" }, description: "Array of public HTTPS PDF URLs to analyze (max 20)" },
          depth: { type: "string", enum: ["standard", "deep"], description: "Analysis depth for all documents" },
        },
        required: ["urls"],
      },
    },
  ];
}
