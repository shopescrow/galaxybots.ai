-- Migration 0050: per-tenant monthly token quota and degradation policy
--
-- Creates client_token_quotas table that controls how much each tenant can
-- consume via LLM calls per calendar month and what happens when they approach
-- or exceed their cap:
--   degradation_policy = 'downgrade' : switch to cheaper model tier (default)
--   degradation_policy = 'shed'      : same as downgrade — shed expensive models
--   degradation_policy = 'reject'    : hard-block with 429 when quota exhausted
--
-- monthly_token_cap = 0 means unlimited (no enforcement).
-- soft_limit_pct is the % of cap at which we start downgrading (default 80).

CREATE TABLE IF NOT EXISTS client_token_quotas (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  monthly_token_cap INTEGER NOT NULL DEFAULT 0,
  soft_limit_pct    INTEGER NOT NULL DEFAULT 80,
  degradation_policy TEXT    NOT NULL DEFAULT 'downgrade'
                      CHECK (degradation_policy IN ('downgrade', 'shed', 'reject')),
  alert_at_80_pct   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_token_quotas_client_id
  ON client_token_quotas (client_id);
