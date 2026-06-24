CREATE TABLE IF NOT EXISTS coordinator_client_settings (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT coordinator_client_settings_uq UNIQUE (client_id, setting_key)
);

CREATE INDEX IF NOT EXISTS coordinator_client_settings_client_id_idx
  ON coordinator_client_settings (client_id);
