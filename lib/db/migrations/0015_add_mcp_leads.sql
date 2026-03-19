CREATE TABLE IF NOT EXISTS mcp_leads (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  company TEXT,
  source TEXT NOT NULL,
  query_context JSONB,
  partner_key_id INTEGER REFERENCES platform_api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mcp_leads_source_idx ON mcp_leads(source);
CREATE INDEX IF NOT EXISTS mcp_leads_partner_key_id_idx ON mcp_leads(partner_key_id);
CREATE INDEX IF NOT EXISTS mcp_leads_created_at_idx ON mcp_leads(created_at);
