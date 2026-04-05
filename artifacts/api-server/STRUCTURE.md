# API Server — Folder Structure

## Routes (`src/routes/`)

Domain-based organization. Each subfolder contains route handlers and exports a `registerXRoutes(router)` barrel function via `index.ts`.

| Domain | Purpose |
|---|---|
| `admin/` | Notifications, push, seeds, admin ops |
| `analytics/` | Activity events, LLM usage, cost caps, ROI, SLA, outcomes |
| `auth/` | Login, registration, OAuth, SSO, SCIM |
| `billing/` | Subscriptions, credits, packs, invoices |
| `bots/` | Bot CRUD, boardroom, TTS, voice, receptionist |
| `clients/` | Client management, health, integrations, stakeholders |
| `compliance/` | Audit, governance, compliance checks |
| `content/` | Knowledge base, documents, blog |
| `missions/` | Workflows, pipelines, playbooks, templates |
| `partner/` | Partner portal, PirateMonster integration |
| `platform/` | Demo, governance, scheduler, SSE, webhooks |
| `prospecting/` | Prospect management, outreach, review queue |

Entry point: `src/routes/index.ts` calls each domain's register function.

## Services (`src/services/`)

Domain-based, mirrors the route structure. Cross-domain imports use `../otherdomain/file` paths.

| Domain | Purpose |
|---|---|
| `admin/` | Notifications, push sender, seed data |
| `analytics/` | Activity events, cost caps, LLM usage, outcomes, ROI, SLA |
| `billing/` | Pack overlays |
| `bots/` | Briefing, memory, receptionist improvement |
| `clients/` | Client context, client health, CRM adapter |
| `content/` | Knowledge base, KB connectors, KB sync |
| `missions/` | Pipeline engine, workflow engine, seed templates/playbooks |
| `platform/` | Demo sandbox, governance, scheduler, SSE, webhook delivery |
| `prospecting/` | Prospecting worker, seed outreach templates |

## Middleware (`src/middleware/`)

Flat — shared across all domains: auth, rate-limit, audit, API keys, credit-meter, health-signals.

## Tools (`src/tools/`)

Flat — agentic loop, tool registry, individual tool implementations.
