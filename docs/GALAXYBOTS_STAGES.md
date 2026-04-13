# GalaxyBots.ai — Master Product Map
> **Rule for every agent session:** Before writing any code or planning any
> task, identify the Stage and Process it belongs to. Name both in the task.
---
## The 5 Product Stages
Stages follow the customer journey from first problem awareness to full mastery.

S1 → DISCOVER   S2 → FIX   S3 → AMPLIFY   S4 → DEFEND   S5 → COMMAND
(Know the gap)  (Close the gap)  (Grow the signal)  (Protect the gain)  (Scale on autopilot)

Each stage has:
- A one-line customer promise
- A feature table: Feature | Route | Status
- A single north-star metric that defines success for that stage
---
### S1 — Discover
> "You can't fix what you can't see."
**North-star metric:** Time from signup to first AEO score delivered (target < 5 min)

| Feature | Route | Status |
|---|---|---|
| Marketing landing page | `/` | Live |
| How It Works explainer | `/how-it-works` | Live |
| Pricing & savings calculator | `/pricing` | Live |
| Book a Demo | `/demo` | Live |
| Guest / Demo preview mode | `/demo` | Live |
| AEO Grade button (scan any URL) | `/bots/:id` (AEO tools) | Live |
| Competitor comparison infographic | Canvas asset | Live |
| Industry Starter Packs library | `/packs` | Live |
| Pack detail & preview | `/packs/:packId` | Live |
| Bot & Scenario Marketplace | `/marketplace` | Live |
| Marketplace template detail | `/marketplace/:templateId` | Live |
| Partner landing pages | `/partner/:ref` | Live |
| Partner application | `/partner-apply` | Live |
| MCP launch marketing page | `/mcp-launch` | Live |
| Developer portal | `/developers` | Live |
| Shared ROI report (public link) | `/roi/shared/:token` | Live |
| Shared proposal (public link) | `/proposals/shared/:token` | Live |
| Client Portal (PIN-authenticated stakeholder view) | `/client-portal` | Live |
---
### S2 — Fix
> "Close every gap your AI competitors already exploit."
**North-star metric:** % of recommended AEO fixes completed within 7 days

| Feature | Route | Status |
|---|---|---|
| Onboarding wizard (5-step) | Modal on first login | Live |
| Onboarding checklist (persistent) | Dashboard overlay | Live |
| First client setup | `/clients` | Live |
| Industry pack auto-install | Onboarding step 3 | Live |
| Integration connections (Gmail, HubSpot, Slack, etc.) | `/integrations` | Live |
| Knowledge base upload & sync | `/knowledge-base` | Live |
| Bot roster & hiring | `/bots`, `/hire` | Live |
| 1-on-1 bot chat with tool use | `/bots/:id` | Live |
| AEO 5-point improvement plan | PirateMonster webhook | Live |
| Client health score & recommended actions | `/clients/:id` | Live |
| ROI dashboard | `/roi` | Live |
| Client-specific ROI | `/clients/:id/roi` | Live |
| Proof-of-Value engine | `/roi` | Live |
| Compliance monitoring | `/compliance` | Live |
| Settings & preferences | `/settings` | Live |
| Organization admin | `/settings/org` | Live |
| Enterprise SSO (SAML/OIDC) & SCIM provisioning | `/sso/callback`, `/settings/org` | Live |
---
### S3 — Amplify
> "Turn every insight into published content and closed deals."
**North-star metric:** AI-generated content pieces published per week per client

| Feature | Route | Status |
|---|---|---|
| BingoLingo content generation (Blog, LinkedIn, Twitter, PR) | BingoLingo integration | Live |
| Document Studio | `/documents` | Live |
| Proposal Studio | `/proposals` | Live |
| AI Proposal & Pitch Studio | `/proposals` | Live |
| Blog publishing | `/blog`, `/blog/:slug` | Live |
| Prospect management | `/prospects` | Live |
| Prospector (automated outreach) | `/prospector` | Live |
| Prospect outreach automation & sales funnel | `/prospector` | Live |
| Pipeline engine (multi-bot content chains) | `/pipelines` | Live |
| Brand voice guardrails on all output | Content pipeline | Live |
| PDF export for strategy documents | `/documents` | Live |
| MCP Growth Hub | `/mcp-growth-hub` | Live |
| MCP GTM Engine (lead capture & intent signals) | `/mcp-growth-hub` | Live |
| Scenario modeling & what-if analysis | `/scenarios` | Live |
| Business valuation tool | `/valuation` | Live |
| Five-Year Plan pitch deck | `/five-year-plan` | Live |
---
### S4 — Defend
> "Protect every ranking you've earned before a competitor steals it."
**North-star metric:** Mean time to alert on competitive position change (target < 4 hrs)

