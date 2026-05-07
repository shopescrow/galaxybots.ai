ALTER TABLE mcp_directory_submissions
  ADD COLUMN IF NOT EXISTS submission_payload JSONB;

WITH server AS (
  SELECT id FROM mcp_servers WHERE sse_url = 'https://galaxybots.ai/__mcp/sse' AND is_own = TRUE LIMIT 1
)
UPDATE mcp_directory_submissions ds
SET submission_payload = CASE ds.directory_slug
  WHEN 'mcp-so' THEN '{
    "name": "GalaxyBots MCP Server",
    "description": "Enterprise-grade MCP server providing AI agents with real-time business intelligence, CRM data, compliance monitoring, prospecting research, and knowledge base access. Fortune 500 AI automation in one API call.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "crm:write", "compliance:read", "knowledge:read", "prospects:write", "analytics:read"],
    "categories": ["enterprise", "crm", "business-intelligence", "compliance", "ai-agents"],
    "tags": ["enterprise", "crm", "compliance", "prospecting", "knowledge-base", "claude", "mcp", "ai-agents"],
    "submit_method": "web_form",
    "submit_url": "https://mcp.so/submit"
  }'::jsonb
  WHEN 'smithery' THEN '{
    "name": "GalaxyBots MCP Server",
    "description": "Connect Claude to live enterprise data: CRM pipelines, compliance monitoring, AI-powered prospecting, and semantic knowledge base search. Built for Fortune 500 AI automation workflows.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "crm:write", "compliance:read", "knowledge:read", "prospects:write"],
    "categories": ["enterprise", "business-intelligence", "crm"],
    "tags": ["enterprise", "crm", "pipeline", "compliance", "prospecting", "knowledge", "claude", "mcp"],
    "submit_method": "web_form",
    "submit_url": "https://smithery.ai/submit"
  }'::jsonb
  WHEN 'mcpmarket' THEN '{
    "name": "GalaxyBots MCP Server",
    "description": "The enterprise MCP server for AI agents. Real-time CRM pipelines, compliance audit automation, AI-powered prospect research (25M+ companies), and semantic knowledge base search — all in a single authenticated SSE endpoint.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "crm:write", "compliance:read", "knowledge:read", "prospects:write", "analytics:read"],
    "categories": ["enterprise", "crm", "compliance", "prospecting", "analytics"],
    "tags": ["enterprise", "crm", "compliance", "prospecting", "knowledge-base", "analytics", "mcp", "claude"],
    "submit_method": "web_form",
    "submit_url": "https://mcpmarket.com/submit"
  }'::jsonb
  WHEN 'aiagentslist' THEN '{
    "name": "GalaxyBots MCP Server",
    "description": "GalaxyBots gives Claude real-time enterprise context: live deal pipelines, compliance status across accounts, AI-researched prospect lists, and full knowledge base search. Purpose-built for mid-market and Fortune 500 AI deployments.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "compliance:read", "knowledge:read", "prospects:write"],
    "categories": ["enterprise", "ai-agents", "business-intelligence"],
    "tags": ["enterprise", "ai-agents", "crm", "compliance", "knowledge-base", "mcp", "claude"],
    "submit_method": "web_form",
    "submit_url": "https://aiagentslist.com/mcp-servers/submit"
  }'::jsonb
  WHEN 'pulsemcp' THEN '{
    "name": "GalaxyBots MCP Server",
    "description": "Enterprise AI orchestration via MCP. Connects Claude to CRM data, compliance monitoring, prospect intelligence, and organizational knowledge. One authenticated HTTP-SSE endpoint — 20+ tools, Resources, and Prompts included.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "crm:write", "compliance:read", "knowledge:read", "prospects:write", "analytics:read"],
    "categories": ["enterprise", "crm", "business-intelligence", "compliance"],
    "tags": ["enterprise", "crm", "compliance", "prospecting", "knowledge", "mcp", "claude", "http-sse"],
    "submit_method": "web_form",
    "submit_url": "https://pulsemcp.com/submit"
  }'::jsonb
  WHEN 'official-registry' THEN '{
    "name": "galaxybots-mcp",
    "description": "GalaxyBots MCP server providing AI agents with real-time enterprise data access: CRM pipelines, compliance audit, prospect research, and knowledge base search. HTTP-SSE transport, API key auth.",
    "url": "https://galaxybots.ai/__mcp/sse",
    "auth": "api_key",
    "tool_count": 20,
    "scopes": ["crm:read", "crm:write", "compliance:read", "knowledge:read", "prospects:write", "analytics:read"],
    "categories": ["enterprise", "business-intelligence"],
    "tags": ["enterprise", "crm", "compliance", "knowledge-base", "mcp", "http-sse"],
    "submit_method": "github_pr",
    "submit_url": "https://github.com/modelcontextprotocol/servers/pulls",
    "github_pr_instructions": "Submit a PR adding galaxybots-mcp to servers/README.md in the Remote Servers section"
  }'::jsonb
  ELSE NULL
END
FROM server
WHERE ds.mcp_server_id = server.id
  AND ds.directory_slug IN ('mcp-so', 'smithery', 'mcpmarket', 'aiagentslist', 'pulsemcp', 'official-registry');
