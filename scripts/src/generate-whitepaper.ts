import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

function requireDir(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Required directory not found: ${dir}`);
  }
  const entries = fs.readdirSync(dir).sort();
  if (entries.length === 0) {
    throw new Error(`Required directory is empty: ${dir}`);
  }
  return entries;
}

function listTsFiles(dir: string, excludeIndex = true): string[] {
  const entries = requireDir(dir);
  return entries.filter((f) => f.endsWith(".ts") && (!excludeIndex || f !== "index.ts"));
}

function stripExt(name: string): string {
  return name.replace(/\.ts$/, "");
}

interface ArtifactInfo {
  name: string;
  dir: string;
  kind: string;
  previewPath: string;
}

function readArtifacts(): ArtifactInfo[] {
  const artifactsDir = path.join(workspaceRoot, "artifacts");
  const dirs = requireDir(artifactsDir).filter((d) =>
    fs.statSync(path.join(artifactsDir, d)).isDirectory()
  );

  const kindMap: Record<string, string> = {
    "api-server": "api",
    "galaxybots": "web",
    "bingolingo": "web",
    "mcp-server": "web",
    "mobile": "mobile (Expo React Native)",
    "mockup-sandbox": "design (internal)",
  };

  const previewMap: Record<string, string> = {
    "api-server": "/api",
    "galaxybots": "/",
    "bingolingo": "/bingolingo",
    "mcp-server": "/__mcp",
    "mobile": "/mobile",
    "mockup-sandbox": "/__mockup",
  };

  const nameMap: Record<string, string> = {
    "api-server": "API Server",
    "galaxybots": "GalaxyBots.ai",
    "bingolingo": "BingoLingo.ai",
    "mcp-server": "MCP Server",
    "mobile": "GalaxyBots Mobile",
    "mockup-sandbox": "Component Preview Server",
  };

  return dirs.map((dir) => ({
    name: nameMap[dir] ?? dir,
    dir,
    kind: kindMap[dir] ?? "web",
    previewPath: previewMap[dir] ?? `/${dir}`,
  }));
}

function readWorkspacePackages(): string[] {
  const yamlPath = path.join(workspaceRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(yamlPath)) {
    throw new Error("pnpm-workspace.yaml not found at workspace root");
  }
  const content = fs.readFileSync(yamlPath, "utf-8");
  const lines = content.split("\n");

  const packages: string[] = [];
  let inPackagesBlock = false;

  for (const line of lines) {
    if (/^packages\s*:/.test(line)) {
      inPackagesBlock = true;
      continue;
    }
    if (inPackagesBlock) {
      if (/^\S/.test(line) && !line.trim().startsWith("-")) {
        break;
      }
      const match = line.match(/^\s+-\s+(.+)/);
      if (match) {
        packages.push(match[1].trim().replace(/['"]/g, ""));
      }
    }
  }

  if (packages.length === 0) {
    throw new Error("No packages found in pnpm-workspace.yaml packages: block");
  }
  return packages;
}

function readLibPackages(): string[] {
  const libDir = path.join(workspaceRoot, "lib");
  const entries = requireDir(libDir);
  return entries.filter((entry) =>
    fs.statSync(path.join(libDir, entry)).isDirectory() &&
    !entry.startsWith(".")
  ).sort();
}

function schemaDescription(name: string): string {
  const map: Record<string, string> = {
    "aeo-recommendation-cache": "Cached AEO optimization recommendations per scan request",
    "aeo-scan-requests": "PirateMonster AEO scan jobs triggered for client URLs",
    "aeo-scores": "Tracked AEO (AI Engine Optimization) scores over time per URL",
    "aeo-webhooks": "Webhook delivery records for AEO score change notifications",
    "audit-log": "Platform-level audit trail of user and system actions",
    "bingolingo": "BingoLingo content pieces, blog posts, and campaign metadata",
    "blog_posts": "Blog posts created through the Document Studio",
    "boardroom": "Boardroom sessions linking multiple bots to a shared task context",
    "bot-audit-log": "Per-bot audit trail of tool executions and agent decisions",
    "bots": "Bot definitions: name, persona, model, system prompt, capabilities",
    "client_bots": "Junction table assigning bots to specific client accounts",
    "client-cost-caps": "Per-client monthly LLM cost caps and current usage",
    "client-health": "Client health scores and performance indicators",
    "client-integrations": "Third-party integration credentials per client (encrypted)",
    "client-stakeholders": "Stakeholder contacts for client accounts",
    "clients": "Tenant accounts — each client is an isolated workspace",
    "competitor-urls": "Competitor URLs tracked for AEO and ranking comparison",
    "compliance": "Compliance records, policies, and review statuses",
    "conversations": "Chat conversations between users and bots",
    "developer-api-keys": "API keys for external developer access to the platform",
    "documents": "Documents uploaded or generated through Document Studio",
    "governance": "Bot governance policies, permissions, and approval workflows",
    "guest-sessions": "Ephemeral guest sessions for live demo and preview mode",
    "installed-packs": "Industry vertical packs installed for a client",
    "journal": "Bot-written journal entries for autonomous reflection and logging",
    "knowledge-base": "Knowledge base chunks and document records for RAG retrieval",
    "knowledge-base-sources": "Source documents uploaded to the knowledge base",
    "llm-usage-log": "Token usage and cost tracking per LLM call",
    "marketplace": "Bot and scenario marketplace listing records",
    "mcp-tool-calls": "Tool call records from the MCP server sessions",
    "memory": "Bot long-term memories with pgvector embeddings for RAG",
    "messages": "Individual messages within conversations",
    "notifications": "In-app notifications for users",
    "partner_registrations": "Partner onboarding registration requests",
    "partner-tiers": "White-label partner tier definitions and pricing",
    "partners": "White-label partner accounts",
    "pipelines": "Automated pipeline definitions (triggers, steps, schedules)",
    "platform-api-keys": "Internal platform API keys for service-to-service auth",
    "proposals": "AI-generated sales proposals and pitch documents",
    "prospects": "Sales prospects tracked through the outreach funnel",
    "push-tokens": "Mobile device push notification tokens",
    "receptionist": "AI Receptionist config: voice, CRM routing, call handling",
    "session-outcomes": "Outcomes and performance metrics per bot task session",
    "sso": "Enterprise SSO SAML configuration per tenant",
    "subscription-plans": "Stripe subscription plans and feature entitlements",
    "task-sessions": "Bot team task sessions grouping multiple bot conversations",
    "tool-activity-log": "Every tool invocation with input/output and latency",
    "user-preferences": "Per-user UI preferences and dashboard personalization",
    "users": "Platform users with role, tenant, and auth metadata",
    "voice-intelligence": "Call transcripts, analysis, and AI follow-up records",
    "webhook-deliveries": "Outbound webhook delivery attempts and statuses",
    "world-state": "Persistent world-state key-value store per bot/client",
  };
  return map[name] ?? "Platform data table";
}

function routeDescription(name: string): string {
  const map: Record<string, string> = {
    analytics: "Usage analytics, token cost metrics, and data science exports",
    audit: "Audit log retrieval and export",
    auth: "Authentication: login, logout, JWT cookie management",
    billing: "Stripe subscription management and billing portal",
    bingolingo: "BingoLingo content platform API (cross-service bridge)",
    blog: "Blog post creation, editing, and publishing",
    boardroom: "Boardroom session management (multi-bot task rooms)",
    bots: "Bot CRUD, persona management, and agentic loop execution",
    "client-health": "Client health score computation and reporting",
    "client-integrations": "Third-party integration connect/disconnect per client",
    "client-portal": "Stakeholder-facing client portal endpoints",
    clients: "Client (tenant) account management",
    "command-center": "Owner command center aggregated dashboard data",
    compliance: "Compliance record management and review workflows",
    conversations: "Conversation history and messaging",
    demo: "Live demo guest mode sandboxed endpoints",
    developer: "Developer API key management and webhook configuration",
    documents: "Document Studio upload, generation, and export",
    governance: "Bot permission policies and tool approval workflows",
    health: "Server health check endpoint",
    journal: "Bot journal entry retrieval and creation",
    "knowledge-base": "Knowledge base document upload and RAG query",
    marketplace: "Bot and scenario marketplace browse and install",
    memory: "Bot memory storage and similarity search",
    notifications: "In-app notification delivery and read status",
    onboarding: "New client onboarding wizard steps",
    "org-admin": "Organization-level admin management (multi-client orgs)",
    packs: "Industry vertical starter pack installation",
    partner: "Partner portal: clients, billing, and white-label config",
    pipelines: "Pipeline builder: create, run, and schedule automations",
    piratemonster: "PirateMonster AEO integration: scans and score webhooks",
    proposals: "AI Proposal Studio: generate and manage sales proposals",
    prospects: "Prospector: lead capture, enrichment, and outreach",
    "push-tokens": "Mobile push notification token registration",
    receptionist: "AI Receptionist: call config and transcript retrieval",
    roi: "ROI calculator and proof-of-value report generation",
    scim: "SCIM 2.0 user provisioning for enterprise SSO",
    sso: "SAML SSO configuration and IdP-initiated login",
    storage: "Object storage upload/download (images, files)",
    "task-sessions": "Task session lifecycle management",
    "translate": "AI translation endpoints",
    triggers: "Event trigger definitions for pipelines",
    "user-preferences": "User dashboard and UI preference management",
    "voice-intelligence": "AI voice call analysis and follow-up routing",
    webhooks: "Outbound webhook configuration and delivery logs",
  };
  return map[name] ?? "API route module";
}

function toolDescription(name: string): string {
  const map: Record<string, string> = {
    "definitions": "Core tool definitions: web_search, memory retrieval, task management, bot messaging",
    "operational-tools": "Operational tools: send_email, scrape_url, Google Sheets, Twilio SMS, Stripe",
    "expanded-tools": "Expanded Anthropic-powered tools: deep research, document drafting, multi-step analysis",
    "aeo-tools": "AEO tools: trigger PirateMonster scans, retrieve AEO scores and recommendations",
    "competitor-tools": "Competitor intelligence tools: URL monitoring and ranking comparison",
    "prospect-tools": "Prospector tools: lead enrichment, scoring, and CRM sync",
    "outreach-tools": "Outreach tools: personalized email sequences and campaign management",
    "content-attribution-tools": "Content attribution tools: link BingoLingo posts to AEO score improvements",
    "agentic-loop": "Core agentic loop engine: multi-iteration LLM calls with tool execution and SSE streaming",
    "registry": "Tool registry: registerTool(), getTool(), getAllTools(), getOpenAIToolDefinitions()",
  };
  return map[name] ?? "Tool module";
}

interface TaskEntry {
  filename: string;
  title: string;
  mtime: number;
}

function extractTaskEntries(): TaskEntry[] {
  const tasksDir = path.join(workspaceRoot, ".local/tasks");
  const taskFiles = requireDir(tasksDir).filter((f) => f.endsWith(".md"));

  const entries: TaskEntry[] = [];
  for (const file of taskFiles) {
    const filePath = path.join(tasksDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const mtime = fs.statSync(filePath).mtimeMs;
    const match = content.match(/^#\s+(.+)$/m);
    if (match) {
      entries.push({ filename: file, title: match[1].trim(), mtime });
    }
  }

  entries.sort((a, b) => a.mtime - b.mtime);
  return entries;
}

function artifactDescriptionBlock(info: ArtifactInfo): string {
  const techMap: Record<string, string> = {
    "api-server": "Express, Drizzle ORM, OpenAI SDK, Anthropic SDK, Zod",
    "galaxybots": "React 19, Vite 7, TailwindCSS 4, TanStack Query, shadcn/ui",
    "bingolingo": "React 19, Vite 7, TailwindCSS 4, TanStack Query",
    "mcp-server": "MCP SDK, Express, Drizzle ORM",
    "mobile": "Expo SDK, React Native, TanStack Query",
    "mockup-sandbox": "React 19, Vite 7",
  };

  const descMap: Record<string, string> = {
    "api-server": "The API server is the brain of the platform. Every client request flows through it. It handles authentication, multi-tenant data isolation, the agentic loop, tool execution, SSE streaming, and all third-party integrations.",
    "galaxybots": "The GalaxyBots web app is the main product interface. Clients use it to manage their bot roster, run boardroom task sessions, monitor pipelines, view analytics, and manage integrations. It communicates exclusively with the API Server via the generated `@workspace/api-client-react` hooks.",
    "bingolingo": "BingoLingo lets clients generate, schedule, and publish AI-written blog content optimized for both traditional SEO and AI engine citations (AEO). It integrates with the GalaxyBots agent system so bots can trigger content campaigns autonomously.",
    "mcp-server": "The MCP Server exposes GalaxyBots capabilities (bots, sessions, knowledge base, pipelines) as MCP-compatible tools. External AI clients (Claude Desktop, Cursor, etc.) can connect and orchestrate the platform remotely.",
    "mobile": "The mobile app gives clients a command center view on iOS and Android: monitor bot activity, approve pending tool calls, review session outcomes, and receive push notifications for critical events.",
    "mockup-sandbox": "Used during development to preview UI components in isolation before integrating them into the main apps.",
  };

  const tech = techMap[info.dir] ?? "TypeScript, Node.js";
  const desc = descMap[info.dir] ?? `The ${info.name} artifact.`;

  return `### ${info.name} (\`artifacts/${info.dir}\`)

| Property | Value |
|---|---|
| Kind | ${info.kind} |
| Preview path | \`${info.previewPath}\` |
| Tech stack | ${tech} |

${desc}`;
}

