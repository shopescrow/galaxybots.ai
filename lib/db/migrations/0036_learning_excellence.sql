-- Migration: 0036_learning_excellence.sql
  -- Galaxy Learning Excellence: UCB1, model versioning, confound control, rollback, Bayesian LR, global priors, A/B framework

  -- 1. coordinator_weights: add sample_count and model_version
  ALTER TABLE coordinator_weights ADD COLUMN IF NOT EXISTS sample_count integer NOT NULL DEFAULT 0;
  ALTER TABLE coordinator_weights ADD COLUMN IF NOT EXISTS model_version text;

  -- 2. coordinator_weight_archive: new table for model-version rebasing
  CREATE TABLE IF NOT EXISTS coordinator_weight_archive (
    id serial PRIMARY KEY,
    client_id integer REFERENCES clients(id) ON DELETE CASCADE,
    bot_id integer NOT NULL,
    task_category text NOT NULL,
    role text NOT NULL,
    weight numeric(10,6) NOT NULL,
    sample_count integer NOT NULL DEFAULT 0,
    model_version text,
    reason text NOT NULL DEFAULT 'model_version_change',
    archived_at timestamptz NOT NULL DEFAULT now()
  );

  -- 3. coordinator_global_priors: cross-client priors for cold start
  CREATE TABLE IF NOT EXISTS coordinator_global_priors (
    id serial PRIMARY KEY,
    task_category text NOT NULL,
    role text NOT NULL,
    prior_weight numeric(10,6) NOT NULL DEFAULT 1.0,
    total_run_count integer NOT NULL DEFAULT 0,
    model_version text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- 4. weight_snapshots: pre-cycle snapshots for rollback
  CREATE TABLE IF NOT EXISTS weight_snapshots (
    id serial PRIMARY KEY,
    client_id integer REFERENCES clients(id) ON DELETE CASCADE,
    snapshot_type text NOT NULL DEFAULT 'pre_cycle',
    data jsonb NOT NULL DEFAULT '{}',
    avg_quality_at_time real,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- 5. intelligence_cycle_runs: add cycle_status and quality tracking columns
  ALTER TABLE intelligence_cycle_runs ADD COLUMN IF NOT EXISTS cycle_status text NOT NULL DEFAULT 'completed';
  ALTER TABLE intelligence_cycle_runs ADD COLUMN IF NOT EXISTS pre_avg_quality real;
  ALTER TABLE intelligence_cycle_runs ADD COLUMN IF NOT EXISTS post_avg_quality real;
  ALTER TABLE intelligence_cycle_runs ADD COLUMN IF NOT EXISTS snapshot_id integer;

  -- 6. conductor_strategies: add sample_count, model_version, and confound scores
  ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS sample_count integer NOT NULL DEFAULT 0;
  ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS model_version text;
  ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS task_difficulty_score real;
  ALTER TABLE conductor_strategies ADD COLUMN IF NOT EXISTS prompt_quality_score real;

  -- 7. session_outcomes: add confound scores and token count
  ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS task_difficulty_score real;
  ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS prompt_quality_score real;
  ALTER TABLE session_outcomes ADD COLUMN IF NOT EXISTS input_token_count integer;

  -- 8. ab_experiments: A/B testing framework
  CREATE TABLE IF NOT EXISTS ab_experiments (
    id serial PRIMARY KEY,
    client_id integer REFERENCES clients(id) ON DELETE CASCADE,
    split_pct real NOT NULL DEFAULT 50,
    control_snapshot_id integer,
    treatment_description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'running',
    winner_variant text,
    p_value real,
    started_at timestamptz NOT NULL DEFAULT now(),
    concluded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- 9. ab_experiment_results: per-session variant tracking
  CREATE TABLE IF NOT EXISTS ab_experiment_results (
    id serial PRIMARY KEY,
    experiment_id integer NOT NULL,
    session_id text NOT NULL,
    variant text NOT NULL,
    quality_score real,
    recorded_at timestamptz NOT NULL DEFAULT now()
  );
  