import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, botsTable } from "@workspace/db";
import { RISK_REGISTER, CLOUD9_PLATFORMS, GALAXYBOTS_TIERS } from "./tools/knowledge.js";

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

export async function registerResourcesAndPrompts(server: McpServer): Promise<void> {
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
