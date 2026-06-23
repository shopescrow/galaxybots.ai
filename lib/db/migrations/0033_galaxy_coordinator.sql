-- GalaxyCoordinator — Dynamic Role-Assignment Engine
-- Creates coordinator_weights table and adds coordinator_trace to pipeline_runs

CREATE TABLE IF NOT EXISTS coordinator_weights (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  task_category TEXT NOT NULL,
  role TEXT NOT NULL,
  weight NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS coordinator_weights_bot_category_role_idx
  ON coordinator_weights(bot_id, task_category, role);

ALTER TABLE pipeline_runs
  ADD COLUMN IF NOT EXISTS coordinator_trace JSONB;
