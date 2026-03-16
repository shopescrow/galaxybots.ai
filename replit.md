# Overview

GalaxyBots.ai is a white-label AI-powered corporate bot platform designed to deploy Fortune 500 intelligence for businesses. It offers AI personalities representing director-level positions that provide expert professional perspectives through chat interactions. The platform enables the creation of cross-functional bot teams, supports long-term memory retention for bots, and facilitates background autonomous assignments. Key features include a chat interface for AI conversations, an internal boardroom for communications, client management, task rooms for team-based operations, and a robust proof-of-value engine with an ROI dashboard. The project also incorporates external compliance application integrations and a comprehensive compliance center.

# User Preferences

I prefer iterative development, with a focus on delivering functional components that can be tested and refined. When making changes or adding features, please provide clear explanations of the architectural choices and how they align with the overall system design. I value modular and maintainable code.

# System Architecture

The project is built as a monorepo using `pnpm workspaces`, Node.js 24, TypeScript 5.9, and Express 5 for the API server. The frontend is a React application utilizing Vite, TailwindCSS, Framer Motion, and TanStack Query. Data persistence is handled by PostgreSQL with Drizzle ORM. AI capabilities are powered by OpenAI GPT-5.2 through Replit AI Integrations. Data validation uses Zod and `drizzle-zod`, while API client code is generated from an OpenAPI spec using Orval. The build process uses esbuild for CJS bundles.

**UI/UX Decisions:**
- **Branding:** "Fortune 500 Intelligence. Deployed for You." with a cinematic "Global Assembly" page featuring SSE-streamed, AI-generated bot declarations.
- **Bot Interaction:** Bots are browsable by category with search functionality. Task Rooms feature AI-powered task analysis, team proposals, a "Give Birth" bot fabrication process with CEO approval, and a dedicated chat interface.
- **Reporting & Dashboards:** An ROI Dashboard visualizes cumulative metrics, charts, and generates weekly executive briefings. A Compliance Center provides platform status and client-specific requirements management.
- **Agentic Tooling:** A dedicated UI for the Agentic Tool System features collapsible tool step cards with real-time pulse indicators.

**Technical Implementations & Feature Specifications:**
- **Data Models:** Core entities include `bots` (51+ AI director personalities), `conversations`, `messages`, `clients` (with enriched business profiles: `websiteUrl`, `industry`, `servicesList`, `targetMarket`, `businessContext`, `webhookSecret`), `task_sessions`, `bot_memories` (persistent via pgvector embeddings), `bot_assignments` (standing "watch" responsibilities), `platform_compliance`, `client_compliance_requirements`, `client_integrations`, `session_outcomes` (for ROI), `roi_shareable_reports`, `tool_activity_log`, `receptionist_configs`, `call_logs`, `users`, and `platform_audit_log`.
- **Authentication & Security:** Implements JWT authentication (Bearer token or httpOnly cookie), RBAC with `requireRole()` middleware, tenant isolation for all data queries, rate limiting, CORS restrictions, a PostgreSQL advisory lock for scheduler, and a `bypassPayment` flag. All mutating API requests and tool executions are logged to `platform_audit_log`. CAPTCHA is implemented on auth forms, and robust account recovery mechanisms are in place.
- **Bot Categories:** Includes Board of Directors, Executive Leadership, Operations, Sales & Marketing, Finance & Legal, Technology & Product, Human Resources, Creative & Design, Specialized, and a Voice & Communications category featuring the Vera AI Receptionist add-on bot.
- **Key Features:**
    - **Chat Interface:** Real AI conversations with bots using GPT-5.2.
    - **Boardroom & Daily Journal:** Internal board communications and operational journaling.
    - **Client & Task Management:** System for client management, bot hiring, and deploying cross-functional bot teams in "Task Rooms." Clients have enriched business profiles with automatic bot context injection — bots receive the client's industry, services, market, and business context in their system prompts. A lead webhook endpoint (`POST /api/webhooks/lead/:clientId`) enables external websites to trigger bot missions for lead qualification.
    - **Long-Term Memory:** Bots retain cross-session knowledge via pgvector semantic embeddings, with memory consolidation at the end of task sessions and an audit view.
    - **Scenario Library & Mission Debrief:** A `/scenarios` page presents curated real-world business missions for client companies (7 Lawn 11, Family Movers Canada). Each scenario includes company context, difficulty level, category, planned actions, and a full mission objective. "Launch Mission" pre-fills the Deploy Team page and auto-triggers Optima Prime analysis. A Mission Debrief panel on the Task Rooms list shows bots involved, tool execution logs, message counts, and mid-session role flags. Client detail pages include a "Missions" tab for launching scenarios directly from a client profile.
    - **Background Autonomy:** Bots can be assigned standing "watch" responsibilities with configurable cadences, server-side scheduling, manual run triggers, and real-time SSE-streamed reports.
    - **Integrations Settings:** Client-facing page for managing credentials for various external services with connection status badges.
    - **Proof-of-Value Engine & ROI Dashboard:** Tracks task session outcomes, quantifies business value, generates weekly executive briefings, and provides shareable ROI reports.
    - **Compliance Center:** Manages both platform-level compliance data from external apps and client-defined compliance standards.