function libDescription(name: string): string {
  const map: Record<string, string> = {
    "db": "The single source of truth for the database schema. Uses **Drizzle ORM** with PostgreSQL. All tables are defined as Drizzle schema objects and exported from `lib/db/src/schema/index.ts`. The `@workspace/db` package exports both the schema tables and a pre-configured `db` client instance.",
    "api-spec": "The OpenAPI 3.x spec that defines every API route, request/response shape, and authentication requirement. This is the **single source of truth for the API contract**. Do not hand-write API client code — use the Orval codegen workflow to generate clients from this spec.",
    "api-client-react": "Auto-generated by Orval from the OpenAPI spec. Provides typed TanStack Query hooks for every API endpoint. Consumed by the web apps and mobile app. Regenerate with `pnpm codegen` after updating the spec.",
    "api-zod": "Auto-generated by Orval from the OpenAPI spec. Provides Zod schemas for all request and response types. Used server-side for validation and client-side for form handling.",
    "integrations": "Base integrations package containing shared utilities and types for third-party service integrations.",
    "integrations-anthropic-ai": "Pre-configured Anthropic Claude client with retry logic, rate limit handling, and batch processing helpers. All Anthropic calls go through this package.",
    "integrations-openai-ai-react": "React hooks and streaming helpers for OpenAI-powered UI features.",
    "integrations-openai-ai-server": "Pre-configured OpenAI client for server-side use with retry logic, rate limit detection, and cost tracking utilities.",
  };
  return map[name] ?? `Shared library package: \`@workspace/${name}\`.`;
}