| Feature | Route | Status |
|---|---|---|
| Competitive AEO Intelligence tracker | `/analytics` | Live |
| Competitor URL monitoring & auto-normalization | Background jobs | Live |
| AEO scan queue (background re-scoring) | Scheduler job | Live |
| Client health intelligence & retention engine | `/clients/:id` | Live |
| Bot governance & permission model | `/governance` | Live |
| AI safety layer (5-pillar system) | Middleware | Live |
| Security & tenant hardening (versioned encryption) | Middleware | Live |
| Approval SLA system with escalation | `/process-studio` | Live |
| Pending approval gate (human-in-the-loop) | Agentic loop | Live |
| Platform notification center | `/notifications` | Live |
| Activity stream (real-time feed) | `/activity` | Live |
| Weekly pulse & briefings | `/briefs` | Live |
| Cost cap alerts (80% / 100% budget thresholds) | Analytics service | Live |
| Usage monitoring dashboard | `/usage` | Live |
| Audit middleware (all actions logged) | Middleware | Live |
| GDPR compliance & data controls | API middleware | Live |
---
### S5 — Command
> "Your AI executive team runs the business while you sleep."
**North-star metric:** Autonomous actions executed per week without human intervention

| Feature | Route | Status |
|---|---|---|
| Command Center (owner dashboard) | `/command-center` | Live |
| Boardroom (executive overview) | `/boardroom` | Live |
| Task rooms (live mission monitoring) | `/task-rooms`, `/task-rooms/:id` | Live |
| Deploy team (mission launch) | `/deploy-team` | Live |
| Autonomous action scheduler (17 background jobs) | Scheduler service | Live |
| Standing workflows / pipelines (DAG engine) | `/pipelines` | Live |
| Event-triggered pipelines | Pipeline engine | Live |
| Bot operating hierarchy & delegation | Agentic loop | Live |
| Deep Thinking (Mixture of Agents) | Chat — Team/Enterprise plan | Live |
| Optima Prime auto-assembler (gap detection + fabrication) | Task sessions | Live |
| Bot SLA & performance guarantees | `/sla-walkthrough` | Live |
| Process Studio (visual process design) | `/process-studio` | Live |
| CFO Bot financial dashboard | `/bots/:id/cfo-dashboard` | Live |
| Analytics & data science layer | `/analytics` | Live |
| Journal (activity log) | `/journal` | Live |
| Global assembly view | `/global`, `/assembly` | Live |
| ⌘K command palette & keyboard shortcuts | Global overlay | Live |
| Mission template library | `/deploy-team` | Live |
| Activation nurture automation (Day 1/3/7 emails) | Background jobs | Live |
| AI Receptionist (ElevenLabs voice) | `/bots/ai-receptionist` | Live |
| MCP Server (external agent access) | `artifacts/mcp-server` | Live |
| MCP Desktop Extension | `artifacts/mcp-extension` | Live |
| MCP Docs | `/mcp-docs` | Live |
| API versioning (v1 namespace) | `/api/v1/*` | Live |
---
## The 6 Horizontal Processes
Processes cut across all stages. Every feature touches at least one.
---
### P1 — Onboarding & Conversion

```
Register → Onboarding Wizard (5 steps) → First Client → Industry Pack Install
→ First Integration → First Mission Launch → "Aha" moment → Upgrade
```

- Free tier gives: Access to all 51 AI Directors, 100 credits/month (Starter)
- Upgrade triggers when: Credits exhausted (402 response), Boardroom/Analytics attempted (Pro gate), or Day 7 nurture email
- Key files: `artifacts/galaxybots/src/components/onboarding/OnboardingWizard.tsx`, `artifacts/galaxybots/src/components/onboarding/OnboardingChecklist.tsx`, `artifacts/api-server/src/services/platform/jobs/check-activation-nurture.ts`
- Conversion lever: Savings calculator on `/pricing` shows 99% cost reduction vs. human executives ($60/yr vs. $300k+)
---
### P2 — Core Intelligence / Scoring Engine

