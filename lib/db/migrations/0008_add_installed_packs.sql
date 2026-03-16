CREATE TABLE IF NOT EXISTS installed_packs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, pack_id)
);
