CREATE TABLE IF NOT EXISTS client_health_scores (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  score INTEGER NOT NULL DEFAULT 0,
  trend VARCHAR(20) NOT NULL DEFAULT 'stable',
  tag VARCHAR(20) NOT NULL DEFAULT 'unknown',
  top_signals JSONB DEFAULT '[]',
  recommended_action TEXT DEFAULT '',
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_scores_client ON client_health_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_health_scores_computed ON client_health_scores(computed_at);
CREATE INDEX IF NOT EXISTS idx_health_scores_tag ON client_health_scores(tag);

CREATE TABLE IF NOT EXISTS client_health_events (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  signal VARCHAR(100) NOT NULL,
  value VARCHAR(50) DEFAULT '1',
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_events_client ON client_health_events(client_id);
CREATE INDEX IF NOT EXISTS idx_health_events_signal ON client_health_events(signal);
CREATE INDEX IF NOT EXISTS idx_health_events_recorded ON client_health_events(recorded_at);

CREATE TABLE IF NOT EXISTS client_health_notes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  note TEXT NOT NULL,
  tag_override VARCHAR(20),
  author_name VARCHAR(255) DEFAULT 'Admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_health_notes_client ON client_health_notes(client_id);