```
URL submitted → PirateMonster AEO scan request → Async queue processed
→ 9-engine citation check → overall_score (0–100) → 5-point improvement plan → Cache
```

- Cache TTL: Scores cached until next scheduled re-scan (configurable per client)
- Model gating: All tiers get AEO scores; Deep Thinking (MoA synthesis) requires Team or Enterprise plan
- Key files: `artifacts/api-server/src/tools/aeo-tools.ts`, `artifacts/api-server/src/routes/partner/piratemonster/webhook-aeo.ts`, `artifacts/api-server/src/routes/clients/client-health.ts`
- Rate limits: Credit-metered (3–15 credits per AI call depending on model)
- Health scoring: Weighted signals — `task_session_completed` (12pts), `integration_connected` (15pts), `bot_interaction` (6pts) → 0–100 score → healthy / at_risk / critical
---
### P3 — Content & AI Generation Pipeline

```
User request or pipeline trigger → Auth + credit check → Model selected
→ Brand voice guardrails applied → Agentic loop (up to 10 iterations)
→ Tool calls (search, CRM, sheets) → Cost logged → Response delivered
```

- Model gating: All plans access all models; credits deducted per call — `gpt-4o-mini` (3), `gpt-4o` (10), `gpt-5.2` (15); Deep Thinking requires Team or Enterprise
- Loop protection: Max 10 iterations, duplicate tool-call detection, stuck-output detection, circuit breaker on provider failures
- Key files: `artifacts/api-server/src/tools/agentic-loop.ts`, `artifacts/api-server/src/services/ai-safety/model-fallback.ts`, `artifacts/api-server/src/middleware/credit-meter.ts`
- Premium action token: Credits (deducted per interaction, reset monthly with plan)
- Fallback chain: `gpt-5.4` → `gpt-4o` → `claude-sonnet-4-6` (automatic on failure)
---
### P4 — Integration & Publish Pipeline

```
OAuth flow → Access token stored → Refresh token stored → Bot tool registered
→ Agentic loop calls tool → Action executed → Metrics logged
```

- Supported targets: Gmail, Google Sheets, HubSpot, Slack, Linear, Notion, Twilio SMS, ElevenLabs Voice, Stripe, PirateMonster AEO, BingoLingo, MCP Protocol
- Token refresh: OAuth tokens refreshed on 401 response; Stripe webhooks handle subscription state sync
- Key files: `artifacts/api-server/src/tools/integrations/` (directory with per-service modules), `artifacts/api-server/src/services/billing/stripe-provider.ts`, `artifacts/api-server/src/services/billing/webhook-handler.ts`
- MCP version: Exposed via `artifacts/mcp-server/src/app.ts` — tools, resources, and prompts for external agent consumption
---
### P5 — Task / Mission Orchestration

```
User sets objective → Optima Prime analyzes roster → Gap detection
→ Bot team assembled → User approves → Agentic loop executes per bot
→ Before/after delta measured → Debrief report generated
```

- Approval gate: Owner must approve sensitive tool calls (email, data modification); auto-reject after 2× SLA timeout
- Delta tracking: AEO score before vs. after; client health score before vs. after; content pieces generated count
- Key files: `artifacts/api-server/src/routes/missions/task-sessions.ts`, `artifacts/api-server/src/services/missions/pipeline-engine.ts`, `artifacts/api-server/src/services/missions/workflow-engine.ts`
- Workflow engine: DAG-based with node types: Trigger (manual/schedule/webhook), Condition, Delay, Action
- Pipeline engine: Sequential bot chaining — output of bot N becomes context for bot N+1
---
### P6 — Billing & Tier Enforcement

Tiers (backend plan names): `single` ($999/mo) → `team` ($2,999/mo) → `enterprise` ($7,999/mo)
Marketing names on `/pricing`: Starter ($60/mo) / Pro ($180/mo) / Scale ($588/mo) — these are the public-facing names; backend enforces `single`/`team`/`enterprise`.

