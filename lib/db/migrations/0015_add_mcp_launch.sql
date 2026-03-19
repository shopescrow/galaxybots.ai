CREATE TABLE IF NOT EXISTS mcp_leads (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,
  source TEXT NOT NULL DEFAULT 'launch_page',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mcp_leads_email_source_idx ON mcp_leads(email, source);

INSERT INTO mcp_servers (name, description, sse_url, auth_type, tags, is_own)
VALUES (
  'GalaxyBots MCP Server',
  'Enterprise-grade MCP server providing AI agents with real-time business intelligence, CRM data, compliance monitoring, prospecting research, and knowledge base access for Fortune 500 and mid-market organizations.',
  'https://galaxybots.ai/__mcp/sse',
  'api_key',
  '["enterprise", "crm", "business-intelligence", "compliance", "prospecting", "knowledge-base", "resources", "prompts", "mcp", "claude", "ai-agents"]',
  TRUE
)
ON CONFLICT DO NOTHING;

WITH server AS (
  SELECT id FROM mcp_servers WHERE sse_url = 'https://galaxybots.ai/__mcp/sse' LIMIT 1
)
INSERT INTO mcp_directory_submissions (mcp_server_id, directory_slug, status, updated_at)
SELECT
  server.id,
  dir.slug,
  'draft',
  NOW()
FROM server,
(VALUES
  ('mcp-so'),
  ('smithery'),
  ('mcpmarket'),
  ('aiagentslist'),
  ('pulsemcp'),
  ('official-registry')
) AS dir(slug)
ON CONFLICT (mcp_server_id, directory_slug) DO NOTHING;
