-- Task #259: Reward-signal integrity & reputation segmentation.
--
-- Creates the model-routing tables (task #231) if they were never
-- captured in a migration, adds all task-#259 columns, and creates
-- the golden-prompt regression evaluation tables.
-- Every statement is idempotent (IF NOT EXISTS / IF NOT EXISTS guard).

-- ── model_selection_telemetry ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_selection_telemetry (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  bot_id                INTEGER,
  session_id            TEXT,
  conductor_strategy_id INTEGER,
  task_category         TEXT NOT NULL,
  model                 TEXT NOT NULL,
  model_tier            TEXT,
  difficulty_bucket     TEXT,
  selection_mode        TEXT NOT NULL DEFAULT 'fallback',
  shadow                BOOLEAN NOT NULL DEFAULT FALSE,
  chosen_model          TEXT,
  quality_score         REAL,
  cost_usd              REAL,
  latency_ms            INTEGER,
  task_difficulty_score REAL,
  prompt_quality_score  REAL,
  reward_score          REAL,
  sample_count          INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task-#259 columns (judge signal)
ALTER TABLE model_selection_telemetry
  ADD COLUMN IF NOT EXISTS judge_quality_score REAL,
  ADD COLUMN IF NOT EXISTS judge_model         TEXT;

CREATE INDEX IF NOT EXISTS mst_client_id_idx       ON model_selection_telemetry (client_id);
CREATE INDEX IF NOT EXISTS mst_task_category_idx   ON model_selection_telemetry (task_category);
CREATE INDEX IF NOT EXISTS mst_model_idx           ON model_selection_telemetry (model);
CREATE INDEX IF NOT EXISTS mst_created_at_idx      ON model_selection_telemetry (created_at);
CREATE INDEX IF NOT EXISTS mst_shadow_idx          ON model_selection_telemetry (shadow);

-- ── model_reputation ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_reputation (
  id               SERIAL PRIMARY KEY,
  task_category    TEXT NOT NULL,
  model            TEXT NOT NULL,
  difficulty_bucket TEXT NOT NULL DEFAULT 'all',
  avg_reward       REAL,
  avg_quality      REAL,
  avg_cost_usd     REAL,
  avg_latency_ms   REAL,
  sample_count     INTEGER NOT NULL DEFAULT 0,
  promoted         BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT model_reputation_cat_model_bucket_uniq UNIQUE (task_category, model, difficulty_bucket)
);

-- Task-#259 columns (segmentation & skew)
ALTER TABLE model_reputation
  ADD COLUMN IF NOT EXISTS avg_judge_quality   REAL,
  ADD COLUMN IF NOT EXISTS tenant_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_tenant_fraction REAL,
  ADD COLUMN IF NOT EXISTS skew_flag           BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS mr_task_category_idx ON model_reputation (task_category);
CREATE INDEX IF NOT EXISTS mr_model_idx         ON model_reputation (model);
CREATE INDEX IF NOT EXISTS mr_updated_at_idx    ON model_reputation (updated_at);

-- ── bot_model_policies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_model_policies (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  bot_id     INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  model      TEXT NOT NULL,
  allowed    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bot_model_policies_bot_model_uniq UNIQUE (bot_id, model)
);
CREATE INDEX IF NOT EXISTS bmp_client_id_idx ON bot_model_policies (client_id);
CREATE INDEX IF NOT EXISTS bmp_bot_id_idx    ON bot_model_policies (bot_id);

-- ── golden_prompts ────────────────────────────────────────────────────────────
-- client_id = NULL → global/platform prompt (seeded at startup, read-only via API)
-- client_id = N    → tenant-owned prompt (only that tenant can mutate/delete it)
CREATE TABLE IF NOT EXISTS golden_prompts (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category  TEXT NOT NULL,
  difficulty     TEXT NOT NULL DEFAULT 'medium',
  prompt         TEXT NOT NULL,
  ideal_response TEXT,
  scoring_rubric TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotent column add for dev DBs where the table was created without client_id.
ALTER TABLE golden_prompts ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS gp_task_category_idx ON golden_prompts (task_category);
CREATE INDEX IF NOT EXISTS gp_active_idx        ON golden_prompts (active);

-- ── golden_eval_runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS golden_eval_runs (
  id              SERIAL PRIMARY KEY,
  run_id          TEXT NOT NULL,
  triggered_by    TEXT NOT NULL DEFAULT 'scheduler',
  prompt_id       INTEGER REFERENCES golden_prompts(id) ON DELETE CASCADE,
  task_category   TEXT NOT NULL,
  difficulty      TEXT NOT NULL DEFAULT 'medium',
  model           TEXT NOT NULL,
  judge_score     REAL,
  judge_model     TEXT,
  latency_ms      INTEGER,
  regression_flag BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ger_run_id_idx        ON golden_eval_runs (run_id);
CREATE INDEX IF NOT EXISTS ger_model_idx         ON golden_eval_runs (model);
CREATE INDEX IF NOT EXISTS ger_task_category_idx ON golden_eval_runs (task_category);
CREATE INDEX IF NOT EXISTS ger_created_at_idx    ON golden_eval_runs (created_at);