function generateWhitepaper(): string {
  const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

  const artifacts = readArtifacts();
  const workspacePackages = readWorkspacePackages();
  const libPackages = readLibPackages();

  const schemaDir = path.join(workspaceRoot, "lib/db/src/schema");
  const routesDir = path.join(workspaceRoot, "artifacts/api-server/src/routes");
  const toolsDir = path.join(workspaceRoot, "artifacts/api-server/src/tools");

  const schemaFiles = listTsFiles(schemaDir, true);
  const routeFiles = listTsFiles(routesDir, true);
  const toolFiles = listTsFiles(toolsDir, true);

  const taskEntries = extractTaskEntries();

  const artifactSections = artifacts.map(artifactDescriptionBlock).join("\n\n");

  const libSections = libPackages.map((pkg) => {
    const pkgAlias = `@workspace/${pkg}`;
    return `### \`lib/${pkg}\` — \`${pkgAlias}\`\n\n${libDescription(pkg)}`;
  }).join("\n\n");

  const workspacePackageList = workspacePackages.map((p) => `- \`${p}\``).join("\n");

  const schemaRows = schemaFiles.map((f) => {
    const name = stripExt(f);
    return `| \`${name}\` | ${schemaDescription(name)} |`;
  }).join("\n");

  const routeRows = routeFiles.map((f) => {
    const name = stripExt(f);
    return `| \`${name}\` | ${routeDescription(name)} |`;
  }).join("\n");

  const toolRows = toolFiles.map((f) => {
    const name = stripExt(f);
    return `| \`${name}\` | ${toolDescription(name)} |`;
  }).join("\n");

  const changelogItems = taskEntries.map((t) => `- **${t.title}**`).join("\n");

  return `# GalaxyBots Developer Whitepaper

> **Last generated:** ${timestamp}
>
> This document is auto-generated by \`scripts/src/generate-whitepaper.ts\`. Run \`pnpm docs\` from the workspace root to refresh it. Sections marked **[auto-generated]** are produced by introspecting the live codebase.

---

## Table of Contents

1. [Project Vision & What GalaxyBots Is](#1-project-vision--what-galaxybots-is)
2. [Monorepo Overview](#2-monorepo-overview)
3. [Artifacts](#3-artifacts)
4. [Shared Libraries](#4-shared-libraries)
5. [Database Schema](#5-database-schema-auto-generated)
6. [API Route Inventory](#6-api-route-inventory-auto-generated)
7. [Agent Tool Registry](#7-agent-tool-registry-auto-generated)
8. [Authentication & Tenant Model](#8-authentication--tenant-model)
9. [The Agentic Loop](#9-the-agentic-loop)
10. [Memory & RAG System](#10-memory--rag-system)
11. [Key Integrations](#11-key-integrations)
12. [Developer Setup](#12-developer-setup)
13. [Coding Conventions](#13-coding-conventions)
14. [Feature Changelog](#14-feature-changelog)

---

## 1. Project Vision & What GalaxyBots Is

GalaxyBots is a **white-label AI agent platform** that lets businesses deploy a coordinated team of AI bots to run real business operations: marketing, sales, customer service, compliance, finance, and beyond. Each bot is a persona-driven agent with long-term memory, access to a structured tool suite, and the ability to take autonomous actions across third-party systems.

The platform is built around three interconnected products:

- **GalaxyBots.ai** — The core AI agent platform. Clients hire AI executives (bots) organized into a virtual boardroom that runs task sessions, pipelines, and autonomous workflows.
- **BingoLingo.ai** — An AI content marketing platform that generates SEO/AEO-optimized blog posts and tracks which content earns AI engine citations.
- **PirateMonster** — An AEO (AI Engine Optimization) intelligence platform integrated via third-party API that scores how well clients appear in AI-generated answers.

The three products share a single API server, database, and agent infrastructure. Partners can white-label the entire stack under their own brand, domain, and pricing.

---

## 2. Monorepo Overview

The project is a **pnpm monorepo** defined in \`pnpm-workspace.yaml\`. All packages share a centralized dependency catalog to prevent version drift.

### Workspace Packages **[auto-generated]**

> Packages are auto-extracted from \`pnpm-workspace.yaml\`.

${workspacePackageList}

### Directory Structure

\`\`\`
workspace root
├── artifacts/          # Runnable application artifacts (web apps, API, mobile)
│   ├── api-server/     # Express REST API + agentic loop
│   ├── galaxybots/     # React/Vite main web app
│   ├── bingolingo/     # React/Vite BingoLingo.ai web app
│   ├── mcp-server/     # Model Context Protocol server
│   ├── mobile/         # Expo React Native mobile app
│   └── mockup-sandbox/ # Internal component preview server
├── lib/                # Shared TypeScript libraries
│   ├── db/             # Drizzle ORM schema + client
│   ├── api-spec/       # OpenAPI specification (source of truth)
│   ├── api-client-react/ # React Query hooks (Orval-generated)
│   ├── api-zod/        # Zod validators (Orval-generated)
│   └── integrations-*/  # AI provider SDK wrappers
├── scripts/            # Developer utility scripts (seed, generate-whitepaper)
├── package.json        # Root workspace scripts
└── pnpm-workspace.yaml # Workspace + catalog configuration
\`\`\`

**Key conventions:**
- TypeScript strict mode everywhere
- All cross-package imports use the \`@workspace/*\` alias
- The OpenAPI spec in \`lib/api-spec\` drives automatic client and validator generation via Orval
- Shared dependency versions are pinned in the \`catalog:\` block of \`pnpm-workspace.yaml\`

---

## 3. Artifacts **[auto-generated]**

> Artifact list is auto-extracted from the \`artifacts/\` directory. Each artifact is an independently deployable unit with its own dev server, port (read from the \`PORT\` environment variable), and preview path in the Replit proxy.

${artifactSections}

---

## 4. Shared Libraries **[auto-generated]**

> Library list is auto-extracted from the \`lib/\` directory. All shared libraries live under \`lib/\` and are imported via \`@workspace/<name>\`.

${libSections}

---

## 5. Database Schema **[auto-generated]**

> Schema tables are auto-extracted from \`lib/db/src/schema/\`. The database is PostgreSQL with the \`pgvector\` extension enabled for embedding storage. The \`index.ts\` file re-exports all tables.

| Table file | Description |
|---|---|
${schemaRows}

---

## 6. API Route Inventory **[auto-generated]**

> Route files are auto-extracted from \`artifacts/api-server/src/routes/\`. All routes are mounted under the \`/api\` path prefix. The \`index.ts\` file composes all routers.

| Route module | Description |
|---|---|
${routeRows}

---

## 7. Agent Tool Registry **[auto-generated]**

> Tool files are auto-extracted from \`artifacts/api-server/src/tools/\`. Each tool is registered with \`registerTool()\` and becomes available to every bot in the agentic loop.

| Tool module | Description |
|---|---|
${toolRows}

---

## 8. Authentication & Tenant Model

### Authentication

Authentication is **JWT-based using HTTP-only cookies**. The flow:

1. User logs in via \`POST /api/auth/login\` with email + password (bcrypt-hashed).
2. The server issues a signed JWT stored in an HTTP-only \`session\` cookie.
3. Every subsequent API request carries the cookie; middleware extracts and verifies the JWT.
4. The JWT payload includes \`userId\`, \`clientId\`, \`role\`, and \`partnerId\`.

Roles include: \`owner\`, \`admin\`, \`member\`, \`stakeholder\`, and \`guest\`. The \`requireRole\` middleware enforces role-based access on protected routes.

Enterprise clients can configure **SAML SSO** via the \`/api/sso\` routes. The platform also supports **SCIM 2.0** for automated user provisioning from identity providers.

### Tenant Isolation

Every database table that holds client data includes a \`clientId\` foreign key referencing the \`clients\` table. All queries in route handlers and services are scoped to the authenticated user's \`clientId\` — there is no cross-tenant data leakage by construction.

### Rate Limiting

LLM endpoints are protected by the \`llmRateLimit\` middleware (token-bucket algorithm per client). Each client can configure custom cost caps via the \`client-cost-caps\` table, enforced per-request by the billing service.

---

## 9. The Agentic Loop

The agentic loop (\`artifacts/api-server/src/tools/agentic-loop.ts\`) is the engine that turns a user message into a bot response. The lifecycle:

1. **Request arrives** at a conversation or task session endpoint.
2. **System prompt is assembled** from the bot's persona definition, world state, and any retrieved memories.
3. **LLM call is made** (OpenAI or Anthropic) with the conversation history + tool definitions.
4. **Tool calls are extracted** from the LLM response. Each tool call is:
   - Validated against the Zod input schema
   - Checked against governance policies (some tools require approval)
   - Executed with retry logic (up to 3 attempts with exponential backoff)
   - Rate-limited by \`pLimit(3)\` to cap concurrent tool calls
5. **Tool results** are appended to the message history and the LLM is called again.
6. **This iterates** until the LLM produces a final text response (no more tool calls) or \`maxIterations\` is reached (default: 10).
7. **Events are streamed** to the client via **Server-Sent Events (SSE)** throughout the loop: \`tool_call\`, \`tool_result\`, \`message\`, \`bot_complete\`, \`error\`, \`done\`.
8. **LLM usage is logged** to the \`llm-usage-log\` table after each call for cost tracking.

---

## 10. Memory & RAG System

The platform uses **pgvector** (PostgreSQL extension) to store and retrieve vector embeddings for two types of memory:

### Bot Memories (Long-Term Memory)

Stored in the \`bot_memories\` table. After each session, the agentic loop summarizes key facts and stores them as 1536-dimensional embeddings (OpenAI \`text-embedding-3-small\`). On the next session, the most semantically similar memories are retrieved and injected into the bot's system prompt. This gives bots continuity across conversations without overflowing the context window.

### Knowledge Base (RAG)

Clients upload documents (PDF, DOCX, TXT) via the knowledge base UI. The API server:
1. Chunks the document into ~500-token segments.
2. Embeds each chunk with OpenAI embeddings.
3. Stores chunks in \`knowledge_base_chunks\` with their embeddings.

When a bot handles a query, the platform performs a **cosine similarity search** over the client's knowledge base chunks and injects the top-k most relevant chunks into the system prompt before the LLM call. This is the core RAG (Retrieval-Augmented Generation) implementation.

---

## 11. Key Integrations

| Integration | Purpose | Package / Credential |
|---|---|---|
| **OpenAI** | Primary LLM (GPT-4o), embeddings, and tool calling | \`@workspace/integrations-openai-ai-server\`, \`OPENAI_API_KEY\` |
| **Anthropic** | Secondary LLM (Claude) for expanded tools and batch processing | \`@workspace/integrations-anthropic-ai\`, \`ANTHROPIC_API_KEY\` |
| **Twilio** | AI Receptionist: inbound voice calls and SMS outreach | Stored per-client in \`client_integrations\` |
| **ElevenLabs** | Real-time voice synthesis for AI Receptionist calls | Stored per-client in \`client_integrations\` |
| **Stripe** | Subscription billing, payment links, and client invoicing | \`STRIPE_SECRET_KEY\`, \`STRIPE_WEBHOOK_SECRET\` |
| **PirateMonster** | AEO score tracking and AI citation intelligence | \`PIRATEMONSTER_API_KEY\` |
| **HubSpot / Salesforce** | CRM sync for receptionist call logs and prospect data | Stored per-client in \`client_integrations\` |
| **Google Sheets** | Data export and import for operational automation tools | Stored per-client in \`client_integrations\` |

Third-party credentials are stored encrypted in the \`client_integrations\` table (AES-256-GCM). The \`decryptCredential()\` utility in \`artifacts/api-server/src/utils/credential-encryption.ts\` handles decryption at call time.

---

## 12. Developer Setup

### Prerequisites

- Node.js 20+ (managed via Replit's Nix environment)
- pnpm 9+ (\`npm install -g pnpm\`)
- PostgreSQL with the \`pgvector\` extension
- A Replit account (the project uses Replit's managed PostgreSQL and secrets)

### Clone & Install

\`\`\`bash
git clone <repo-url>
cd workspace
pnpm install
\`\`\`

### Environment Secrets

The following secrets must be set (via Replit Secrets or a local \`.env\` file):

| Secret | Required | Purpose |
|---|---|---|
| \`DATABASE_URL\` | Yes | PostgreSQL connection string |
| \`SESSION_SECRET\` | Yes | JWT signing secret |
| \`OPENAI_API_KEY\` | Yes | OpenAI LLM and embeddings |
| \`ANTHROPIC_API_KEY\` | Recommended | Anthropic Claude tools |
| \`STRIPE_SECRET_KEY\` | For billing | Stripe payment processing |
| \`STRIPE_WEBHOOK_SECRET\` | For billing | Stripe webhook verification |
| \`PIRATEMONSTER_API_KEY\` | For AEO | PirateMonster AEO integration |

### Running the Platform

Each artifact has its own workflow. In Replit, these start automatically. Locally:

\`\`\`bash
# API Server (port from PORT env var, default 3001)
cd artifacts/api-server && pnpm dev

# Main web app (GalaxyBots.ai)
cd artifacts/galaxybots && pnpm dev

# BingoLingo
cd artifacts/bingolingo && pnpm dev

# MCP Server
cd artifacts/mcp-server && pnpm dev
\`\`\`

### Database Migrations

\`\`\`bash
cd lib/db
pnpm drizzle-kit generate  # generate migration SQL from schema changes
pnpm drizzle-kit migrate   # apply migrations to the database
\`\`\`

### Regenerate API Clients

After modifying \`lib/api-spec\`:

\`\`\`bash
pnpm codegen   # runs Orval to regenerate api-client-react and api-zod
\`\`\`

### Regenerate This Whitepaper

\`\`\`bash
pnpm docs      # runs scripts/src/generate-whitepaper.ts via tsx
\`\`\`

### Seed the Database

\`\`\`bash
cd scripts
pnpm seed-bots     # seed default bot personas
pnpm seed-blog     # seed sample blog posts
\`\`\`

---

## 13. Coding Conventions

### TypeScript

- **Strict mode** is enabled everywhere (\`"strict": true\` in \`tsconfig.base.json\`).
- No \`any\` unless absolutely unavoidable (use \`unknown\` + type narrowing instead).
- Prefer \`type\` over \`interface\` for object shapes unless the type needs to be extended.
- All async functions return explicit \`Promise<T>\` types.

### Drizzle ORM Patterns

\`\`\`typescript
// Always scope queries to clientId
const rows = await db
  .select()
  .from(someTable)
  .where(and(
    eq(someTable.clientId, ctx.clientId),
    eq(someTable.id, id)
  ));

// Insert and return the new row
const [newRow] = await db
  .insert(someTable)
  .values({ clientId, ...data })
  .returning();
\`\`\`

- Never use raw SQL strings unless using the \`sql\` template tag from drizzle-orm.
- All schema changes go in \`lib/db/src/schema/\`, never in migration files directly.

### Zod Validation

- Every API route validates request bodies with a Zod schema before processing.
- Use \`createInsertSchema\` / \`createSelectSchema\` from \`drizzle-zod\` to derive schemas from table definitions.
- Prefer \`.safeParse()\` in tool implementations so errors can be returned gracefully.

### OpenAPI / Orval Codegen

- The \`lib/api-spec\` OpenAPI YAML is the **contract**. Route implementations must match it.
- Never write React Query hooks or fetch calls by hand — generate them from the spec.
- After adding a new route to the spec, run \`pnpm codegen\` and commit the generated files.

### Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Database tables | \`snake_case\` Drizzle table variable + \`Table\` suffix | \`botsTable\`, \`clientsTable\` |
| Route files | \`kebab-case.ts\` | \`client-integrations.ts\` |
| Tool names | \`snake_case\` strings | \`"web_search"\`, \`"send_email"\` |
| React components | \`PascalCase\` | \`BotCard\`, \`TaskSessionView\` |
| Environment variables | \`SCREAMING_SNAKE_CASE\` | \`OPENAI_API_KEY\` |

### Error Handling

- API routes return consistent error shapes: \`{ error: string, details?: unknown }\`.
- Tool execute functions throw on unrecoverable errors; the agentic loop catches and retries.
- Never swallow errors silently — either throw, return an error object, or log via \`console.error\`.

---

## 14. Feature Changelog **[auto-generated]**

> Tasks are auto-extracted from \`.local/tasks/\` and sorted by file modification time (ascending) to approximate merge order.

${changelogItems}

---

*This whitepaper was auto-generated by \`scripts/src/generate-whitepaper.ts\`. Run \`pnpm docs\` to refresh.*
`;
}

const whitepaper = generateWhitepaper();
const outputPath = path.join(workspaceRoot, "WHITEPAPER.md");
fs.writeFileSync(outputPath, whitepaper, "utf-8");
console.log(`WHITEPAPER.md written to ${outputPath} (${Math.round(whitepaper.length / 1024)}KB)`);
