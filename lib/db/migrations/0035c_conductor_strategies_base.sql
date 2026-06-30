-- Create the conductor_strategies table (base schema, before adaptive-aggregation columns).
-- Later migrations (0036, 0038, 0039, 0046) ADD COLUMN IF NOT EXISTS on this table;
-- this migration must run first so those ALTERs have a table to target.

CREATE TABLE IF NOT EXISTS conductor_strategies (
  id serial PRIMARY KEY,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  task_category text NOT NULL,
  strategy_chosen text NOT NULL,
  rationale text NOT NULL,
  agents_used jsonb NOT NULL DEFAULT '[]',
  quality_score real,
  cost_usd real,
  duration_ms integer,
  session_id text,
  context_type text NOT NULL DEFAULT 'conversation',
  created_at timestamptz NOT NULL DEFAULT now()
);
