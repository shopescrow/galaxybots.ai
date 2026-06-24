-- Phase 3: Add goal algebra columns to bot_assignments
  -- Also creates Phase 3 tables if they don't exist yet

  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS parent_goal_id INTEGER;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS horizon TEXT NOT NULL DEFAULT 'weekly';
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS sub_tasks JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS progress_score INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS blocking_on JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS resource_requirements JSONB DEFAULT '{"timeBudgetMinutes":60,"costBudgetCents":500,"clientAttentionUnits":1}'::jsonb;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS priority_tier INTEGER NOT NULL DEFAULT 2;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS generated_by TEXT NOT NULL DEFAULT 'human';
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS impact_score INTEGER;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS feasibility_score INTEGER;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS evidence_chain JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE bot_assignments ADD COLUMN IF NOT EXISTS auto_approve_threshold INTEGER;

  CREATE TABLE IF NOT EXISTS causal_outcomes (
    id SERIAL PRIMARY KEY,
    action_id INTEGER,
    tool_name TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_delta REAL,
    counterfactual_baseline REAL,
    counterfactual_match_quality REAL,
    attribution_confidence REAL,
    measurement_lag_days INTEGER NOT NULL DEFAULT 7,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
    treated_cohort_size INTEGER,
    control_cohort_size INTEGER,
    treatment_effect REAL,
    observed_outcome REAL,
    causal_pattern_summary TEXT,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS causal_outcomes_client_id_idx ON causal_outcomes(client_id);
  CREATE INDEX IF NOT EXISTS causal_outcomes_tool_name_idx ON causal_outcomes(tool_name);
  CREATE INDEX IF NOT EXISTS causal_outcomes_measured_at_idx ON causal_outcomes(measured_at);
  CREATE INDEX IF NOT EXISTS causal_outcomes_attribution_confidence_idx ON causal_outcomes(attribution_confidence);

  CREATE TABLE IF NOT EXISTS synthetic_controls (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action_hash TEXT NOT NULL,
    control_client_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    baseline_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    industry_vertical TEXT,
    size_category TEXT,
    match_score REAL,
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS synthetic_controls_client_id_idx ON synthetic_controls(client_id);
  CREATE INDEX IF NOT EXISTS synthetic_controls_action_hash_idx ON synthetic_controls(action_hash);

  CREATE TABLE IF NOT EXISTS goal_conflicts (
    id SERIAL PRIMARY KEY,
    goal_a_id INTEGER NOT NULL,
    goal_b_id INTEGER NOT NULL,
    conflict_type TEXT NOT NULL,
    resolution TEXT,
    resolution_reason TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT NOT NULL DEFAULT 'system',
    escalated_to_human INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS goal_conflicts_goal_a_id_idx ON goal_conflicts(goal_a_id);
  CREATE INDEX IF NOT EXISTS goal_conflicts_goal_b_id_idx ON goal_conflicts(goal_b_id);

  CREATE TABLE IF NOT EXISTS uncertainty_schedules (
    id SERIAL PRIMARY KEY,
    belief_id INTEGER,
    goal_id INTEGER NOT NULL,
    bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    belief_text TEXT NOT NULL,
    current_confidence REAL NOT NULL,
    required_confidence REAL NOT NULL DEFAULT 0.7,
    scheduled_gather_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    gathered_at TIMESTAMPTZ,
    confidence_after_gather REAL,
    lead_time_days INTEGER NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS uncertainty_schedules_goal_id_idx ON uncertainty_schedules(goal_id);
  CREATE INDEX IF NOT EXISTS uncertainty_schedules_bot_id_idx ON uncertainty_schedules(bot_id);
  CREATE INDEX IF NOT EXISTS uncertainty_schedules_status_idx ON uncertainty_schedules(status);

  CREATE TABLE IF NOT EXISTS opportunity_signals (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
    signal_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    predicted_outcome_distribution JSONB DEFAULT '{"best":0,"median":0,"worst":0,"confidence":0}'::jsonb,
    probability_of_success REAL,
    evidence_chain JSONB DEFAULT '[]'::jsonb,
    causal_pattern_ids JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    approved_by_user_id INTEGER,
    resulting_assignment_id INTEGER,
    expires_at TIMESTAMPTZ,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS opportunity_signals_client_id_idx ON opportunity_signals(client_id);
  CREATE INDEX IF NOT EXISTS opportunity_signals_status_idx ON opportunity_signals(status);
  CREATE INDEX IF NOT EXISTS opportunity_signals_signal_type_idx ON opportunity_signals(signal_type);

  CREATE TABLE IF NOT EXISTS bot_handoff_requests (
    id SERIAL PRIMARY KEY,
    source_bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
    target_bot_id INTEGER REFERENCES bots(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    session_id INTEGER,
    assignment_id INTEGER,
    reason TEXT NOT NULL,
    termination_reason TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    recommended_recipient_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    confirmed_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resulting_assignment_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS bot_handoff_requests_source_bot_id_idx ON bot_handoff_requests(source_bot_id);
  CREATE INDEX IF NOT EXISTS bot_handoff_requests_client_id_idx ON bot_handoff_requests(client_id);
  CREATE INDEX IF NOT EXISTS bot_handoff_requests_status_idx ON bot_handoff_requests(status);

  -- Phase 3 v2 additions
  ALTER TABLE goal_conflicts ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;
  CREATE INDEX IF NOT EXISTS goal_conflicts_client_id_idx ON goal_conflicts(client_id);

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'goal_conflicts_goal_a_id_fkey'
    ) THEN
      ALTER TABLE goal_conflicts
        ADD CONSTRAINT goal_conflicts_goal_a_id_fkey
        FOREIGN KEY (goal_a_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'goal_conflicts_goal_b_id_fkey'
    ) THEN
      ALTER TABLE goal_conflicts
        ADD CONSTRAINT goal_conflicts_goal_b_id_fkey
        FOREIGN KEY (goal_b_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'uncertainty_schedules_goal_id_fkey'
    ) THEN
      ALTER TABLE uncertainty_schedules
        ADD CONSTRAINT uncertainty_schedules_goal_id_fkey
        FOREIGN KEY (goal_id) REFERENCES bot_assignments(id) ON DELETE CASCADE;
    END IF;
  END $$;

  ALTER TABLE bot_loop_config ADD COLUMN IF NOT EXISTS auto_approve_goal_impact_threshold INTEGER NOT NULL DEFAULT 40;
  