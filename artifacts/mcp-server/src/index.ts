import type http from "node:http";
import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerAllTools, getToolManifest } from "./tools/index.js";
import { db, platformApiKeysTable, mcpToolCallsTable, botsTable } from "@workspace/db";
import { eq, and, gt, sql } from "drizzle-orm";
import { buildOAuthRouter, verifyOAuthToken } from "./oauth.js";
import { RISK_REGISTER, CLOUD9_PLATFORMS, GALAXYBOTS_TIERS } from "./tools/knowledge.js";

let httpServer: http.Server | null = null;

process.on("uncaughtException", (err) => {
  console.error("[MCP] Uncaught exception — initiating graceful shutdown:", err);
  if (httpServer) {
    httpServer.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  console.error("[MCP] Unhandled rejection (keeping server alive):", reason);
});

const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.warn("[MCP] MCP_API_KEY not set; GalaxyBots env-key auth disabled. Only DB-backed partner keys will work.");
}

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const BASE_PATH = (process.env.BASE_PATH || "/__mcp").replace(/\/+$/, "");

const app = express();

const CORS_OPEN_PATHS = [
  `${BASE_PATH}/sse`,
  `${BASE_PATH}/messages`,
  "/.well-known/mcp.json",
  `${BASE_PATH}/tools`,
];

