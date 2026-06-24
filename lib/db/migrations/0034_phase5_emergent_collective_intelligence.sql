-- Phase 5: Emergent Collective Intelligence & Consequence-Grounded Alignment
-- Adds all new tables for causal aggregation, consequence risk scoring, role
-- specialization A/B experiments, novel role discovery, Oracle reporting,
-- platform anomaly quarantine, and causal outcome attribution.

-- ── causal_outcomes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS causal_outcomes (
  id                          SERIAL      PRIMARY KEY,
  action_id                   INTEGER,
  tool_name                   TEXT        NOT NULL,
  metric_name                 TEXT        NOT NULL,
  metric_delta                REAL,
  counterfactual_baseline     REAL,
  counterfactual_match_quality REAL,
  attribution_confidence      REAL,
  measurement_lag_days        INTEGER     NOT NULL DEFAULT 7,
  client_id                   INTEGER     REFERENCES clients(id) ON DELETE CASCADE,
  bot_id                      INTEGER     REFERENCES bots(id) ON DELETE SET NULL,
  treated_cohort_size         INTEGER,
  control_cohort_size         INTEGER,
  treatment_effect            REAL,
  observed_outcome            REAL,
  causal_pattern_summary      TEXT,
  measured_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS causal_outcomes_client_id_idx              ON causal_outcomes(client_id);
CREATE INDEX IF NOT EXISTS causal_outcomes_tool_name_idx              ON causal_outcomes(tool_name);
CREATE INDEX IF NOT EXISTS causal_outcomes_measured_at_idx            ON causal_outcomes(measured_at);
CREATE INDEX IF NOT EXISTS causal_outcomes_attribution_confidence_idx ON causal_outcomes(attribution_confidence);

-- ── synthetic_controls ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS synthetic_controls (
  id                  SERIAL      PRIMARY KEY,
  client_id           INTEGER     NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action_hash         TEXT        NOT NULL,
  control_client_ids  JSONB       NOT NULL DEFAULT '[]',
  baseline_metrics    JSONB       NOT NULL DEFAULT '{}',
  industry_vertical   TEXT,
  size_category       TEXT,
  match_score         REAL,
  window_start        TIMESTAMPTZ,
  window_end          TIMESTAMPTZ,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS synthetic_controls_client_id_idx   ON synthetic_controls(client_id);
CREATE INDEX IF NOT EXISTS synthetic_controls_action_hash_idx ON synthetic_controls(action_hash);

-- ── platform_causal_patterns ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_causal_patterns (
  id                       SERIAL      PRIMARY KEY,
  industry_vertical        TEXT        NOT NULL,
  company_size_tier        TEXT        NOT NULL,
  context_type             TEXT        NOT NULL,
  action_type              TEXT        NOT NULL,
  outcome_type             TEXT        NOT NULL,
  effect_size              REAL        NOT NULL DEFAULT 0,
  evidence_count           INTEGER     NOT NULL DEFAULT 0,
  confidence               REAL        NOT NULL DEFAULT 0,
  client_count             INTEGER     NOT NULL DEFAULT 0,
  pooled_mean              REAL,
  pooled_std_dev           REAL,
  confidence_interval_low  REAL,
  confidence_interval_high REAL,
  quarantined              INTEGER     NOT NULL DEFAULT 0,
  last_aggregated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_causal_patterns_vertical_idx        ON platform_causal_patterns(industry_vertical);
CREATE INDEX IF NOT EXISTS platform_causal_patterns_action_type_idx     ON platform_causal_patterns(action_type);
CREATE INDEX IF NOT EXISTS platform_causal_patterns_context_type_idx    ON platform_causal_patterns(context_type);
CREATE INDEX IF NOT EXISTS platform_causal_patterns_last_aggregated_idx ON platform_causal_patterns(last_aggregated_at);

-- ── consequence_risk_scores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consequence_risk_scores (
  id                      SERIAL      PRIMARY KEY,
  action_hash             TEXT        NOT NULL,
  industry_vertical       TEXT        NOT NULL,
  company_size_tier       TEXT        NOT NULL DEFAULT 'unknown',
  tool_name               TEXT        NOT NULL,
  context_type            TEXT        NOT NULL,
  risk_score              REAL        NOT NULL DEFAULT 0,
  confidence_score        REAL        NOT NULL DEFAULT 0,
  evidence_count          INTEGER     NOT NULL DEFAULT 0,
  negative_outcome_count  INTEGER     NOT NULL DEFAULT 0,
  positive_outcome_count  INTEGER     NOT NULL DEFAULT 0,
  top_evidence_examples   JSONB       DEFAULT '[]',
  model_version           TEXT        NOT NULL DEFAULT '1.0',
  last_computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consequence_risk_scores_action_hash_idx      ON consequence_risk_scores(action_hash);
CREATE INDEX IF NOT EXISTS consequence_risk_scores_industry_vertical_idx ON consequence_risk_scores(industry_vertical);
CREATE INDEX IF NOT EXISTS consequence_risk_scores_risk_score_idx        ON consequence_risk_scores(risk_score);
CREATE INDEX IF NOT EXISTS consequence_risk_scores_tool_name_idx         ON consequence_risk_scores(tool_name);
CREATE INDEX IF NOT EXISTS consequence_risk_scores_last_computed_idx     ON consequence_risk_scores(last_computed_at);

-- Unique constraint for upsert semantics: one score per action+industry+sizeTier
DO $$ BEGIN
  ALTER TABLE consequence_risk_scores
    ADD CONSTRAINT consequence_risk_scores_action_industry_size_unique
    UNIQUE (action_hash, industry_vertical, company_size_tier);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add company_size_tier to existing deployments where the table was created without it
DO $$ BEGIN
  ALTER TABLE consequence_risk_scores ADD COLUMN company_size_tier TEXT NOT NULL DEFAULT 'unknown';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── bot_variant_assignments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_variant_assignments (
  id                      SERIAL      PRIMARY KEY,
  bot_role                TEXT        NOT NULL,
  variant_a_config_id     INTEGER,
  variant_b_config_id     INTEGER,
  assignment_weight_a     REAL        NOT NULL DEFAULT 0.8,
  assignment_weight_b     REAL        NOT NULL DEFAULT 0.2,
  performance_delta       REAL,
  weeks_of_significance   INTEGER     NOT NULL DEFAULT 0,
  last_t_test_p_value     REAL,
  last_t_test_statistic   REAL,
  sample_size_a           INTEGER     NOT NULL DEFAULT 0,
  sample_size_b           INTEGER     NOT NULL DEFAULT 0,
  mean_outcome_a          REAL,
  mean_outcome_b          REAL,
  champion_declared_at    TIMESTAMPTZ,
  champion_variant        TEXT,
  status                  TEXT        NOT NULL DEFAULT 'active',
  retired_config_id       INTEGER,
  retired_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_variant_assignments_bot_role_idx             ON bot_variant_assignments(bot_role);
CREATE INDEX IF NOT EXISTS bot_variant_assignments_status_idx               ON bot_variant_assignments(status);
CREATE INDEX IF NOT EXISTS bot_variant_assignments_champion_declared_at_idx ON bot_variant_assignments(champion_declared_at);

-- ── role_gap_signals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_gap_signals (
  id                   SERIAL      PRIMARY KEY,
  gap_description      TEXT        NOT NULL,
  evidence_sessions    INTEGER     NOT NULL DEFAULT 0,
  avg_success_rate     REAL        NOT NULL DEFAULT 0,
  cluster_id           TEXT,
  cluster_keywords     TEXT[]      DEFAULT '{}',
  proposed_role_name   TEXT,
  proposed_persona     JSONB,
  evidence_objectives  TEXT[]      DEFAULT '{}',
  status               TEXT        NOT NULL DEFAULT 'pending',
  reviewed_at          TIMESTAMPTZ,
  reviewer_note        TEXT,
  dismissed_at         TIMESTAMPTZ,
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS role_gap_signals_status_idx          ON role_gap_signals(status);
CREATE INDEX IF NOT EXISTS role_gap_signals_cluster_id_idx      ON role_gap_signals(cluster_id);
CREATE INDEX IF NOT EXISTS role_gap_signals_created_at_idx      ON role_gap_signals(created_at);
CREATE INDEX IF NOT EXISTS role_gap_signals_avg_success_rate_idx ON role_gap_signals(avg_success_rate);

-- ── oracle_reports ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oracle_reports (
  id                  SERIAL      PRIMARY KEY,
  report_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_json         JSONB       NOT NULL DEFAULT '{"findings":[],"recommendations":[],"anomalies":[],"topPerformingBotConfigs":[],"underperformingRoles":[],"experimentOutcomes":[],"alignmentRuleEffectiveness":0,"consequenceModelAccuracy":null}',
  report_html         TEXT,
  intelligence_score  REAL,
  dimension_scores    JSONB,
  model_version       TEXT        NOT NULL DEFAULT '1.0',
  delivered_email     TIMESTAMPTZ,
  delivered_platform  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oracle_reports_report_date_idx       ON oracle_reports(report_date);
CREATE INDEX IF NOT EXISTS oracle_reports_intelligence_score_idx ON oracle_reports(intelligence_score);

-- ── platform_anomalies ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_anomalies (
  id                      SERIAL      PRIMARY KEY,
  pattern_id              INTEGER,
  anomaly_type            TEXT        NOT NULL,
  description             TEXT        NOT NULL,
  clients_affected        INTEGER     NOT NULL DEFAULT 0,
  detected_effect_size    REAL,
  expected_effect_size    REAL,
  deviation_std_devs      REAL,
  quarantine_status       TEXT        NOT NULL DEFAULT 'quarantined',
  reviewed_at             TIMESTAMPTZ,
  reviewed_by             TEXT,
  review_note             TEXT,
  resolved_at             TIMESTAMPTZ,
  notified_oracle_at      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_anomalies_pattern_id_idx        ON platform_anomalies(pattern_id);
CREATE INDEX IF NOT EXISTS platform_anomalies_quarantine_status_idx  ON platform_anomalies(quarantine_status);
CREATE INDEX IF NOT EXISTS platform_anomalies_anomaly_type_idx       ON platform_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS platform_anomalies_created_at_idx         ON platform_anomalies(created_at);
