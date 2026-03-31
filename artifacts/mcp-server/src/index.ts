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
const SERVER_START_TIME = Date.now();
let totalToolCallsServed = 0;

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

function attachRateLimitHeaders(res: express.Response, auth: AuthResult): void {
  if (auth.rateLimit === Infinity) {
    res.setHeader("X-RateLimit-Limit", "unlimited");
    res.setHeader("X-RateLimit-Remaining", "unlimited");
  } else {
    res.setHeader("X-RateLimit-Limit", String(auth.rateLimit));
    res.setHeader("X-RateLimit-Policy", "1h");
  }
  res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + 3_600_000) / 1000)));
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
    attachRateLimitHeaders(res, result.auth);
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
    totalToolCallsServed++;
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
  interface EndpointDef {
    label: string;
    path: string;
    method: string;
    purpose: string;
    params: string[];
    returns: string;
    access: string;
    useWhen: string;
    noLink?: boolean;
    group: string;
  }
  const endpoints: EndpointDef[] = [
    {
      label: "SSE Stream", method: "GET", path: `${BASE_PATH}/sse`, group: "Core MCP",
      purpose: "Opens a persistent Server-Sent Events connection that establishes a live MCP session. The server pushes protocol messages, tool results, and streaming progress over this connection.",
      params: ["Authorization: Bearer <key> (optional — omit for trial mode, 3 free calls)", "No query parameters required; session ID is assigned automatically on connect"],
      returns: "text/event-stream — continuous MCP protocol event frames including endpoint announcements, tool responses, and streaming tokens",
      access: "Public (trial) or Bearer token / OAuth 2.0",
      useWhen: "Connecting Claude Desktop, Cursor, or any MCP-compatible AI client to GalaxyBots directors",
    },
    {
      label: "Messages", method: "POST", path: `${BASE_PATH}/messages`, group: "Core MCP",
      purpose: "Delivers a JSON-RPC tool-call message to an active SSE session. The AI client sends tool invocations here; responses flow back over the SSE stream. Must be paired with an open /sse connection.",
      params: ["?sessionId=<uuid> (required) — the session ID received from the SSE endpoint announcement", "Body: JSON-RPC 2.0 object with method, params, and id fields", "Authorization: Bearer <key> (must match the key used to open the SSE session)"],
      returns: "HTTP 202 Accepted — the actual tool result arrives asynchronously over the SSE stream",
      access: "Same token as the SSE session (token mismatch returns 403)",
      useWhen: "Used automatically by MCP clients (Claude, Cursor) — not called directly by humans",
      noLink: true,
    },
    {
      label: "Tool Manifest", method: "GET", path: `${BASE_PATH}/tools`, group: "Discovery",
      purpose: "Returns the full list of MCP tools available on this server, with name, description, and JSON Schema for each tool's input parameters. Supports keyword search and department filtering. Paginated.",
      params: ["?q=<string> — full-text search across tool names and descriptions (e.g. ?q=memory)", "?department=<name> — filter by department: bots, aeo, finance, knowledge, gtm, admin, search", "?page=<n> — page number (default 1)", "?limit=<n> — results per page (default 100, max 100)"],
      returns: "JSON with tools[], total count, page info, available departments, and auth metadata",
      access: "Public — no authentication required",
      useWhen: "Building integrations, generating SDKs, building a tool picker UI, or discovering what's available before connecting",
    },
    {
      label: "Capabilities", method: "GET", path: `${BASE_PATH}/capabilities`, group: "Discovery",
      purpose: "Returns exactly what the calling token is permitted to do — which tools are accessible, what OAuth scopes are active, the rate limit, caller type, and partner key ID. Use this to validate a key before making tool calls.",
      params: ["Authorization: Bearer <key> (required)"],
      returns: "JSON with caller_type, access_level, rate_limit, allowed_tools[], allowed_tool_count, total_tools, scopes, partner_key_id, oauth_client_id",
      access: "Any valid Bearer token or OAuth 2.0 access token",
      useWhen: "Onboarding a new API key, debugging a 403 error, or building a capabilities display in a partner dashboard",
      noLink: true,
    },
    {
      label: "Health Check", method: "GET", path: `${BASE_PATH}/health`, group: "Observability",
      purpose: "Live server health check. Performs a real database round-trip (SELECT 1) and returns runtime telemetry. Returns status 'ok' when all systems are healthy, 'degraded' if the database is unreachable.",
      params: ["No parameters required"],
      returns: "JSON with status, service, version, uptime (formatted + ms), active_sessions, tool_calls_served (this boot), database status, and ISO timestamp",
      access: "Public — no authentication required",
      useWhen: "Monitoring integrations, uptime checks, CI/CD readiness gates, or load balancer health probes",
    },
    {
      label: "Active Sessions", method: "GET", path: `${BASE_PATH}/sessions`, group: "Observability",
      purpose: "Returns a real-time list of all currently connected SSE sessions — who is connected, when they connected, how many tool calls they have made, and whether they authenticated via bearer token or OAuth.",
      params: ["Authorization: Bearer <admin-key> (required — MCP_API_KEY environment variable)"],
      returns: "JSON with sessions[] (sessionId, clientName, connectedAt, toolCallCount, callerType, partnerKeyId) and total count",
      access: "Admin only — requires the internal MCP_API_KEY",
      useWhen: "Auditing active connections, diagnosing stuck sessions, or monitoring concurrent partner usage",
      noLink: true,
    },
    {
      label: "Terminate Session", method: "DELETE", path: `${BASE_PATH}/sessions/{sessionId}`, group: "Observability",
      purpose: "Forcibly closes an active SSE session by ID. Removes the session from all internal maps, terminates the SSE transport, and logs the admin action. The client will receive a connection close event.",
      params: ["Path: {sessionId} — the UUID of the session to terminate (from GET /sessions)", "Authorization: Bearer <admin-key> (required)"],
      returns: "JSON with terminated: true and the sessionId that was closed",
      access: "Admin only — requires the internal MCP_API_KEY",
      useWhen: "Removing a misbehaving or unauthorized client, releasing a hung session, or enforcing a key revocation immediately",
      noLink: true,
    },
    {
      label: "OpenAPI 3.1 Spec", method: "GET", path: `${BASE_PATH}/openapi.json`, group: "Discovery",
      purpose: "Returns the complete OpenAPI 3.1 specification for this server — all endpoints, every MCP tool as a POST operation, full security scheme definitions (Bearer + OAuth2 PKCE), request/response schemas, and tagged groupings.",
      params: ["No parameters required"],
      returns: "JSON — OpenAPI 3.1.0 document with info, servers, security, components, and paths for all endpoints plus one path per tool",
      access: "Public — no authentication required",
      useWhen: "Importing into Postman or Insomnia, generating a typed SDK, feeding a developer portal, or building API documentation",
    },
    {
      label: "OAuth Authorize", method: "GET", path: `${BASE_PATH}/oauth/authorize`, group: "OAuth 2.0",
      purpose: "Step 1 of the OAuth 2.0 PKCE flow. Presents an authorization UI where the developer authenticates with their GalaxyBots Developer API key, reviews the requested scopes, and approves or denies the client application's access request.",
      params: ["?client_id=<string> (required) — registered OAuth client ID", "?redirect_uri=<url> (required) — must match the registered redirect URI", "?response_type=code (required)", "?code_challenge=<base64url> (required) — S256 PKCE challenge", "?code_challenge_method=S256 (recommended)", "?scope=<space-delimited> — e.g. bots:read bots:write aeo:read", "?state=<string> (recommended) — CSRF protection token"],
      returns: "HTML authorization page, then HTTP 302 redirect to redirect_uri with ?code= and ?state=",
      access: "Public — no authentication header required (developer authenticates via the UI)",
      useWhen: "Building a third-party integration that needs user-authorized access to GalaxyBots on behalf of a client",
    },
    {
      label: "OAuth Token", method: "POST", path: `${BASE_PATH}/oauth/token`, group: "OAuth 2.0",
      purpose: "Step 2 of the OAuth 2.0 PKCE flow. Exchanges an authorization code for an access token and refresh token. Also handles grant_type=refresh_token to issue new tokens when the access token expires (1 hour TTL).",
      params: ["Body (JSON or form-encoded): grant_type (authorization_code or refresh_token), code, redirect_uri, code_verifier, client_id, refresh_token (for refresh grant)"],
      returns: "JSON with access_token (RS256 JWT), token_type, expires_in (3600s), refresh_token, scope",
      access: "Public — no Authorization header (PKCE code_verifier serves as proof of possession)",
      useWhen: "After the user approves access in /oauth/authorize, exchange the code for tokens that can be used as Bearer tokens on /sse and /messages",
      noLink: true,
    },
    {
      label: "OAuth Revoke", method: "POST", path: `${BASE_PATH}/oauth/revoke`, group: "OAuth 2.0",
      purpose: "Immediately invalidates an access token or refresh token (RFC 7009). The token is marked revoked in the database; subsequent uses are rejected even if the JWT signature is still cryptographically valid.",
      params: ["Body (JSON or form-encoded): token (required) — the access or refresh token to revoke", "token_type_hint: access_token or refresh_token (optional, helps route the lookup)"],
      returns: "JSON with revoked: true (always returns 200 even if token was not found — per RFC 7009)",
      access: "Public — no Authorization header required",
      useWhen: "Logging a user out, responding to a key compromise, rotating tokens, or cleaning up after a session ends",
      noLink: true,
    },
    {
      label: "OAuth JWKS", method: "GET", path: `${BASE_PATH}/oauth/jwks`, group: "OAuth 2.0",
      purpose: "Returns the JSON Web Key Set containing the server's RSA public key used to sign all access tokens. Partners can fetch this to verify token signatures locally without contacting GalaxyBots — standard RS256 verification.",
      params: ["No parameters required"],
      returns: "JSON with keys[] — each key includes the RSA public key in JWK format (kty, n, e), kid (key ID), use: sig, alg: RS256",
      access: "Public — no authentication required",
      useWhen: "Setting up a resource server that validates GalaxyBots access tokens independently, or configuring a JWT middleware library",
    },
    {
      label: "MCP Discovery", method: "GET", path: `/.well-known/mcp.json`, group: "Discovery",
      purpose: "Standard MCP well-known discovery document. AI clients and MCP hosts query this URL to auto-discover the server's endpoint URLs, available tools, supported auth methods, trial configuration, and protocol version — without any prior configuration.",
      params: ["No parameters required — must be accessible at the domain root (not under /__mcp/)"],
      returns: "JSON with name, description, mcp_version, endpoints (sse, messages, health, oauth), tools_preview[], auth_methods[], scopes[], trial config",
      access: "Public — no authentication required",
      useWhen: "Auto-configuring an MCP client, building an MCP registry listing, or setting up Claude Desktop with just the domain URL",
    },
  ];

  const groups = [...new Set(endpoints.map(e => e.group))];
  const endpointRows = groups.map(group => {
    const groupEndpoints = endpoints.filter(e => e.group === group);
    const cards = groupEndpoints.map(e => {
      const tag = e.noLink ? "div" : "a";
      const href = e.noLink ? "" : `href="${origin}${e.path}" target="_blank" rel="noopener"`;
      const paramRows = e.params.map(p => {
        const colonIdx = p.indexOf(" — ");
        if (colonIdx > -1) {
          return `<li><code>${p.substring(0, colonIdx)}</code><span> — ${p.substring(colonIdx + 3)}</span></li>`;
        }
        return `<li>${p}</li>`;
      }).join("");
      return `
      <${tag} ${href} class="ep-card${e.noLink ? " ep-no-link" : ""}">
        <div class="ep-header">
          <span class="method method-${e.method.toLowerCase()}">${e.method}</span>
          <code class="ep-path">${e.path}</code>
          <span class="ep-label">${e.label}</span>
          ${e.noLink ? '<span class="ep-no-browser">Browser n/a</span>' : ""}
        </div>
        <p class="ep-purpose">${e.purpose}</p>
        <div class="ep-meta">
          <div class="ep-meta-row">
            <div class="ep-meta-block">
              <span class="ep-meta-label">Parameters</span>
              <ul class="ep-params">${paramRows}</ul>
            </div>
            <div class="ep-meta-block">
              <span class="ep-meta-label">Returns</span>
              <p class="ep-returns">${e.returns}</p>
              <span class="ep-meta-label" style="margin-top:10px">Access</span>
              <p class="ep-access">${e.access}</p>
              <span class="ep-meta-label" style="margin-top:10px">Use when</span>
              <p class="ep-use-when">${e.useWhen}</p>
            </div>
          </div>
        </div>
      </${tag}>`;
    }).join("");
    return `<div class="ep-group">
      <p class="ep-group-label">${group}</p>
      ${cards}
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GalaxyBots MCP Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:       #070A14;
      --surface:  #0D1126;
      --surface2: #121930;
      --border:   #1D2B4A;
      --text:     #EEF2FF;
      --muted:    #8FA3C0;
      --faint:    #5A7490;
      --purple:   #9B5CF6;
      --cyan:     #06D4EF;
      --green:    #10B981;
      --amber:    #F5B800;
    }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      background-image:
        radial-gradient(circle at 15% 50%, rgba(155, 92, 246, 0.06), transparent 30%),
        radial-gradient(circle at 85% 20%, rgba(6, 212, 239, 0.06), transparent 30%);
    }
    a { color: inherit; text-decoration: none; }

    /* ── Header ── */
    .header {
      border-bottom: 1px solid var(--border);
      padding: 28px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .logo-row { display: flex; align-items: center; gap: 16px; }
    .logo-img { width: 52px; height: 52px; object-fit: contain; }
    .brand { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
    .brand span { background: linear-gradient(90deg, var(--purple), var(--cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .version-badge {
      font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
      background: var(--surface2); border: 1px solid var(--border);
      color: var(--muted); padding: 3px 10px; border-radius: 20px;
    }
    .status-pill {
      display: flex; align-items: center; gap: 6px;
      background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green); font-size: 12px; font-weight: 600;
      padding: 5px 14px; border-radius: 20px;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    /* ── Main ── */
    .main { max-width: 1020px; margin: 0 auto; padding: 48px 24px; }

    .hero { text-align: center; margin-bottom: 52px; }
    .hero-logo { width: 100px; height: 100px; object-fit: contain; margin-bottom: 20px; }
    .hero h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; }
    .hero h1 span { background: linear-gradient(90deg, var(--purple), var(--cyan)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 15px; color: var(--muted); line-height: 1.6; max-width: 560px; margin: 0 auto 28px; }
    .hero-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 10px 22px; border-radius: 10px; font-size: 14px; font-weight: 600;
      transition: opacity .15s, transform .15s;
    }
    .btn:hover { opacity: .85; transform: translateY(-1px); }
    .btn-primary { background: linear-gradient(135deg, var(--purple), #7C3AED); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--muted); }
    .btn-outline:hover { border-color: var(--purple); color: var(--text); }

    /* ── Section ── */
    .section { margin-bottom: 44px; }
    .section-title {
      font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 14px;
    }

    /* ── Method badges ── */
    .method {
      font-size: 10px; font-weight: 700; letter-spacing: .6px;
      padding: 3px 8px; border-radius: 5px; text-align: center; white-space: nowrap; flex-shrink: 0;
    }
    .method-get    { color: var(--cyan);  background: rgba(6,212,239,.12);  border: 1px solid rgba(6,212,239,.25); }
    .method-post   { color: var(--amber); background: rgba(245,184,0,.12);  border: 1px solid rgba(245,184,0,.25); }
    .method-delete { color: #F87171;      background: rgba(248,113,113,.12); border: 1px solid rgba(248,113,113,.25); }

    /* ── Endpoint groups ── */
    .ep-group { margin-bottom: 36px; }
    .ep-group-label {
      font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 12px; padding-left: 2px;
    }

    /* ── Endpoint cards ── */
    .ep-card {
      display: block;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px 22px; margin-bottom: 10px;
      transition: border-color .18s, background .18s;
      text-decoration: none; color: inherit;
    }
    a.ep-card:hover { border-color: var(--purple); background: var(--surface2); cursor: pointer; }
    .ep-no-link { cursor: default; opacity: .95; }

    .ep-header {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .ep-path {
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 13px; color: var(--text); background: none; border: none;
    }
    .ep-label {
      font-size: 13px; font-weight: 600; color: var(--muted);
    }
    .ep-no-browser {
      font-size: 10px; font-weight: 600; color: var(--faint);
      background: var(--surface2); border: 1px solid var(--border);
      padding: 2px 8px; border-radius: 20px; margin-left: auto;
    }

    .ep-purpose {
      font-size: 13px; color: var(--muted); line-height: 1.65;
      margin-bottom: 14px; padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }

    .ep-meta-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    .ep-meta-block {}
    .ep-meta-label {
      display: block;
      font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
      color: var(--faint); margin-bottom: 6px;
    }
    .ep-params {
      list-style: none; margin-bottom: 0;
    }
    .ep-params li {
      font-size: 12px; color: var(--muted); line-height: 1.55;
      padding: 3px 0; border-bottom: 1px solid rgba(29,43,74,.5);
    }
    .ep-params li:last-child { border-bottom: none; }
    .ep-params code {
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 11px; color: var(--cyan); background: rgba(6,212,239,.08);
      padding: 1px 5px; border-radius: 4px;
    }
    .ep-params span { color: var(--faint); }
    .ep-returns, .ep-access, .ep-use-when {
      font-size: 12px; color: var(--muted); line-height: 1.55;
    }
    .ep-use-when { color: var(--text); font-style: italic; }

    @media (max-width: 640px) {
      .ep-meta-row { grid-template-columns: 1fr; }
      .ep-no-browser { display: none; }
    }

    /* ── Auth ── */
    .auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .auth-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 16px 18px;
    }
    .auth-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--purple); }
    .auth-card p  { font-size: 12px; color: var(--muted); line-height: 1.5; }

    /* ── Quick-start ── */
    .code-block {
      background: #06090F; border: 1px solid var(--border);
      border-radius: 12px; padding: 18px 20px;
      font-family: 'Cascadia Code','Fira Code',monospace;
      font-size: 12px; line-height: 1.7; overflow-x: auto;
    }
    .c-comment { color: #5A7490; }
    .c-key     { color: #9B5CF6; }
    .c-str     { color: #06D4EF; }
    .c-val     { color: #F5B800; }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid var(--border); padding: 20px 40px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 12px; color: var(--faint); flex-wrap: wrap; gap: 10px;
    }
    .footer a { color: var(--muted); }
    .footer a:hover { color: var(--purple); }
    .footer-links { display: flex; gap: 18px; }

    @media (max-width: 600px) {
      .header { padding: 16px 20px; }
      .main   { padding: 32px 16px; }
      .auth-grid { grid-template-columns: 1fr; }
      .hero h1 { font-size: 24px; }
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="logo-row">
      <img src="https://galaxybots.ai/favicon.png" alt="GalaxyBots" class="logo-img" onerror="this.style.display='none'" />
      <span class="brand"><span>GalaxyBots</span> MCP</span>
      <span class="version-badge">v2025-03</span>
    </div>
    <div class="status-pill"><span class="dot"></span> Online</div>
  </header>

  <main class="main">

    <div class="hero">
      <img src="https://galaxybots.ai/favicon.png" alt="GalaxyBots" class="hero-logo" onerror="this.style.display='none'" />
      <h1>Your AI Executive Team,<br /><span>via MCP</span></h1>
      <p>The GalaxyBots Model Context Protocol server gives Claude, Claude Desktop, and any MCP-compatible client direct access to 51 AI executive directors — from CEO to CISO.</p>
      <div class="hero-actions">
        <a href="https://galaxybots.ai" class="btn btn-primary" target="_blank">Get API Access</a>
        <a href="${origin}${BASE_PATH}/tools" class="btn btn-outline" target="_blank">Browse Tools</a>
        <a href="${origin}${BASE_PATH}/health" class="btn btn-outline" target="_blank">Health Check</a>
      </div>
    </div>

    <div class="section">
      <p class="section-title">API Reference — 13 Endpoints across 4 groups</p>
      ${endpointRows}
    </div>

    <div class="section">
      <p class="section-title">Authentication</p>
      <div class="auth-grid">
        <div class="auth-card">
          <h3>Bearer Token</h3>
          <p>Pass your API key in the <code>Authorization</code> header.<br /><code>Authorization: Bearer &lt;YOUR_KEY&gt;</code></p>
        </div>
        <div class="auth-card">
          <h3>OAuth 2.0 PKCE</h3>
          <p>Full OAuth flow for partner integrations. Begin at <code>${BASE_PATH}/oauth/authorize</code> with your client credentials.</p>
        </div>
      </div>
    </div>

    <div class="section">
      <p class="section-title">Claude Desktop Quick-Start</p>
      <div class="code-block">
<span class="c-comment">// Add to your claude_desktop_config.json</span>
{
  <span class="c-key">"mcpServers"</span>: {
    <span class="c-key">"galaxybots"</span>: {
      <span class="c-key">"url"</span>: <span class="c-str">"${origin}${BASE_PATH}/sse"</span>,
      <span class="c-key">"apiKey"</span>: <span class="c-str">"YOUR_GALAXYBOTS_API_KEY"</span>
    }
  }
}
      </div>
    </div>

  </main>

  <footer class="footer">
    <span>© ${new Date().getFullYear()} GalaxyBots.ai — AI Executive Intelligence</span>
    <div class="footer-links">
      <a href="https://galaxybots.ai" target="_blank">Website</a>
      <a href="https://galaxybots.ai/mcp-docs" target="_blank">Docs</a>
      <a href="${origin}/.well-known/mcp.json" target="_blank">Discovery JSON</a>
    </div>
  </footer>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get(`${BASE_PATH}/health`, async (_req, res) => {
  const uptimeMs = Date.now() - SERVER_START_TIME;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

  let dbStatus: "ok" | "degraded" = "ok";
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    dbStatus = "degraded";
  }

  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    service: "galaxybots-mcp",
    version: "2025-03",
    uptime: uptimeFormatted,
    uptime_ms: uptimeMs,
    active_sessions: activeSessions.size,
    tool_calls_served: totalToolCallsServed,
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get(`${BASE_PATH}/tools`, (_req, res) => {
  const q = ((_req.query.q as string) || "").toLowerCase().trim();
  const dept = ((_req.query.department as string) || "").toLowerCase().trim();
  const page = Math.max(1, parseInt((_req.query.page as string) || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt((_req.query.limit as string) || "100", 10)));

  let tools = getToolManifest();
  if (q) {
    tools = tools.filter((t: { name: string; description?: string }) =>
      t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
    );
  }
  if (dept) {
    const deptKeywords: Record<string, string[]> = {
      bots: ["bot", "director", "message", "memory", "task", "session"],
      aeo: ["pm_", "cloud9", "aeo", "score", "scan", "piratemonster"],
      finance: ["roi", "pricing", "metrics", "revenue"],
      knowledge: ["risk", "cloud9", "pricing", "roi", "department"],
      gtm: ["demo", "roi_report", "lead"],
      admin: ["client", "log_decision", "audit"],
      search: ["web_search", "http_fetch"],
    };
    const keywords = deptKeywords[dept] ?? [dept];
    tools = tools.filter((t: { name: string }) =>
      keywords.some(k => t.name.toLowerCase().includes(k))
    );
  }

  const total = tools.length;
  const offset = (page - 1) * limit;
  const paginated = tools.slice(offset, offset + limit);

  res.json({
    tools: paginated,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    filters: { q: q || null, department: dept || null },
    mcp_version: "2025-03",
    auth_methods: ["bearer", "oauth2_pkce"],
    scopes: ["bots:read", "bots:write", "clients:read", "aeo:read", "aeo:write"],
    departments: ["bots", "aeo", "finance", "knowledge", "gtm", "admin", "search"],
  });
});

app.get(`${BASE_PATH}/capabilities`, authenticate, (req: AuthenticatedRequest, res) => {
  const auth = req.authResult!;
  const allTools = getToolManifest().map((t: { name: string }) => t.name) as string[];
  const allowed = auth.allowedTools === null ? allTools : allTools.filter(t => auth.allowedTools!.includes(t));

  const scopeMap: Record<string, string> = {
    galaxybots: "Full access (internal key)",
    piratemonster: "Partner key — tool whitelist applies",
    oauth: `OAuth 2.0 — scopes: ${auth.oauthScopes?.join(", ") ?? "none"}`,
  };

  res.json({
    caller_type: auth.callerType,
    access_level: scopeMap[auth.callerType] ?? auth.callerType,
    rate_limit: auth.rateLimit === Infinity ? "unlimited" : auth.rateLimit,
    allowed_tools: allowed,
    allowed_tool_count: allowed.length,
    total_tools: allTools.length,
    scopes: auth.oauthScopes ?? null,
    partner_key_id: auth.partnerKeyId,
    oauth_client_id: auth.oauthClientId ?? null,
  });
});

app.delete(`${BASE_PATH}/sessions/:sessionId`, (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || !MCP_API_KEY || token !== MCP_API_KEY) {
    res.status(401).json({ error: "Unauthorized — admin key required" });
    return;
  }
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const transport = transports.get(sessionId);
  if (transport) {
    try { (transport as unknown as { close?: () => void }).close?.(); } catch { }
    transports.delete(sessionId);
  }
  sessionAuthMap.delete(sessionId);
  activeSessions.delete(sessionId);
  trialCallsMap.delete(sessionId);
  console.log(`[MCP] Session ${sessionId} forcibly terminated by admin`);
  res.json({ terminated: true, sessionId });
});

app.get(`${BASE_PATH}/openapi.json`, (_req, res) => {
  const origin = `${_req.protocol}://${_req.get("host")}`;
  const tools = getToolManifest();
  const toolPaths: Record<string, unknown> = {};
  for (const tool of tools as Array<{ name: string; description?: string; inputSchema?: unknown }>) {
    toolPaths[`/tools/${tool.name}`] = {
      post: {
        summary: tool.description ?? tool.name,
        operationId: tool.name,
        tags: ["tools"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": { schema: tool.inputSchema ?? { type: "object" } },
          },
        },
        responses: {
          "200": { description: "Tool result", content: { "application/json": { schema: { type: "object" } } } },
          "401": { description: "Unauthorized" },
          "429": { description: "Rate limit exceeded" },
        },
      },
    };
  }

  res.json({
    openapi: "3.1.0",
    info: {
      title: "GalaxyBots MCP Server",
      version: "2025-03",
      description: "Model Context Protocol server providing 51 AI executive directors for GalaxyBots.ai. Supports SSE streaming, OAuth 2.0 PKCE, and bearer token authentication.",
      contact: { name: "GalaxyBots Support", url: "https://galaxybots.ai", email: "support@galaxybots.ai" },
      license: { name: "Proprietary", url: "https://galaxybots.ai/terms" },
    },
    servers: [{ url: `${origin}${BASE_PATH}`, description: "GalaxyBots MCP Server" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key or JWT" },
        oauth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: `${origin}${BASE_PATH}/oauth/authorize`,
              tokenUrl: `${origin}${BASE_PATH}/oauth/token`,
              scopes: {
                "bots:read": "Read bots and directors",
                "bots:write": "Interact with bots, create sessions, search memory",
                "clients:read": "Read client profiles (admin)",
                "aeo:read": "Read AEO/Cloud 9 scores",
                "aeo:write": "Request new AEO scans",
              },
            },
          },
        },
      },
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "degraded"] },
            service: { type: "string" },
            version: { type: "string" },
            uptime: { type: "string" },
            active_sessions: { type: "integer" },
            tool_calls_served: { type: "integer" },
            database: { type: "string", enum: ["ok", "degraded"] },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        Session: {
          type: "object",
          properties: {
            sessionId: { type: "string" },
            clientName: { type: "string" },
            connectedAt: { type: "string", format: "date-time" },
            toolCallCount: { type: "integer" },
            callerType: { type: "string", enum: ["galaxybots", "piratemonster", "oauth"] },
            partnerKeyId: { type: ["integer", "null"] },
          },
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Server health check",
          operationId: "getHealth",
          tags: ["system"],
          security: [],
          responses: {
            "200": { description: "Health status", content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } } },
          },
        },
      },
      "/tools": {
        get: {
          summary: "List available MCP tools",
          operationId: "listTools",
          tags: ["tools"],
          security: [],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "Search query (name or description)" },
            { name: "department", in: "query", schema: { type: "string", enum: ["bots", "aeo", "finance", "knowledge", "gtm", "admin", "search"] }, description: "Filter by department" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 100 } },
          ],
          responses: {
            "200": { description: "Tool list", content: { "application/json": { schema: { type: "object" } } } },
          },
        },
      },
      "/capabilities": {
        get: {
          summary: "Get caller capabilities scoped to auth token",
          operationId: "getCapabilities",
          tags: ["auth"],
          responses: {
            "200": { description: "Caller capabilities" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/sessions": {
        get: {
          summary: "List active SSE sessions (admin only)",
          operationId: "listSessions",
          tags: ["admin"],
          responses: {
            "200": { description: "Active sessions", content: { "application/json": { schema: { type: "object", properties: { sessions: { type: "array", items: { $ref: "#/components/schemas/Session" } }, count: { type: "integer" } } } } } },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/sessions/{sessionId}": {
        delete: {
          summary: "Terminate an active SSE session (admin only)",
          operationId: "deleteSession",
          tags: ["admin"],
          parameters: [{ name: "sessionId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Session terminated" },
            "401": { description: "Unauthorized" },
            "404": { description: "Session not found" },
          },
        },
      },
      "/sse": {
        get: {
          summary: "Open MCP SSE stream",
          operationId: "openSSE",
          tags: ["mcp"],
          description: "Opens a persistent Server-Sent Events connection for an MCP session. Auth via Bearer token (optional for trial).",
          responses: {
            "200": { description: "SSE stream opened", content: { "text/event-stream": { schema: { type: "string" } } } },
          },
        },
      },
      "/messages": {
        post: {
          summary: "Send MCP tool call to active session",
          operationId: "postMessage",
          tags: ["mcp"],
          parameters: [{ name: "sessionId", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Tool result" },
            "401": { description: "Unauthorized" },
            "402": { description: "Trial exhausted" },
            "404": { description: "Session not found" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/oauth/authorize": {
        get: { summary: "Begin OAuth 2.0 PKCE authorization", operationId: "oauthAuthorize", tags: ["oauth"], security: [], responses: { "200": { description: "Authorization UI" } } },
      },
      "/oauth/token": {
        post: { summary: "Exchange code for tokens", operationId: "oauthToken", tags: ["oauth"], security: [], responses: { "200": { description: "Token response" } } },
      },
      "/oauth/revoke": {
        post: { summary: "Revoke an access or refresh token (RFC 7009)", operationId: "oauthRevoke", tags: ["oauth"], security: [], responses: { "200": { description: "Token revoked" } } },
      },
      "/oauth/jwks": {
        get: { summary: "JSON Web Key Set for token verification", operationId: "oauthJwks", tags: ["oauth"], security: [], responses: { "200": { description: "JWKS" } } },
      },
      ...toolPaths,
    },
    tags: [
      { name: "mcp", description: "Core MCP protocol endpoints" },
      { name: "tools", description: "MCP tool manifest and discovery" },
      { name: "auth", description: "Authentication and capability inspection" },
      { name: "oauth", description: "OAuth 2.0 PKCE flow" },
      { name: "admin", description: "Admin-only session management" },
      { name: "system", description: "Health and observability" },
    ],
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
