-- Migration: C-Suite Permanent Memory Vault
-- Creates the self-actualization tables that were missing from the live DB
-- and adds bot_id to gaa_memory to support permanent-tier promotion for C-Suite bots.
-- All statements are fully idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. bot_capability_model — per-bot per-category capability self-model
CREATE TABLE IF NOT EXISTS bot_capability_model (
  id serial PRIMARY KEY,
  bot_id integer NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  task_category text NOT NULL,
  competence real NOT NULL DEFAULT 0.5,
  confidence real NOT NULL DEFAULT 0,
  trend real NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  short_ewma real NOT NULL DEFAULT 0.5,
  long_ewma real NOT NULL DEFAULT 0.5,
  volatility real NOT NULL DEFAULT 0,
  last_quality real,
  strength_tier text NOT NULL DEFAULT 'unproven',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bot_capability_model_bot_client_category_idx
  ON bot_capability_model(bot_id, client_id, task_category);
CREATE INDEX IF NOT EXISTS bot_capability_model_bot_id_idx
  ON bot_capability_model(bot_id);
CREATE INDEX IF NOT EXISTS bot_capability_model_strength_tier_idx
  ON bot_capability_model(strength_tier);

-- 2. self_modifications — safe self-change proposals with governance + shadow testing
CREATE TABLE IF NOT EXISTS self_modifications (
  id serial PRIMARY KEY,
  bot_id integer REFERENCES bots(id) ON DELETE CASCADE,
  client_id integer REFERENCES clients(id) ON DELETE CASCADE,
  mod_type text NOT NULL,
  title text NOT NULL,
  proposal jsonb NOT NULL DEFAULT '{}',
  rationale text NOT NULL,
  evidence jsonb DEFAULT '{}',
  risk_level text NOT NULL DEFAULT 'low',
  human_gated boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'proposed',
  governance_decision text,
  shadow_metrics jsonb DEFAULT '{"shadowSuccesses":0,"shadowSampleN":0,"controlSuccesses":0,"controlSampleN":0}',
  shadow_period_end timestamptz,
  proposed_by text NOT NULL DEFAULT 'self_actualization',
  reviewed_by text,
  promoted_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text,
  audit_trail jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS self_modifications_status_idx ON self_modifications(status);
CREATE INDEX IF NOT EXISTS self_modifications_bot_id_idx ON self_modifications(bot_id);
CREATE INDEX IF NOT EXISTS self_modifications_mod_type_idx ON self_modifications(mod_type);

-- 3. gaa_memory — add bot_id column to support permanent-tier promotion for C-Suite bots
ALTER TABLE gaa_memory ADD COLUMN IF NOT EXISTS bot_id integer REFERENCES bots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gaa_memory_bot_id_idx ON gaa_memory(bot_id);

-- 4. Backfill bot_id for existing gaa_memory rows that encode the bot id in the key
--    using the standard convention ":bot<id>" (e.g. "reflection:bot42:root_cause").
--    Rows that do not match the pattern or whose parsed id has no corresponding bot are
--    left as NULL and will be resolved at runtime by the key-parsing fallback in
--    consolidateMemory().
UPDATE gaa_memory
SET bot_id = (regexp_match(key, ':bot(\d+)(?:[^0-9]|$)'))[1]::integer
WHERE bot_id IS NULL
  AND key ~ ':bot[0-9]+'
  AND (regexp_match(key, ':bot(\d+)(?:[^0-9]|$)'))[1]::integer IN (SELECT id FROM bots);