app.use((_req, res, next) => {
  const isCorsOpen = CORS_OPEN_PATHS.some(p => _req.path === p || _req.path.startsWith(p));
  if (isCorsOpen) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  if (_req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

const transports = new Map<string, SSEServerTransport>();

export interface ActiveSession {
  sessionId: string;
  clientName: string;
  connectedAt: Date;
  toolCallCount: number;
  callerType: "galaxybots" | "piratemonster" | "oauth";
  oauthClientId?: string;
  partnerKeyId: number | null;
}

const activeSessions = new Map<string, ActiveSession>();

interface AuthResult {
  callerType: "galaxybots" | "piratemonster" | "oauth";
  partnerKeyId: number | null;
  rateLimit: number;
  tokenHash: string;
  allowedTools: string[] | null;
  oauthScopes?: string[];
  oauthClientId?: string;
  oauthClientName?: string;
}

interface AuthenticatedRequest extends express.Request {
  authResult?: AuthResult;
}

type AuthenticateResult =
  | { ok: true; auth: AuthResult }
  | { ok: false; status: number; error: string };

const KNOWLEDGE_TOOLS = [
  "calculate_roi",
  "get_pricing_recommendation",
  "get_cloud9_score_explanation",
  "get_risk_details",
  "get_directors_by_department",
];

const SCOPE_TOOL_MAP: Record<string, string[]> = {
  "bots:read": ["list_bots", "get_bot", ...KNOWLEDGE_TOOLS],
  "bots:write": ["list_bots", "get_bot", "send_message_to_bot", "create_task_session", "list_task_sessions", "analyze_task", "memory_search", ...KNOWLEDGE_TOOLS],
  "clients:read": ["list_clients", "get_client", ...KNOWLEDGE_TOOLS],
  "aeo:read": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status", ...KNOWLEDGE_TOOLS],
  "aeo:write": ["pm_get_score", "pm_get_recommendations", "pm_compare_urls", "pm_get_scan_status", "pm_request_scan", ...KNOWLEDGE_TOOLS],
};

function scopesToAllowedTools(scopes: string[]): string[] {
  const tools = new Set<string>();
  for (const scope of scopes) {
    const mapped = SCOPE_TOOL_MAP[scope];
    if (mapped) {
      for (const t of mapped) tools.add(t);
    }
  }
  return tools.size > 0 ? Array.from(tools) : [];
}

async function authenticateToken(token: string): Promise<AuthenticateResult> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  if (MCP_API_KEY && token === MCP_API_KEY) {
    return { ok: true, auth: { callerType: "galaxybots", partnerKeyId: null, rateLimit: Infinity, tokenHash, allowedTools: null } };
  }

  const oauthResult = await verifyOAuthToken(token);
  if (oauthResult) {
    return {
      ok: true,
      auth: {
        callerType: "oauth",
        partnerKeyId: oauthResult.platformApiKeyId,
        rateLimit: oauthResult.rateLimitTier === "partner" ? 2000 : 1000,
        tokenHash,
        allowedTools: scopesToAllowedTools(oauthResult.scopes),
        oauthScopes: oauthResult.scopes,
        oauthClientId: oauthResult.oauthClientId,
      },
    };
  }

  try {
    const [key] = await db
      .select()
      .from(platformApiKeysTable)
      .where(
        and(
          eq(platformApiKeysTable.keyHash, tokenHash),
          eq(platformApiKeysTable.status, "active"),
          eq(platformApiKeysTable.platform, "piratemonster_mcp")
        )
      )
      .limit(1);

    if (!key) {
      return { ok: false, status: 401, error: "Invalid API key" };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ count: callCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mcpToolCallsTable)
      .where(
        and(
          eq(mcpToolCallsTable.partnerKeyId, key.id),
          gt(mcpToolCallsTable.calledAt, oneHourAgo)
        )
      );

    if (callCount >= key.rateLimit) {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }

    return {
      ok: true,
      auth: {
        callerType: "piratemonster",
        partnerKeyId: key.id,
        rateLimit: key.rateLimit,
        tokenHash,
        allowedTools: (key.allowedTools as string[] | null) ?? null,
      },
    };
  } catch (err) {
    console.error("[MCP] Auth DB lookup error:", err);
    return { ok: false, status: 500, error: "Authentication error" };
  }
}

const sessionAuthMap = new Map<string, AuthResult>();

const TRIAL_MAX_CALLS = 3;
const trialCallsMap = new Map<string, number>();

async function registerResourcesAndPrompts(server: McpServer): Promise<void> {
  const STRATEGIC_PLAN_SUMMARY = `# GalaxyBots.ai — 5-Year Strategic Plan Summary (2025–2030)

## Mission
Replace the traditional human C-suite with AI Directors that cost 4 cents on the dollar — making elite executive intelligence accessible to every business.

## Vision
By 2030, GalaxyBots AI Directors will manage 10,000+ companies worldwide, collectively overseeing $500B in enterprise value.

## Current State (2025)
- Platform launched with 51 specialized AI Directors across 8 departments
- Cloud 9 AEO Score: proprietary 9-engine AI visibility scoring system
- MCP-first architecture enabling Claude, Claude Desktop, and partner integrations
- Revenue: early-stage / pre-Series A

## Strategic Pillars

### 1. Product — AI Director Excellence
- Expand from 51 to 200+ specialized AI Directors by 2027
- Launch Task Room collaborative AI feature (multi-director projects)
- Achieve GPT-4-class reasoning for all Directors by Q3 2025
- White-label OEM program for agency resellers

### 2. Distribution — MCP & Partner Ecosystem
- Become the #1 MCP server for enterprise AI Director tools
- 500+ certified agency partners by 2026
- Integrations: Salesforce, HubSpot, Slack, Microsoft Teams, Google Workspace

### 3. Revenue — AEO Intelligence (PirateMonster)
- Cloud 9 Score becomes the standard AEO metric for digital marketers
- 10,000 PirateMonster subscribers at $999–$9,999/month by 2027
- Expand to 15 AI engines scored (from current 9)

### 4. Operations — AI-First Company
- GalaxyBots runs itself: 80% of internal operations managed by its own AI Directors
- Headcount capped at 50 humans; 1,000 AI equivalents
- SOC 2 Type II certification by Q3 2025

## Financial Projections
- 2025: $2M ARR (seed stage)
- 2026: $8M ARR (Series A)
- 2027: $25M ARR
- 2028: $60M ARR
- 2029: $120M ARR
- 2030: $250M ARR

## Pricing Tiers
- Starter: $999/month (up to 3 AI Directors)
- Pro: $4,999/month (up to 10 AI Directors)
- Scale: $9,999/month (up to 51 AI Directors + white-label)`;

  const STRATEGIC_PLAN_FULL = STRATEGIC_PLAN_SUMMARY + `

## Department Structure

### 1. Executive Suite
- CEO — Optima Prime: Chief orchestrator, strategy, team assembly
- CFO — Penny Ledger: Financial planning, forecasting, burn analysis
- COO — Ops Anchor: Operational excellence, process optimization
- CTO — Neural Nexus: Technology strategy, infrastructure
- CMO — Brand Blaze: Marketing strategy, brand positioning
- CHRO — Ember Heart: HR, culture, talent strategy
- CLO — Lex Cipher: Legal, compliance, IP protection
- CISO — Vault Viper: Security, risk management

### 2. Marketing & Growth
12 specialized directors: Content, SEO/AEO, Paid Ads, Social, Email, PR, Events, Product Marketing, Growth Hacking, Community, Partnerships, Brand Design

### 3. Sales & Revenue
8 directors: Sales Strategy, Account Executive, SDR, Sales Ops, Customer Success, Revenue Ops, Pricing, Proposal Writing

### 4. Finance & Accounting
7 directors: FP&A, Accounting, Tax, Investor Relations, Treasury, M&A, Payroll

### 5. Technology & Engineering
8 directors: Engineering, Architecture, Data, DevOps, QA, Security Engineering, API Design, Mobile

### 6. Operations
6 directors: Project Management, Procurement, Facilities, Vendor Management, Process Improvement, Logistics

### 7. Customer Experience
5 directors: Support, Success, Onboarding, Training, Community

### 8. Legal & Compliance
5 directors: Corporate Law, IP, Privacy, Employment Law, Regulatory

## Risk Register Summary
- R001: AI Model Dependency Risk (Technology) — Medium likelihood, High impact
- R002: AI Governance & Compliance Risk (Regulatory) — High likelihood, High impact
- R003: Competitive Displacement Risk (Market) — Medium likelihood, Medium impact
- R004: Data Breach / IP Exfiltration Risk (Security) — Low likelihood, Critical impact
- R005: Burn Rate & Runway Risk (Financial) — Low likelihood, High impact

## Key Metrics & KPIs
- AI Director Satisfaction Score (ADSS): target >4.5/5.0
- Time-to-First-Value: target <15 minutes (from signup to first bot response)
- Net Revenue Retention: target >120% (expansion from upsell)
- Cloud 9 Score Improvement: clients should see +15 points avg over 90 days
- MCP Tool Calls: 1M+ monthly by end of 2025`;

  server.resource(
    "strategic-plan-summary",
    "gifted://strategic-plan/summary",
    { mimeType: "text/markdown" },
    async () => ({
      contents: [{ uri: "gifted://strategic-plan/summary", mimeType: "text/markdown", text: STRATEGIC_PLAN_SUMMARY }],
    })
  );

  server.resource(
    "strategic-plan-full",
    "gifted://strategic-plan/full",
    { mimeType: "text/markdown" },
    async () => ({
      contents: [{ uri: "gifted://strategic-plan/full", mimeType: "text/markdown", text: STRATEGIC_PLAN_FULL }],
    })
  );

  server.resource(
    "directors-list",
    "gifted://directors/list",
    { mimeType: "application/json" },
    async () => {
      try {
        const bots = await db.select({
          id: botsTable.id,
          name: botsTable.name,
          title: botsTable.title,
          department: botsTable.department,
          description: botsTable.description,
          category: botsTable.category,
          isAvailable: botsTable.isAvailable,
        }).from(botsTable);

        return {
          contents: [{
            uri: "gifted://directors/list",
            mimeType: "application/json",
            text: JSON.stringify({ total: bots.length, directors: bots }, null, 2),
          }],
        };
      } catch (err) {
        console.error("[MCP] directors/list resource error:", err);
        return {
          contents: [{
            uri: "gifted://directors/list",
            mimeType: "application/json",
            text: JSON.stringify({ error: "Failed to load directors list", message: err instanceof Error ? err.message : String(err) }),
          }],
        };
      }
    }
  );

  server.resource(
    "products",
    "gifted://products",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "gifted://products",
        mimeType: "application/json",
        text: JSON.stringify({
          products: [
            {
              name: "GalaxyBots AI Directors",
              description: "51 specialized AI executives across 8 departments. Each Director has deep domain expertise, memory, and can collaborate in Task Rooms.",
              pricing: GALAXYBOTS_TIERS,
              key_features: [
                "51 specialized AI Directors (CEO, CFO, CMO, CTO, and 47 more)",
                "Task Room: multi-director collaboration on complex projects",
                "Memory: each Director remembers your business context",
                "MCP integration: use Directors in Claude, Claude Desktop, and any MCP client",
                "White-label: resell under your own brand (Scale plan)",
              ],
            },
            {
              name: "Cloud 9 AEO Score (PirateMonster)",
              description: "The definitive AI Engine Optimization score. Measures how visible your brand is across 9 major AI platforms (ChatGPT, Gemini, Perplexity, Claude, Copilot, You.com, Brave Leo, Mistral, Grok).",
              pricing: [
                { tier: "Starter", price: "$999/month", scans: "50 scans/month", features: ["9-engine scoring", "Recommendations", "API access"] },
                { tier: "Pro", price: "$4,999/month", scans: "500 scans/month", features: ["Everything in Starter", "Competitor tracking", "Webhooks", "White-label reports"] },
                { tier: "Scale", price: "$9,999/month", scans: "Unlimited", features: ["Everything in Pro", "Custom engines", "Dedicated support", "SLA guarantee"] },
              ],
              key_features: [
                "Score 0-100 measuring AI engine citations",
                "Per-engine breakdown across all 9 platforms",
                "Actionable optimization recommendations",
                "Historical trend tracking",
                "Webhook notifications for score changes",
              ],
            },
          ],
        }, null, 2),
      }],
    })
  );

  server.resource(
    "financials-projections",
    "gifted://financials/projections",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "gifted://financials/projections",
        mimeType: "application/json",
        text: JSON.stringify({
          currency: "USD",
          as_of: "2025-Q1",
          projections: [
            { year: 2025, arr: 2_000_000, mrr: 166_667, customers: 50, stage: "Seed / Pre-Series A", key_milestone: "MCP launch, PirateMonster beta" },
            { year: 2026, arr: 8_000_000, mrr: 666_667, customers: 200, stage: "Series A", key_milestone: "Agency partner program launch" },
            { year: 2027, arr: 25_000_000, mrr: 2_083_333, customers: 600, stage: "Series B", key_milestone: "200+ AI Directors, 10K AEO subscribers" },
            { year: 2028, arr: 60_000_000, mrr: 5_000_000, customers: 1_500, stage: "Growth", key_milestone: "SOC 2 Type II, enterprise contracts" },
            { year: 2029, arr: 120_000_000, mrr: 10_000_000, customers: 3_000, stage: "Pre-IPO", key_milestone: "International expansion" },
            { year: 2030, arr: 250_000_000, mrr: 20_833_333, customers: 6_000, stage: "IPO-ready", key_milestone: "$500B enterprise value managed" },
          ],
          unit_economics: {
            avg_arr_per_customer: 41_667,
            gross_margin_target: 0.82,
            cac_target: 3_500,
            ltv_target: 125_000,
            ltv_cac_ratio: 35.7,
            nrr_target: 1.20,
          },
          cost_structure: {
            ai_infrastructure: "35% of COGS",
            human_headcount: "capped at 50 FTE",
            sales_and_marketing: "20% of revenue",
            rd_investment: "25% of revenue",
          },
        }, null, 2),
      }],
    })
  );

  server.resource(
    "risk-register",
    "gifted://risk-register",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "gifted://risk-register",
        mimeType: "application/json",
        text: JSON.stringify({
          as_of: "2025-Q1",
          total_risks: Object.keys(RISK_REGISTER).length,
          risks: Object.values(RISK_REGISTER),
          note: "Use the get_risk_details tool with a risk_id for full details on any specific risk.",
        }, null, 2),
      }],
    })
  );

  server.resource(
    "roadmap",
    "gifted://roadmap",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "gifted://roadmap",
        mimeType: "application/json",
        text: JSON.stringify({
          as_of: "2025-Q1",
          quarters: [
            {
              quarter: "Q1 2025",
              status: "complete",
              items: [
                "MCP server launch with 15 core tools",
                "OAuth 2.0 PKCE authentication",
                "PirateMonster AEO score integration",
                "SSE streaming support for Claude Desktop",
              ],
            },
            {
              quarter: "Q2 2025",
              status: "in_progress",
              items: [
                "MCP Resources & Prompts (gifted:// URI scheme)",
                "Knowledge tools: ROI calculator, pricing recommender, Cloud 9 explainer",
                "Desktop Extension packaging for Claude Desktop",
                "SOC 2 Type II audit kickoff",
                "Agency white-label program beta",
              ],
            },
            {
              quarter: "Q3 2025",
              status: "planned",
              items: [
                "Task Room: multi-director real-time collaboration",
                "200+ AI Directors (from 51)",
                "Salesforce and HubSpot native integrations",
                "Mobile app launch (iOS + Android)",
                "SOC 2 Type II certification",
              ],
            },
            {
              quarter: "Q4 2025",
              status: "planned",
              items: [
                "Series A fundraise",
                "15 AI engines scored (from 9)",
                "Enterprise SSO (SAML 2.0)",
                "Custom Director builder (no-code)",
                "International expansion: UK, EU",
              ],
            },
            {
              quarter: "2026+",
              status: "vision",
              items: [
                "500+ agency partners",
                "Voice interface for AI Directors",
                "AI Director marketplace (third-party Directors)",
                "Autonomous Board of Directors feature",
                "IPO preparation",
              ],
            },
          ],
        }, null, 2),
      }],
    })
  );

  server.resource(
    "cloud9-platforms",
    "gifted://cloud9/platforms",
    { mimeType: "application/json" },
    async () => ({
      contents: [{
        uri: "gifted://cloud9/platforms",
        mimeType: "application/json",
        text: JSON.stringify({
          description: "The 9 AI platforms that make up the GalaxyBots Cloud 9 AEO Score",
          total_platforms: CLOUD9_PLATFORMS.length,
          platforms: CLOUD9_PLATFORMS,
          scoring_note: "Each platform is weighted by market share and citation impact. A perfect score of 100 means your brand is cited by all 9 engines for relevant queries.",
        }, null, 2),
      }],
    })
  );

  server.prompt(
    "introduce-directors",
    "Introduce me to the AI Directors — list all GalaxyBots AI Directors organized by department.",
    {},
    async () => {
      let directorsText = "Loading AI Directors...";
      try {
        const bots = await db.select({
          name: botsTable.name,
          title: botsTable.title,
          department: botsTable.department,
          description: botsTable.description,
        }).from(botsTable);

        const byDept: Record<string, typeof bots> = {};
        for (const bot of bots) {
          const dept = bot.department || "General";
          if (!byDept[dept]) byDept[dept] = [];
          byDept[dept].push(bot);
        }

        directorsText = Object.entries(byDept).map(([dept, deptBots]) =>
          `## ${dept}\n${deptBots.map(b => `- **${b.name}** (${b.title}): ${b.description ?? ""}`).join("\n")}`
        ).join("\n\n");
      } catch {
        directorsText = "Use the list_bots tool to see the full list of AI Directors.";
      }

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please introduce me to all of the GalaxyBots AI Directors. Here is the current roster organized by department:\n\n${directorsText}\n\nProvide a friendly, engaging introduction to each department and highlight 2-3 standout directors in each area.`,
          },
        }],
      };
    }
  );

  server.prompt(
    "calculate-roi",
    "Calculate the ROI of replacing human executives with GalaxyBots AI Directors.",
    {},
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `I want to understand the ROI of using GalaxyBots AI Directors instead of human executives. Please use the calculate_roi tool to run the numbers for a typical C-suite of 10 executives with an average salary of $250,000 each. Then explain the results in plain English, including the "4 cents on the dollar" framing. Also use get_pricing_recommendation with a company_revenue of $5,000,000 and employee_count of 50 to show me which plan would be recommended.`,
        },
      }],
    })
  );

  server.prompt(
    "strategic-plan",
    "What's the GalaxyBots 5-year strategic plan?",
    {},
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Please read the gifted://strategic-plan/full resource and give me a comprehensive overview of GalaxyBots.ai's 5-year strategic plan (2025-2030). Cover: the mission and vision, the four strategic pillars, the financial projections, the product roadmap, and the key risks. Format it in a clear, executive-level summary.`,
        },
      }],
    })
  );

  server.prompt(
    "cloud9-score",
    "Get my AEO / Cloud 9 Score — explain what it is and how to improve it.",
    {},
    async () => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `I want to understand my brand's AI Engine Optimization (AEO) score using the GalaxyBots Cloud 9 Score system. Please: 1) Use the get_cloud9_score_explanation tool with detail_level "advanced" to explain the Cloud 9 Score methodology in full, 2) Explain which of the 9 AI platforms matter most and why, 3) Give me a practical action plan for improving my score over the next 90 days. Also read the gifted://cloud9/platforms resource for the full platform details.`,
        },
      }],
    })
  );

  console.log("[MCP] Resources and prompts registered successfully");
}

