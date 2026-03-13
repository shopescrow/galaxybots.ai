# Workspace

## Overview

GalaxyBots.ai — A white-label AI-powered corporate bot platform. Users can hire AI personalities representing every director-level position in a Fortune 500 corporation. Bots provide expert professional perspective from their domain when engaged in chat.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI GPT-5.2 via Replit AI Integrations
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite, TailwindCSS, Framer Motion, TanStack Query

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── galaxybots/         # GalaxyBots.ai React frontend (at /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   ├── integrations-openai-ai-server/  # OpenAI server-side client
│   └── integrations-openai-ai-react/   # OpenAI React hooks
├── scripts/
│   └── src/seed-bots.ts    # Seeds 51 bot personalities into DB
```

## Database Schema

- `bots` — All 51 AI director personalities with roles, departments, descriptions, personalities, `declaration` (AI-generated activation statement), `isAiGenerated` flag
- `conversations` — Chat conversations between users/clients and bots
- `messages` — Individual messages in conversations (role: user/bot/system)
- `clients` — Companies that hire bots
- `client_bots` — Junction table for which bots a client has hired
- `boardroom_messages` — Internal board communications (encoded + English)
- `journal_entries` — Daily operations journal with board highlights
- `task_sessions` — Task-based bot team deployment sessions (objective, status, timestamps)
- `task_session_bots` — Junction table linking sessions to their assigned bot team
- `task_session_messages` — Messages within task sessions (with flaggedRoles for missing-role alerts, messageType: text/tool_call/tool_result, toolData jsonb)
- `world_state` — Session-scoped key-value store for bots to share persistent findings within a task session

## Bot Categories

- **Board of Directors (Governance)**: Chairperson, Vice Chairperson, Lead Independent Director, Inside Director, Outside Director
- **Executive Leadership**: Managing Director
- **Operations**: Director of Operations, Manufacturing, Supply Chain, Logistics, Procurement, Quality Assurance
- **Sales & Marketing**: Sales, Marketing, Business Development, Communications, Brand Strategy, Digital Marketing, Channel Sales
- **Finance & Legal**: Finance Director, Accounting, FP&A, Legal Affairs, Compliance, Risk Management, Internal Audit, Tax
- **Technology & Product**: Technical Director, Product Management, Engineering, IT, Information Security, Cloud Infrastructure, Data Science, Software Development
- **Human Resources**: HR Director, Talent Acquisition, L&D, Total Rewards, DEI, Employee Relations
- **Creative & Design**: Creative Director, Art Director, Design Director, UX/UI Director
- **Specialized**: Medical Director, Clinical Operations, Research (R&D), Construction, Facilities, Development (Non-Profit)

## Key Features

1. **Landing Page** — Hero with "Fortune 500 Intelligence. Deployed for You." branding
2. **Global Assembly** — Cinematic `/assembly` page where all bots declare their identity via SSE-streamed AI-generated declarations, cached in DB
3. **Bot Roster** — All 51 directors browsable by category with search
3. **Chat Interface** — Real AI conversations with each bot via GPT-5.2
4. **Boardroom** — Internal board communications with encoded + English transcriptions
5. **Daily Journal** — Operations journal with board session highlights
6. **Clients** — Client management and bot hiring system
7. **Task Rooms** — Deploy cross-functional bot teams for business objectives
   - **Deploy Team** — AI-powered task analysis, team proposal, bot fabrication ("Give Birth") with CEO approval
   - **Task Boardroom** — Dedicated chat with assigned team, "Add Thinking Power" alerts for missing roles
   - **Task Sessions Dashboard** — List all task rooms with status, team size, last activity

## Seeding

Run `pnpm --filter @workspace/scripts run seed-bots` to seed all 51 bot personalities.

## API Routes

- `GET /api/bots` — List all bots
- `GET /api/bots/:id` — Get bot details
- `POST /api/conversations` — Start conversation with a bot
- `GET /api/conversations/:id/messages` — Get conversation messages
- `POST /api/conversations/:id/messages` — Send message (AI responds)
- `GET /api/boardroom/messages` — Board room messages
- `POST /api/boardroom/messages` — Post to boardroom (triggers AI board responses)
- `GET /api/clients` — List clients
- `POST /api/clients` — Create client
- `GET /api/clients/:id/bots` — Get client's hired bots
- `POST /api/clients/:id/bots` — Hire a bot for a client
- `GET /api/journal` — Get journal entries
- `POST /api/task-sessions/analyze` — AI analyzes task and proposes team
- `GET /api/task-sessions` — List all task sessions
- `POST /api/task-sessions` — Create task session with approved team
- `GET /api/task-sessions/:id` — Get task session details
- `GET /api/task-sessions/:id/messages` — Get session messages
- `POST /api/task-sessions/:id/messages` — Send message (all team bots respond)
- `GET /api/task-sessions/:id/alerts` — Get missing-role alerts
- `POST /api/task-sessions/:id/expand` — Add bots to active session
- `POST /api/bots/fabricate` — Fabricate a new AI-generated bot
- `GET /api/bots/declarations` — Get all bots with cached declarations (sorted by department)
- `POST /api/bots/generate-declarations` — SSE stream: generate AI declarations for all bots
- `POST /api/task-sessions/:id/messages/stream` — SSE stream of agentic bot responses with tool steps
- `POST /api/conversations/:id/messages/stream` — SSE stream of agentic bot response with tool steps

## Agentic Tool System

Bots use OpenAI function calling with a formal tool registry. Tools available:
- `web_search` — Search the web via DuckDuckGo Instant Answer API
- `read_world_state` — Read from session-scoped shared key-value store
- `write_world_state` — Write to session-scoped shared key-value store
- `read_platform_data` — Query bots/sessions/conversations (context-scoped only)
- `delegate_to_bot` — Delegate a sub-task to another bot (session-scoped only)

The agentic loop iterates: call model → detect tool calls → execute → append results → call again, capped at 10 iterations. Uses p-limit/p-retry from shared infrastructure for concurrency and retry. Tool calls and results are stored as typed message records in the database. SSE streaming sends events (`tool_call`, `tool_result`, `message`, `done`) live to the frontend. The UI shows collapsible tool step cards with a working pulse indicator.

Key files:
- `artifacts/api-server/src/tools/registry.ts` — Tool registry with Zod input/output schemas and OpenAI format export
- `artifacts/api-server/src/tools/definitions.ts` — Tool implementations
- `artifacts/api-server/src/tools/agentic-loop.ts` — Agentic loop with p-retry/p-limit
- `artifacts/galaxybots/src/hooks/use-sse.ts` — SSE stream consumption hook
- `artifacts/galaxybots/src/components/ToolStepCard.tsx` — Collapsible tool step UI components
