CREATE TABLE IF NOT EXISTS mcp_servers (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sse_url TEXT,
  auth_type TEXT NOT NULL DEFAULT 'api_key',
  tags JSONB NOT NULL DEFAULT '[]',
  is_own BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_directory_submissions (
  id SERIAL PRIMARY KEY,
  mcp_server_id INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  directory_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  submitted_at TIMESTAMPTZ,
  listing_url TEXT,
  optimized_description TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mcp_server_id, directory_slug)
);