- **Agentic Tool System:** Bots utilize OpenAI function calling with a formal tool registry. Tools include `web_search`, `read_world_state`, `write_world_state`, `read_platform_data`, `delegate_to_bot`, `send_email`, `read_email`, `post_slack_message`, `read_slack_channel`, `create_document` (Notion), `read_document` (Notion), `create_calendar_event`, `list_calendar_events`, `crm_upsert_contact` (HubSpot), `crm_create_deal` (HubSpot), `create_issue` (Linear), `update_issue` (Linear), `run_code` (sandboxed JavaScript), `scrape_webpage`, `analyze_aeo_score` (PirateMonster), `aeo_recommend` (PirateMonster), `prospect_search` (CMO prospecting), `enrich_prospect` (contact enrichment with confidence scoring), `get_prospects` (pipeline query), and `qualify_prospect` (pipeline status management). The agentic loop executes these tools, streaming events live to the frontend.
    - **Prospect Pipeline:** The CMO bot has autonomous prospecting capabilities via the `prospects` table and four dedicated tools. Prospects flow through a status pipeline: new → enriched/review_needed → qualified/contacted/rejected. Low-confidence enrichments (< 0.75) are automatically flagged for human review. The `/prospects` page provides a pipeline table with confidence color-coding and a review queue with approve/edit/reject actions. All prospect data is tenant-scoped by `clientId`.

# External Dependencies

- **OpenAI GPT-5.2:** For AI capabilities and bot intelligence.
- **PostgreSQL:** Primary database.
- **ElevenLabs:** AI voice generation for the Vera AI Receptionist bot.
- **Twilio:** Calling functionality for the Vera AI Receptionist bot.
- **DuckDuckGo Instant Answer API:** Powers the `web_search` agentic tool.
- **Gmail API:** For email-related agentic tools (`send_email`, `read_email`).
- **Google Calendar API:** For calendar-related agentic tools (`create_calendar_event`, `list_calendar_events`).
- **HubSpot API:** For CRM-related agentic tools (`crm_upsert_contact`, `crm_create_deal`).
- **Notion API:** For document management agentic tools (`create_document`, `read_document`).
- **PirateMonster.com:** An AEO intelligence platform for AEO score analysis and recommendations, integrated via webhooks and specific agentic tools (`analyze_aeo_score`, `aeo_recommend`).
- **Slack:** Platform-level integration for messaging agentic tools (`post_slack_message`, `read_slack_channel`).
- **Linear:** Platform-level integration for issue management agentic tools (`create_issue`, `update_issue`).
- **Stripe:** Payment processing for subscription billing. Checkout sessions redirect users to Stripe-hosted payment pages, and a webhook (`POST /api/billing/stripe/webhook`) auto-activates accounts on successful payment. Requires env secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_SINGLE`, `STRIPE_PRICE_ID_TEAM`, `STRIPE_PRICE_ID_ENTERPRISE`. An optional `APP_URL` env var controls redirect URLs after checkout.

# MCP Server

The project includes a standalone MCP (Model Context Protocol) server at `artifacts/mcp-server` that exposes GalaxyBots capabilities as callable tools for Replit Agent and any MCP-compatible AI client. It implements the MCP protocol over SSE (HTTP transport), reachable at `/__mcp/sse`.

**Tools exposed:**
- `list_bots` / `get_bot` — Query the bot roster
- `list_clients` / `get_client` — Query client business profiles (omits sensitive fields)
- `send_message_to_bot` — Send a message to a bot and receive its AI response
- `analyze_task` — Submit a business objective for Optima Prime team analysis
- `create_task_session` / `list_task_sessions` — Manage Task Rooms
- `search_bot_memory` — Semantic search over a bot's long-term memory (pgvector)

**Authentication:** All requests require `Authorization: Bearer <MCP_API_KEY>` header. The `MCP_API_KEY` is set as an environment variable.

**Registration:** Add as a custom MCP server in Replit with SSE URL `https://<domain>/__mcp/sse` and the bearer token header.
