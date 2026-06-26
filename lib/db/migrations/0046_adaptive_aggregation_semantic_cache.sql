-- Task #216: Adaptive aggregation & semantic cache

-- Semantic cache: embedding-keyed dedupe of agent + summary outputs,
-- per-client isolation (NULL client_id = global/anonymous), TTL via expires_at.
CREATE TABLE IF NOT EXISTS semantic_cache (
  id serial PRIMARY KEY,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  cache_kind text NOT NULL,
  task_category text,
  query_text text NOT NULL,
  response_text text NOT NULL,
  model text,
  embedding vector(1536),
  hit_count integer NOT NULL DEFAULT 0,
  saved_cost_usd real NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS semantic_cache_client_kind_idx ON semantic_cache (client_id, cache_kind);
CREATE INDEX IF NOT EXISTS semantic_cache_expires_idx ON semantic_cache (expires_at);

-- Adaptive aggregation + cache telemetry on conductor_strategies.
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS aggregation_mode text;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS cache_hit boolean;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS cache_hit_rate real;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS cache_similarity real;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS cache_savings_usd real;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS adaptive_savings_usd real;
ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS adaptive_savings_ms integer;