- Client gate: Credit balance check in `creditMeter` middleware; returns `402 Payment Required` when exhausted
- Server guard: `requireAccessorial(addonKey)` middleware blocks premium features; `requireRole("owner","admin")` for admin routes
- Plan-gated features: Deep Thinking (MoA) requires `team` or `enterprise` plan (`moaPlans` in `conversations.ts`)
- Token/credit reset: Monthly with subscription renewal via Stripe/GoDaddy webhook
- Add-ons (Accessorials): `priority_response`, `memory_vault`, `deep_thinking`, `api_access`, `custom_bot_fabrication` — toggled via `/billing/addons/toggle`
- Partner wholesale: Authorized (40% off, 5+ clients) → Certified (60% off, 15+) → Elite (70% off, 50+)
- Cost caps: `monthlyCapUsd` per client; alerts at 80% (warning) and 100% (critical); can auto-pause autonomous operations
- Key files: `artifacts/api-server/src/middleware/credit-meter.ts`, `artifacts/api-server/src/routes/billing/billing.ts`, `artifacts/galaxybots/src/pages/marketing/Pricing.tsx`
---
## Amplification Opportunities
> Adjacent products that reuse this codebase at near-zero marginal build cost.

| Opportunity | Reuses | Potential |
|---|---|---|
| PirateMonster AEO (standalone SaaS) | AEO scoring engine, scan queue, webhook pipeline | SEO/AEO agencies pay $200–500/mo per seat |
| BingoLingo Content Studio (standalone) | Content generation pipeline, brand voice guardrails, social scheduling | Content marketers pay $100–300/mo |
| MCP Marketplace (tool hosting) | MCP server, tool registry, OAuth infrastructure | Developers pay per-tool listing fees |
| White-Label Partner Platform | Entire platform re-skinned per partner | Agencies pay wholesale tiers + volume |
| AI Receptionist (vertical product) | ElevenLabs integration, call routing, transcript analysis | SMBs pay $50–150/mo for AI phone answering |
| Industry Vertical Packs (marketplace) | Starter pack framework, bot fabrication, mission templates | Consultants sell pre-built packs at $500–2k |
| Compliance-as-a-Service | Compliance API, requirement manager, audit middleware | Regulated industries pay $300–800/mo |
---
## Stage / Process Assignment Guide
Every task or feature must answer all 4 before work begins:
1. **Which Stage?** S1 Discover / S2 Fix / S3 Amplify / S4 Defend / S5 Command
2. **Which Process(es)?** P1 Onboarding / P2 Scoring / P3 Content / P4 Integration / P5 Orchestration / P6 Billing
3. **What north-star metric does it move?**
4. **What tier unlocks it?**

### Examples from this codebase:

> Feature: "AEO Grade Button — scan any URL"
> Stage: S1 Discover | Process: P2 Scoring | Metric: Time to first AEO score | Tier: All (Starter+)

> Feature: "BingoLingo auto-content pipeline"
> Stage: S3 Amplify | Process: P3 Content, P4 Integration | Metric: Content pieces published/week | Tier: Team+

> Feature: "Competitive AEO tracker with alerts"
> Stage: S4 Defend | Process: P2 Scoring, P5 Orchestration | Metric: Mean time to competitive alert | Tier: Team+

> Feature: "Autonomous scheduler (17 background jobs)"
> Stage: S5 Command | Process: P5 Orchestration | Metric: Autonomous actions/week | Tier: Enterprise

> Feature: "Enterprise SSO & SCIM"
> Stage: S5 Command | Process: P1 Onboarding, P6 Billing | Metric: Enterprise conversion rate | Tier: Enterprise

> Feature: "Savings calculator on pricing page"
> Stage: S1 Discover | Process: P1 Onboarding | Metric: Pricing page → signup conversion | Tier: Free (public)
---
## How to Wire This Into Any Replit Project
1. This file lives at `docs/GALAXYBOTS_STAGES.md`
2. Referenced in `replit.md` at the top:

   `docs/GALAXYBOTS_STAGES.md — Product stages and processes. Read before planning any new feature or task.`

3. Every agent session now opens with full product context automatically.
---
*Last updated: April 2026 — update when a stage feature ships or a process changes.*
