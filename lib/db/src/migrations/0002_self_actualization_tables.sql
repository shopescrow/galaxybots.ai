-- Migration: Self-actualization substrate tables
-- Idempotent — safe to run multiple times.
--
-- Creates 7 tables for the agent self-learning & enhancement loops:
--   1. bot_capability_model       — per-bot per-category competence self-model
--   2. bot_reflections            — root-cause diagnoses on significant failures
--   3. practice_runs              — self-directed deliberate practice sandbox
--   4. knowledge_transfers        — cross-agent lesson distillation
--   5. self_modifications         — safe self-change proposals with governance
--   6. self_actualization_metrics — telemetry snapshots for the metrics surface
--   7. self_actualization_control — kill switch + budgets (single row per key)
--
-- After creating tables, seeds a baseline bot_capability_model row
-- (competence=0.5, confidence=0, strength_tier='unproven') for every bot
-- that does not already have one, so the capability model can immediately
-- start updating from live outcomes without crashing on missing rows.

-- 1. Capability self-model
CREATE TABLE IF NOT EXISTS bot_capability_model (
  id              SERIAL PRIMARY KEY,
  bot_id          INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category   TEXT NOT NULL,
  competence      REAL NOT NULL DEFAULT 0.5,
  confidence      REAL NOT NULL DEFAULT 0,
  trend           REAL NOT NULL DEFAULT 0,
  sample_count    INTEGER NOT NULL DEFAULT 0,
  short_ewma      REAL NOT NULL DEFAULT 0.5,
  long_ewma       REAL NOT NULL DEFAULT 0.5,
  volatility      REAL NOT NULL DEFAULT 0,
  last_quality    REAL,
  strength_tier   TEXT NOT NULL DEFAULT 'unproven',
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS bot_capability_model_bot_client_category_idx
  ON bot_capability_model(bot_id, client_id, task_category)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_capability_model_bot_null_client_category_idx
  ON bot_capability_model(bot_id, task_category)
  WHERE client_id IS NULL;

CREATE INDEX IF NOT EXISTS bot_capability_model_bot_id_idx       ON bot_capability_model(bot_id);
CREATE INDEX IF NOT EXISTS bot_capability_model_strength_tier_idx ON bot_capability_model(strength_tier);

-- 2. Deep reflections
CREATE TABLE IF NOT EXISTS bot_reflections (
  id                  SERIAL PRIMARY KEY,
  bot_id              INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  session_id          INTEGER,
  goal_id             INTEGER,
  task_category       TEXT,
  failure_category    TEXT,
  root_cause_type     TEXT NOT NULL DEFAULT 'other',
  root_cause          TEXT NOT NULL,
  contributing_factors JSONB DEFAULT '[]',
  durable_lesson      TEXT NOT NULL,
  prevention_rule     TEXT,
  confidence          REAL NOT NULL DEFAULT 0.6,
  memory_id           INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_reflections_bot_id_idx         ON bot_reflections(bot_id);
CREATE INDEX IF NOT EXISTS bot_reflections_root_cause_type_idx ON bot_reflections(root_cause_type);
CREATE INDEX IF NOT EXISTS bot_reflections_created_at_idx      ON bot_reflections(created_at);

-- 3. Practice runs
CREATE TABLE IF NOT EXISTS practice_runs (
  id              SERIAL PRIMARY KEY,
  bot_id          INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id       INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category   TEXT NOT NULL,
  practice_task   TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'generated',
  baseline_score  REAL NOT NULL DEFAULT 0,
  practice_score  REAL NOT NULL DEFAULT 0,
  improvement     REAL NOT NULL DEFAULT 0,
  cost_cents      INTEGER NOT NULL DEFAULT 0,
  passed_fidelity BOOLEAN NOT NULL DEFAULT FALSE,
  adopted         BOOLEAN NOT NULL DEFAULT FALSE,
  distilled_lesson TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS practice_runs_bot_id_idx        ON practice_runs(bot_id);
CREATE INDEX IF NOT EXISTS practice_runs_task_category_idx ON practice_runs(task_category);
CREATE INDEX IF NOT EXISTS practice_runs_created_at_idx    ON practice_runs(created_at);

-- 4. Knowledge transfers
CREATE TABLE IF NOT EXISTS knowledge_transfers (
  id                  SERIAL PRIMARY KEY,
  source_bot_id       INTEGER REFERENCES bots(id) ON DELETE SET NULL,
  target_bot_id       INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category       TEXT,
  memory_id           INTEGER,
  lesson_text         TEXT NOT NULL,
  distilled_belief    TEXT NOT NULL,
  transfer_type       TEXT NOT NULL DEFAULT 'belief',
  confidence          REAL NOT NULL DEFAULT 0.6,
  status              TEXT NOT NULL DEFAULT 'proposed',
  conflict_resolution TEXT,
  target_belief_id    INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_transfers_target_bot_id_idx ON knowledge_transfers(target_bot_id);
CREATE INDEX IF NOT EXISTS knowledge_transfers_status_idx        ON knowledge_transfers(status);
CREATE INDEX IF NOT EXISTS knowledge_transfers_created_at_idx    ON knowledge_transfers(created_at);

-- 5. Self-modifications
CREATE TABLE IF NOT EXISTS self_modifications (
  id                  SERIAL PRIMARY KEY,
  bot_id              INTEGER REFERENCES bots(id) ON DELETE CASCADE,
  client_id           INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  mod_type            TEXT NOT NULL,
  title               TEXT NOT NULL,
  proposal            JSONB NOT NULL DEFAULT '{}',
  rationale           TEXT NOT NULL,
  evidence            JSONB DEFAULT '{}',
  risk_level          TEXT NOT NULL DEFAULT 'low',
  human_gated         BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'proposed',
  governance_decision TEXT,
  shadow_metrics      JSONB DEFAULT '{"shadowSuccesses":0,"shadowSampleN":0,"controlSuccesses":0,"controlSampleN":0}',
  shadow_period_end   TIMESTAMPTZ,
  proposed_by         TEXT NOT NULL DEFAULT 'self_actualization',
  reviewed_by         TEXT,
  promoted_at         TIMESTAMPTZ,
  rolled_back_at      TIMESTAMPTZ,
  rollback_reason     TEXT,
  audit_trail         JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS self_modifications_status_idx   ON self_modifications(status);
CREATE INDEX IF NOT EXISTS self_modifications_bot_id_idx   ON self_modifications(bot_id);
CREATE INDEX IF NOT EXISTS self_modifications_mod_type_idx ON self_modifications(mod_type);

-- 6. Telemetry snapshots
CREATE TABLE IF NOT EXISTS self_actualization_metrics (
  id                  SERIAL PRIMARY KEY,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  scope               TEXT NOT NULL DEFAULT 'platform',
  client_id           INTEGER,
  avg_competence      REAL NOT NULL DEFAULT 0,
  avg_confidence      REAL NOT NULL DEFAULT 0,
  avg_trend           REAL NOT NULL DEFAULT 0,
  reflections         INTEGER NOT NULL DEFAULT 0,
  practice_runs       INTEGER NOT NULL DEFAULT 0,
  practice_adopted    INTEGER NOT NULL DEFAULT 0,
  practice_gain_avg   REAL NOT NULL DEFAULT 0,
  transfers           INTEGER NOT NULL DEFAULT 0,
  transfers_applied   INTEGER NOT NULL DEFAULT 0,
  mods_proposed       INTEGER NOT NULL DEFAULT 0,
  mods_promoted       INTEGER NOT NULL DEFAULT 0,
  mods_rolled_back    INTEGER NOT NULL DEFAULT 0,
  blocked_promotions  INTEGER NOT NULL DEFAULT 0,
  kill_switch_active  BOOLEAN NOT NULL DEFAULT FALSE,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS self_actualization_metrics_created_at_idx ON self_actualization_metrics(created_at);
CREATE INDEX IF NOT EXISTS self_actualization_metrics_scope_idx      ON self_actualization_metrics(scope);

-- 7. Control / kill switch
CREATE TABLE IF NOT EXISTS self_actualization_control (
  id          SERIAL PRIMARY KEY,
  key         TEXT NOT NULL,
  bool_value  BOOLEAN,
  num_value   REAL,
  text_value  TEXT,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS self_actualization_control_key_idx ON self_actualization_control(key);

-- Seed: one baseline capability row per bot (platform-scoped, client_id NULL)
-- Uses bot.category as task_category. Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO bot_capability_model (
  bot_id, client_id, task_category,
  competence, confidence, trend, sample_count,
  short_ewma, long_ewma, volatility, last_quality,
  strength_tier, last_updated, created_at
)
SELECT
  id                                                          AS bot_id,
  NULL::integer                                               AS client_id,
  LOWER(REPLACE(COALESCE(category, 'general'), ' & ', '_'))   AS task_category,
  0.5  AS competence,
  0.0  AS confidence,
  0.0  AS trend,
  0    AS sample_count,
  0.5  AS short_ewma,
  0.5  AS long_ewma,
  0.0  AS volatility,
  NULL AS last_quality,
  'unproven' AS strength_tier,
  NOW() AS last_updated,
  NOW() AS created_at
FROM bots
ON CONFLICT DO NOTHING;
