CREATE TABLE IF NOT EXISTS mcp_leads (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL,
  company TEXT,
  source TEXT NOT NULL DEFAULT 'launch_page',
  query_context JSONB,
  partner_key_id INTEGER REFERENCES platform_api_keys(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE mcp_leads ADD COLUMN IF NOT EXISTS query_context JSONB;
ALTER TABLE mcp_leads ADD COLUMN IF NOT EXISTS partner_key_id INTEGER REFERENCES platform_api_keys(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mcp_leads_email_source_idx ON mcp_leads(email, source);
CREATE INDEX IF NOT EXISTS mcp_leads_source_idx ON mcp_leads(source);
CREATE INDEX IF NOT EXISTS mcp_leads_partner_key_id_idx ON mcp_leads(partner_key_id);
CREATE INDEX IF NOT EXISTS mcp_leads_created_at_idx ON mcp_leads(created_at);
