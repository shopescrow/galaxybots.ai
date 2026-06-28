-- Asset Studio foundation: portfolio of income-producing digital assets.

CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  manager_bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  description TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  target_platform TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  status_history JSONB DEFAULT '[]'::jsonb,
  revenue_to_date NUMERIC NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS assets_client_id_idx ON assets (client_id);
CREATE INDEX IF NOT EXISTS assets_status_idx ON assets (status);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets (type);
CREATE INDEX IF NOT EXISTS assets_updated_at_idx ON assets (updated_at);

CREATE TABLE IF NOT EXISTS asset_files (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  object_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_files_asset_id_idx ON asset_files (asset_id);
CREATE INDEX IF NOT EXISTS asset_files_client_id_idx ON asset_files (client_id);

CREATE TABLE IF NOT EXISTS asset_listings (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_url TEXT,
  external_id TEXT,
  listing_status TEXT NOT NULL DEFAULT 'planned',
  price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_listings_asset_id_idx ON asset_listings (asset_id);
CREATE INDEX IF NOT EXISTS asset_listings_client_id_idx ON asset_listings (client_id);

CREATE TABLE IF NOT EXISTS asset_revenue (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES asset_listings(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_revenue_asset_id_idx ON asset_revenue (asset_id);
CREATE INDEX IF NOT EXISTS asset_revenue_client_id_idx ON asset_revenue (client_id);
CREATE INDEX IF NOT EXISTS asset_revenue_occurred_at_idx ON asset_revenue (occurred_at);
