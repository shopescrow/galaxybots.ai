-- AGI Phase 1: Agentic Loop Engine schema additions

-- Per-bot loop configuration (hot-reloadable by AgenticLoopEngine)
CREATE TABLE IF NOT EXISTS bot_loop_config (
  id serial PRIMARY KEY,
  bot_id integer NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  max_iterations integer NOT NULL DEFAULT 10,
  time_budget_ms integer NOT NULL DEFAULT 120000,
  cost_budget_cents integer NOT NULL DEFAULT 500,
  quality_threshold numeric NOT NULL DEFAULT 0.7,
  enable_self_evaluation boolean NOT NULL DEFAULT true,
  enable_browser_agent boolean NOT NULL DEFAULT false,
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  fallback_model text,
  network_allow_list text[] DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Structured failure log for every loop execution that ends in a failure
CREATE TABLE IF NOT EXISTS bot_failure_log (
  id serial PRIMARY KEY,
  bot_id integer REFERENCES bots(id) ON DELETE SET NULL,
  client_id integer REFERENCES clients(id) ON DELETE SET NULL,
  session_id integer,
  conversation_id integer,
  failure_category text NOT NULL,
  failure_detail text NOT NULL,
  user_input text,
  last_thought text,
  iterations_completed integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  tools_attempted text[] DEFAULT '{}',
  trace_snapshot jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-iteration confidence predictions for calibration tracking (Phase 4 readiness)
CREATE TABLE IF NOT EXISTS confidence_predictions (
  id serial PRIMARY KEY,
  session_id integer,
  conversation_id integer,
  bot_id integer REFERENCES bots(id) ON DELETE SET NULL,
  client_id integer REFERENCES clients(id) ON DELETE SET NULL,
  iteration integer NOT NULL DEFAULT 0,
  predicted_confidence numeric NOT NULL,
  completeness_score numeric,
  accuracy_score numeric,
  relevance_score numeric,
  termination_reason text,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Extend session_outcomes with loop trace fields
ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS loop_iterations integer;
ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS cost_cents integer;
ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS termination_reason text;
ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS failure_category text;
ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS loop_trace jsonb;

-- Extend pipeline_steps with quality gate fields
ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS step_type text NOT NULL DEFAULT 'generative';
ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS quality_threshold numeric;
ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS max_gate_retries integer NOT NULL DEFAULT 2;
