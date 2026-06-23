-- Phase 4: Self-Improvement, Meta-Learning & Multi-Stakeholder Alignment
-- Adds the five core tables for the calibration → prompt-evolution → experiment → alignment pipeline.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stakeholder_source') THEN
    CREATE TYPE stakeholder_source AS ENUM ('owner', 'client', 'downstream');
  END IF;
END $$;

-- ── prompt_versions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
  id                   SERIAL       PRIMARY KEY,
  bot_id               INTEGER      NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  version_num          INTEGER      NOT NULL DEFAULT 1,
  prompt_text          TEXT         NOT NULL,
  diff_from_prev       TEXT,
  evidence_summary     TEXT,
  triggered_by         TEXT         NOT NULL DEFAULT 'system',
  activated_at         TIMESTAMPTZ,
  deactivated_at       TIMESTAMPTZ,
  shadow_period_end    TIMESTAMPTZ,
  outcome_score_before REAL,
  outcome_score_after  REAL,
  shadow_successes     INTEGER     NOT NULL DEFAULT 0,
  shadow_sample_n      INTEGER     NOT NULL DEFAULT 0,
  diff_magnitude_pct   REAL,
  status               TEXT         NOT NULL DEFAULT 'shadow',
  rollback_reason      TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prompt_versions_bot_id_idx      ON prompt_versions(bot_id);
CREATE INDEX IF NOT EXISTS prompt_versions_status_idx      ON prompt_versions(status);
CREATE INDEX IF NOT EXISTS prompt_versions_activated_at_idx ON prompt_versions(activated_at);

-- ── tool_heuristics ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_heuristics (
  id                       SERIAL       PRIMARY KEY,
  context_type             TEXT         NOT NULL,
  tool_name                TEXT         NOT NULL,
  success_rate             REAL         NOT NULL DEFAULT 0,
  sample_size              INTEGER      NOT NULL DEFAULT 0,
  is_counterfactual_adjusted BOOLEAN    NOT NULL DEFAULT FALSE,
  rank_in_context          INTEGER      NOT NULL DEFAULT 1,
  last_computed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tool_heuristics_context_type_idx    ON tool_heuristics(context_type);
CREATE INDEX IF NOT EXISTS tool_heuristics_tool_name_idx       ON tool_heuristics(tool_name);
CREATE INDEX IF NOT EXISTS tool_heuristics_last_computed_at_idx ON tool_heuristics(last_computed_at);

-- ── experiments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiments (
  id                    SERIAL       PRIMARY KEY,
  hypothesis            TEXT         NOT NULL,
  metric                TEXT         NOT NULL,
  variant_a             JSONB        NOT NULL DEFAULT '{}',
  variant_b             JSONB        NOT NULL DEFAULT '{}',
  assignment_rule       TEXT         NOT NULL DEFAULT 'random_20pct',
  split_pct             REAL         NOT NULL DEFAULT 0.2,
  target_sample_size    INTEGER      NOT NULL DEFAULT 100,
  current_sample_size_a INTEGER      NOT NULL DEFAULT 0,
  current_sample_size_b INTEGER      NOT NULL DEFAULT 0,
  metric_value_a        REAL,
  metric_value_b        REAL,
  t_statistic           REAL,
  p_value               REAL,
  significance_threshold REAL        NOT NULL DEFAULT 0.05,
  significance_reached  BOOLEAN      NOT NULL DEFAULT FALSE,
  winner                TEXT,
  result                TEXT,
  started_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at              TIMESTAMPTZ,
  proposed_by_bot_id    INTEGER      REFERENCES bots(id) ON DELETE SET NULL,
  status                TEXT         NOT NULL DEFAULT 'running',
  ethics_check_passed   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS experiments_status_idx               ON experiments(status);
CREATE INDEX IF NOT EXISTS experiments_started_at_idx           ON experiments(started_at);
CREATE INDEX IF NOT EXISTS experiments_significance_reached_idx ON experiments(significance_reached);

-- ── alignment_signals ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alignment_signals (
  id                   SERIAL              PRIMARY KEY,
  approval_id          INTEGER,
  original_proposal    JSONB               DEFAULT '{}',
  human_edit           JSONB               DEFAULT '{}',
  diff_summary         TEXT,
  pattern_category     TEXT,
  source_stakeholder   stakeholder_source  NOT NULL DEFAULT 'owner',
  client_nps_score     REAL,
  renewal_outcome      TEXT,
  escalation_ticket_id TEXT,
  extracted_soft_rule  TEXT,
  soft_rule_confidence REAL,
  soft_rule_status     TEXT                DEFAULT 'pending',
  cluster_id           TEXT,
  created_at           TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alignment_signals_source_stakeholder_idx ON alignment_signals(source_stakeholder);
CREATE INDEX IF NOT EXISTS alignment_signals_pattern_category_idx   ON alignment_signals(pattern_category);
CREATE INDEX IF NOT EXISTS alignment_signals_cluster_id_idx         ON alignment_signals(cluster_id);
CREATE INDEX IF NOT EXISTS alignment_signals_soft_rule_status_idx   ON alignment_signals(soft_rule_status);
CREATE INDEX IF NOT EXISTS alignment_signals_created_at_idx         ON alignment_signals(created_at);

-- ── experiment_assignments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id              SERIAL      PRIMARY KEY,
  experiment_id   INTEGER     NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  session_id      INTEGER,
  conversation_id INTEGER,
  cohort          TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS experiment_assignments_experiment_id_idx ON experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS experiment_assignments_session_id_idx    ON experiment_assignments(session_id);
CREATE INDEX IF NOT EXISTS experiment_assignments_cohort_idx        ON experiment_assignments(cohort);

-- ── calibration_checkpoints ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calibration_checkpoints (
  id                      SERIAL      PRIMARY KEY,
  bot_id                  INTEGER     NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  period_end              TIMESTAMPTZ NOT NULL,
  predicted_avg           REAL        NOT NULL,
  actual_avg              REAL        NOT NULL,
  calibration_error       REAL        NOT NULL,
  temperature_scale_factor REAL       NOT NULL DEFAULT 1.0,
  sample_size             INTEGER     NOT NULL DEFAULT 0,
  reliability_curve       JSONB       DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calibration_checkpoints_bot_id_idx    ON calibration_checkpoints(bot_id);
CREATE INDEX IF NOT EXISTS calibration_checkpoints_period_end_idx ON calibration_checkpoints(period_end);

-- ── Idempotency constraints (idempotent via DO block, PG-safe) ───────────────
-- Prevent duplicate experiment assignments for the same session
DO $$ BEGIN
  ALTER TABLE experiment_assignments
    ADD CONSTRAINT experiment_assignments_exp_session_unique
    UNIQUE (experiment_id, session_id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prevent duplicate alignment_signals for the same approval_id (owner stream dedup)
DO $$ BEGIN
  ALTER TABLE alignment_signals
    ADD CONSTRAINT alignment_signals_approval_id_unique
    UNIQUE (approval_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Concurrent control arm tracking for shadow A/B (idempotent via DO block) ─
DO $$ BEGIN
  ALTER TABLE prompt_versions ADD COLUMN control_successes INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE prompt_versions ADD COLUMN control_sample_n INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