function authenticate(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <API_KEY>" });
    return;
  }
  const token = authHeader.slice(7);

  authenticateToken(token).then((result) => {
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    req.authResult = result.auth;
    next();
  }).catch((err) => {
    console.error("[MCP] Auth error:", err);
    res.status(500).json({ error: "Authentication error" });
  });
}

function authenticateOptional(req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = authHeader.slice(7);
  authenticateToken(token).then((result) => {
    if (result.ok) {
      req.authResult = result.auth;
    }
    next();
  }).catch(() => {
    next();
  });
}

app.get(`${BASE_PATH}/sse`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
  console.log("[MCP] New SSE connection request");

  const isTrial = !req.authResult;
  const authResult: AuthResult = req.authResult ?? {
    callerType: "piratemonster",
    partnerKeyId: null,
    rateLimit: TRIAL_MAX_CALLS,
    tokenHash: "",
    allowedTools: ["request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report"],
  };

  const sessionCtx = {
    partnerKeyId: authResult.partnerKeyId,
    rateLimit: authResult.rateLimit,
    allowedTools: authResult.allowedTools,
  };

  const server = new McpServer({
    name: "galaxybots-mcp",
    version: "1.0.0",
  });

  try {
    registerAllTools(server, authResult.callerType, sessionCtx);
    await registerResourcesAndPrompts(server);
  } catch (err) {
    console.error("[MCP] Error registering tools:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to initialize MCP session" });
    }
    return;
  }

  const transport = new SSEServerTransport(`${BASE_PATH}/messages`, res);
  transports.set(transport.sessionId, transport);
  sessionAuthMap.set(transport.sessionId, authResult);

  if (isTrial) {
    trialCallsMap.set(transport.sessionId, 0);
    console.log(`[MCP] Trial session started: ${transport.sessionId} (max ${TRIAL_MAX_CALLS} calls)`);
  }

  const clientName = isTrial
    ? "Trial (unauthenticated)"
    : authResult.oauthClientId
    ? `OAuth:${authResult.oauthClientId}`
    : authResult.callerType === "galaxybots"
    ? "GalaxyBots Internal"
    : `PM Key ${authResult.partnerKeyId}`;

  const sessionInfo: ActiveSession = {
    sessionId: transport.sessionId,
    clientName,
    connectedAt: new Date(),
    toolCallCount: 0,
    callerType: authResult.callerType,
    oauthClientId: authResult.oauthClientId,
    partnerKeyId: authResult.partnerKeyId,
  };
  activeSessions.set(transport.sessionId, sessionInfo);

  res.on("close", () => {
    console.log(`[MCP] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
    sessionAuthMap.delete(transport.sessionId);
    activeSessions.delete(transport.sessionId);
    trialCallsMap.delete(transport.sessionId);
  });

  console.log(`[MCP] SSE connection established: ${transport.sessionId} (caller: ${isTrial ? "trial" : authResult.callerType})`);
  try {
    await server.connect(transport);
  } catch (err) {
    console.error(`[MCP] Error connecting transport for session ${transport.sessionId}:`, err);
    transports.delete(transport.sessionId);
    sessionAuthMap.delete(transport.sessionId);
    activeSessions.delete(transport.sessionId);
    trialCallsMap.delete(transport.sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post(`${BASE_PATH}/messages`, authenticateOptional, async (req: AuthenticatedRequest, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const sessionAuth = sessionAuthMap.get(sessionId);
  const isTrial = trialCallsMap.has(sessionId);

  if (isTrial) {
    const trialCalls = trialCallsMap.get(sessionId) ?? 0;
    if (trialCalls >= TRIAL_MAX_CALLS) {
      res.status(402).json({
        error: "trial_exhausted",
        message: `You have used all ${TRIAL_MAX_CALLS} free trial calls. Sign up for API access to continue.`,
        signup_url: "https://galaxybots.ai/api-access",
        booking_link: "https://calendly.com/galaxybots/demo",
        hint: "Use the `request_demo` tool to book a live demo and get full access.",
      });
      return;
    }
    trialCallsMap.set(sessionId, trialCalls + 1);
  } else {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer <API_KEY>" });
      return;
    }
    if (req.authResult && sessionAuth && sessionAuth.tokenHash && sessionAuth.tokenHash !== req.authResult.tokenHash) {
      res.status(403).json({ error: "Token mismatch: this session belongs to a different key" });
      return;
    }
    if (!req.authResult) {
      res.status(401).json({ error: "Invalid or expired API key" });
      return;
    }
  }

  const session = activeSessions.get(sessionId);
  if (session) {
    session.toolCallCount++;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error(`[MCP] Error handling message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get(`${BASE_PATH}`, (_req, res) => {
  const origin = `${_req.protocol}://${_req.get("host")}`;
  res.json({
    service: "GalaxyBots MCP Server",
    status: "online",
    version: "2025-03",
    description: "Model Context Protocol server providing AI executive bot tools for GalaxyBots.ai",
    endpoints: {
      sse:       `${origin}${BASE_PATH}/sse`,
      messages:  `${origin}${BASE_PATH}/messages`,
      tools:     `${origin}${BASE_PATH}/tools`,
      health:    `${origin}${BASE_PATH}/health`,
      oauth_authorize: `${origin}${BASE_PATH}/oauth/authorize`,
      oauth_token:     `${origin}${BASE_PATH}/oauth/token`,
      well_known:      `${origin}/.well-known/mcp.json`,
    },
    auth: ["bearer_token", "oauth2_pkce"],
    docs: "https://galaxybots.ai/mcp-docs",
  });
});

app.get(`${BASE_PATH}/health`, (_req, res) => {
  res.json({ status: "ok", service: "galaxybots-mcp" });
});

app.get(`${BASE_PATH}/tools`, (_req, res) => {
  res.json({
    tools: getToolManifest(),
    mcp_version: "2025-03",
    auth_methods: ["bearer", "oauth2_pkce"],
    scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
  });
});

app.get(`/.well-known/mcp.json`, (_req, res) => {
  const origin = process.env.APP_ORIGIN || "https://galaxybots.ai";
  res.json({
    name: "GalaxyBots.ai",
    description: "Multi-bot AI executive team with AEO intelligence",
    mcp_version: "2025-03",
    endpoints: {
      sse: `${origin}${BASE_PATH}/sse`,
      messages: `${origin}${BASE_PATH}/messages`,
      health: `${origin}${BASE_PATH}/health`,
      oauth_authorize: `${origin}${BASE_PATH}/oauth/authorize`,
      oauth_token: `${origin}${BASE_PATH}/oauth/token`,
    },
    tools_preview: ["list_bots", "send_message_to_bot", "pm_get_score", "pm_request_scan", "request_demo", "calculate_roi", "get_pricing_recommendation", "generate_roi_report", "get_cloud9_score_explanation", "get_risk_details", "get_directors_by_department"],
    resources: ["gifted://social-proof"],
    auth_methods: ["bearer", "oauth2_pkce"],
    scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
    trial: {
      enabled: true,
      free_calls: 3,
      signup_url: "https://galaxybots.ai/api-access",
    },
  });
});

app.get(`${BASE_PATH}/reports/:slug`, async (req, res) => {
  const { slug } = req.params;
  if (!slug || !/^[0-9a-f-]{36}$/.test(slug)) {
    res.status(400).json({ error: "Invalid report slug" });
    return;
  }

  const reportBucketPath = process.env.REPORT_OBJECT_PATH || process.env.PRIVATE_OBJECT_DIR || "";
  if (!reportBucketPath) {
    res.status(503).json({ error: "Report storage not configured" });
    return;
  }

  try {
    const REPLIT_SIDECAR = "http://127.0.0.1:1106";
    const parts = reportBucketPath.replace(/^\//, "").split("/");
    const bucketName = parts[0];
    const prefix = parts.slice(1).join("/");
    const objectName = prefix ? `${prefix}/reports/${slug}.md` : `reports/${slug}.md`;

    const signReq = await fetch(`${REPLIT_SIDECAR}/object-storage/signed-object-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "GET",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!signReq.ok) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const { signed_url: signedUrl } = await signReq.json() as { signed_url: string };
    const objRes = await fetch(signedUrl, { signal: AbortSignal.timeout(15_000) });
    if (!objRes.ok) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    const content = await objRes.text();
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(content);
  } catch (err) {
    console.error(`[MCP] Error serving report ${slug}:`, err);
    res.status(503).json({ error: "Report temporarily unavailable" });
  }
});

app.get(`${BASE_PATH}/sessions`, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !MCP_API_KEY || token !== MCP_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const sessions = Array.from(activeSessions.values()).map(s => ({
    sessionId: s.sessionId,
    clientName: s.clientName,
    connectedAt: s.connectedAt.toISOString(),
    toolCallCount: s.toolCallCount,
    callerType: s.callerType,
    oauthClientId: s.oauthClientId ?? null,
    partnerKeyId: s.partnerKeyId,
  }));
  res.json({ sessions, count: sessions.length });
});

const oauthRouter = buildOAuthRouter(BASE_PATH);
app.use(BASE_PATH, oauthRouter);

async function verifyDbConnection(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[MCP] Database connection verified");
    return true;
  } catch (err) {
    console.error("[MCP] Database connection failed:", err);
    return false;
  }
}

function tryListenOnPort(portToTry: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = app.listen(portToTry, () => {
      httpServer = server as unknown as http.Server;
      console.log(`[MCP] GalaxyBots MCP Server listening on port ${portToTry}`);
      console.log(`[MCP] SSE endpoint: ${BASE_PATH}/sse`);
      console.log(`[MCP] Messages endpoint: ${BASE_PATH}/messages`);
      console.log(`[MCP] OAuth authorize: ${BASE_PATH}/oauth/authorize`);
      console.log(`[MCP] OAuth token: ${BASE_PATH}/oauth/token`);
      console.log(`[MCP] Tool manifest: ${BASE_PATH}/tools`);
      console.log(`[MCP] Well-known: /.well-known/mcp.json`);
      resolve(true);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`[MCP] Port ${portToTry} already in use, trying next port...`);
        server.close();
        resolve(false);
      } else {
        console.error("[MCP] Server error:", err);
        server.close();
        resolve(false);
      }
    });
  });
}

async function startServer() {
  const dbOk = await verifyDbConnection();
  if (!dbOk) {
    console.error("[MCP] Cannot start: database connection failed");
    process.exit(1);
  }

  const candidatePorts = [port, port + 1, port + 2];
  let started = false;
  for (const p of candidatePorts) {
    started = await tryListenOnPort(p);
    if (started) break;
  }

  if (!started) {
    console.error(`[MCP] Could not bind to any port in [${candidatePorts.join(", ")}] — exiting`);
    process.exit(1);
  }
}

startServer().catch((err) => {
  console.error("[MCP] Fatal startup error:", err);
  process.exit(1);
});
