# GalaxyBots MCP Server

Enterprise-grade MCP server providing AI agents with real-time business intelligence, CRM data, compliance monitoring, prospecting research, and knowledge base access.

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## Quick Install

### Option 1: Claude Desktop (via mcp-remote)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "galaxybots": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://galaxybots.ai/__mcp/sse"],
      "env": {
        "GALAXYBOTS_API_KEY": "your-api-key"
      }
    }
  }
}
```

Restart Claude Desktop. GalaxyBots tools will appear automatically.

### Option 2: Remote HTTP (SSE)

Direct SSE endpoint for any MCP client that supports HTTP transport:

```
https://galaxybots.ai/__mcp/sse
```

Pass your API key in the Authorization header:
```
Authorization: Bearer your-api-key
```

### Option 3: Claude Code CLI

```bash
claude mcp add galaxybots \
  --transport http \
  --url https://galaxybots.ai/__mcp/sse \
  --header "Authorization: Bearer your-api-key"
```

---

## Connection Methods

| Method | Client | Command / Config |
|--------|--------|-----------------|
| **stdio (mcp-remote)** | Claude Desktop | `npx -y mcp-remote https://galaxybots.ai/__mcp/sse` |
| **Remote HTTP SSE** | Any HTTP MCP client | `https://galaxybots.ai/__mcp/sse` |
| **Claude Code CLI** | Claude Code | `claude mcp add galaxybots --transport http ...` |
| **VSCode MCP** | VSCode Copilot | Add to settings.json (see docs) |

---

## Tool Catalog

### CRM & Client Intelligence

| Tool | Description |
|------|-------------|
| `crm_get_clients` | List and search CRM client accounts with filters |
| `crm_get_client_detail` | Deep account profile with health score and contacts |
| `pipeline_snapshot` | Real-time deal pipeline grouped by stage |
| `client_health_summary` | Health scores and risk flags across all accounts |

### Prospect Research

| Tool | Description |
|------|-------------|
| `prospecting_search` | AI-powered company discovery with enrichment |
| `prospect_enrich` | Enrich a company record with firmographic data |
| `prospect_outreach_draft` | Generate personalized outreach for a prospect |

### Compliance & Governance

| Tool | Description |
|------|-------------|
| `compliance_status` | Compliance status for one or all client accounts |
| `audit_log_query` | Search audit events with time and actor filters |
| `governance_check` | Flag policy violations across accounts |

### Knowledge & Documents

| Tool | Description |
|------|-------------|
| `knowledge_search` | Semantic search across the organization's knowledge base |
| `document_get` | Retrieve a specific document by ID or slug |
| `knowledge_sources` | List all connected knowledge base sources |

### Analytics & Reporting

| Tool | Description |
|------|-------------|
| `analytics_summary` | High-level business metrics overview |
| `analytics_tool_usage` | MCP tool call trends and top tools |
| `roi_report` | ROI calculation for a client account |

### Agents & Automation

| Tool | Description |
|------|-------------|
| `bot_roster` | List configured AI agents with capabilities |
| `task_session_create` | Spin up an autonomous task room |
| `task_session_status` | Check status of a running task session |
| `create_brief` | Generate intelligence briefs for any topic |

### MCP Resources

| Resource | Description |
|----------|-------------|
| `galaxybots://pipeline` | Live deal pipeline as structured context |
| `galaxybots://accounts` | All client accounts with health status |
| `galaxybots://world-state` | Current business world state snapshot |
| `galaxybots://social-proof` | Platform metrics for social proof |

### MCP Prompts

| Prompt | Description |
|--------|-------------|
| `weekly-revenue-review` | Parameterized weekly pipeline and revenue analysis |
| `compliance-audit` | Compliance status sweep with risk summary |
| `prospect-list-build` | AI-guided prospect list construction |
| `morning-brief` | Daily briefing with priorities and actions |

---

## Scope Reference

| Scope | Description | Tier |
|-------|-------------|------|
| `tools:read` | Read-only tool access | Starter |
| `crm:read` | Read CRM data | Pro |
| `crm:write` | Write CRM records | Pro |
| `compliance:read` | Compliance audit access | Pro |
| `knowledge:read` | Knowledge base search | Pro |
| `prospects:write` | Create prospect records | Pro |
| `analytics:read` | Analytics and reporting | Scale |
| `admin:*` | Full administrative access | Scale |

---

## Authentication

**API Key** (quick start):
```
Authorization: Bearer YOUR_GALAXYBOTS_API_KEY
```

**OAuth 2.0** (enterprise):
```
Authorization endpoint: https://galaxybots.ai/api/oauth/authorize
Token endpoint:         https://galaxybots.ai/api/oauth/token
```

---

## Example Prompts

**Revenue Intelligence:**
> "Using the GalaxyBots MCP server, pull a real-time pipeline snapshot for my top 10 accounts, identify any deals that have gone stale in the past 14 days, and draft a re-engagement email for each."

**Market Research:**
> "Find 20 companies in the healthcare SaaS space with 100–500 employees that are likely evaluating AI automation vendors this quarter. Return enriched contact data and a personalized outreach angle for each."

**Compliance Audit:**
> "Check the latest compliance status across all active client accounts and flag any that have open audit items older than 30 days. Summarize the risk exposure."

---

## Links

- **Launch Page:** [galaxybots.ai/mcp-launch](https://galaxybots.ai/mcp-launch)
- **Developer Docs:** [galaxybots.ai/mcp-docs](https://galaxybots.ai/mcp-docs)
- **MCP Inspector:** [inspector.tools.modelcontextprotocol.io](https://inspector.tools.modelcontextprotocol.io/?serverUrl=https%3A%2F%2Fgalaxybots.ai%2F__mcp%2Fsse)
- **Pricing:** [galaxybots.ai/pricing](https://galaxybots.ai/pricing)

---

## License

MIT © GalaxyBots
