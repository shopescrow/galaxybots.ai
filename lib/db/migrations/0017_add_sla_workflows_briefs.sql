-- Migration: SLA tables, Workflow tables, Briefing tables (Task #80 post-merge fix)

-- 1. SLA tiers
CREATE TABLE IF NOT EXISTS sla_tiers (
  id SERIAL PRIMARY KEY,
  tier_id TEXT NOT NULL UNIQUE,
  tier_name TEXT NOT NULL,
  response_target_ms INTEGER NOT NULL,
  completion_target_minutes INTEGER NOT NULL,
  escalation_channels JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sla_tiers (tier_id, tier_name, response_target_ms, completion_target_minutes)
VALUES
  ('standard',   'Standard',   90000,  240),
  ('priority',   'Priority',   30000,  90),
  ('enterprise', 'Enterprise', 10000,  30)
ON CONFLICT (tier_id) DO NOTHING;

-- 2. Bot SLA overrides
CREATE TABLE IF NOT EXISTS bot_sla_overrides (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  response_target_ms INTEGER,
  completion_target_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Bot SLA events
CREATE TABLE IF NOT EXISTS bot_sla_events (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  session_id INTEGER,
  event_type TEXT NOT NULL,
  directed_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  duration_ms INTEGER,
  approval_hold_ms INTEGER NOT NULL DEFAULT 0,
  net_duration_ms INTEGER,
  target_ms INTEGER NOT NULL,
  breached BOOLEAN NOT NULL DEFAULT FALSE,
  breach_notified_at TIMESTAMPTZ,
  tier TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_built_in BOOLEAN NOT NULL DEFAULT FALSE,
  last_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Workflow runs
CREATE TABLE IF NOT EXISTS workflow_runs (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Approval SLA configs
CREATE TABLE IF NOT EXISTS approval_sla_configs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  default_sla_minutes INTEGER NOT NULL DEFAULT 240,
  time_sensitive_sla_minutes INTEGER NOT NULL DEFAULT 60,
  secondary_approver_email TEXT,
  trusted_categories TEXT[] NOT NULL DEFAULT ARRAY['web_search','read_email'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Intelligence briefs
CREATE TABLE IF NOT EXISTS intelligence_briefs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brief_type TEXT NOT NULL DEFAULT 'morning',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  delivery_channels JSONB NOT NULL DEFAULT '{"email":false,"slack":false}',
  delivered_at JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS intelligence_briefs_client_generated_idx ON intelligence_briefs(client_id, generated_at);
CREATE INDEX IF NOT EXISTS intelligence_briefs_client_type_idx ON intelligence_briefs(client_id, brief_type);

-- 8. Briefing settings
CREATE TABLE IF NOT EXISTS briefing_settings (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  email_enabled INTEGER NOT NULL DEFAULT 0,
  email_recipients TEXT[],
  slack_enabled INTEGER NOT NULL DEFAULT 0,
  slack_channel TEXT DEFAULT 'galaxybots-brief',
  delivery_hour INTEGER NOT NULL DEFAULT 7,
  delivery_minute INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  last_morning_brief_at TIMESTAMPTZ,
  last_weekly_brief_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Add SLA columns to pending_approvals (if not already present)
ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_time_sensitive BOOLEAN NOT NULL DEFAULT FALSE;

-- 10. Widen the status check constraint on pending_approvals to allow 'escalated'
ALTER TABLE pending_approvals DROP CONSTRAINT IF EXISTS pending_approvals_status_check;
ALTER TABLE pending_approvals
  ADD CONSTRAINT pending_approvals_status_check
  CHECK (status = ANY(ARRAY['pending','approved','rejected','escalated']));
