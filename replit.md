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

- `bots` — All 51 AI director personalities with roles, departments, descriptions, personalities
- `conversations` — Chat conversations between users/clients and bots
- `messages` — Individual messages in conversations (role: user/bot/system)
- `clients` — Companies that hire bots
- `client_bots` — Junction table for which bots a client has hired
- `boardroom_messages` — Internal board communications (encoded + English)
- `journal_entries` — Daily operations journal with board highlights

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
2. **Bot Roster** — All 51 directors browsable by category with search
3. **Chat Interface** — Real AI conversations with each bot via GPT-5.2
4. **Boardroom** — Internal board communications with encoded + English transcriptions
5. **Daily Journal** — Operations journal with board session highlights
6. **Clients** — Client management and bot hiring system

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
