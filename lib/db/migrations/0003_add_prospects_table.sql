CREATE TABLE IF NOT EXISTS prospects (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  domain TEXT,
  phone TEXT,
  email TEXT,
  social_links JSONB DEFAULT '{}',
  source_url TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'enriched', 'review_needed', 'qualified', 'contacted', 'rejected')),
  error_category TEXT CHECK (error_category IS NULL OR error_category IN ('network', 'parsing', 'not_found', 'validation')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  extraction_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects(status);
CREATE INDEX IF NOT EXISTS prospects_client_id_idx ON prospects(client_id);
CREATE INDEX IF NOT EXISTS prospects_confidence_idx ON prospects(confidence_score);
