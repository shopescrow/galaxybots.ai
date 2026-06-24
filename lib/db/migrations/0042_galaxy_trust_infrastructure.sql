CREATE TABLE IF NOT EXISTS galaxy_audit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER,
  session_id TEXT,
  pipeline_run_id TEXT,
  engine TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  outcome_quality_score REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS galaxy_audit_ledger_client_id_idx
  ON galaxy_audit_ledger (client_id);

CREATE INDEX IF NOT EXISTS galaxy_audit_ledger_session_id_idx
  ON galaxy_audit_ledger (session_id);

CREATE INDEX IF NOT EXISTS galaxy_audit_ledger_engine_idx
  ON galaxy_audit_ledger (engine);

CREATE INDEX IF NOT EXISTS galaxy_audit_ledger_created_at_idx
  ON galaxy_audit_ledger (created_at);

CREATE TABLE IF NOT EXISTS strategy_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_category TEXT NOT NULL,
  best_strategy TEXT NOT NULL,
  avg_quality_score REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS strategy_cache_task_category_uq
  ON strategy_cache (task_category);
