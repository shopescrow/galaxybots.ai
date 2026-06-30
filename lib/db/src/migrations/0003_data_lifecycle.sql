-- Migration: Data lifecycle & growth management
-- Idempotent — safe to run multiple times.
--
-- This migration establishes bounded growth for the four high-volume
-- append-only tables: llm_usage_log, model_selection_telemetry,
-- bot_audit_log, and platform_audit_log, plus the bot_memories
-- vector table.  Strategy used is "composite-index partitioning" —
-- adding (client_id, time) composite indexes so planner can do
-- index-only scans for bounded time/tenant reads without requiring a
-- pg_partman rebuild of existing live tables.  Pre-aggregated daily
-- rollup tables let dashboard routes stop scanning raw events.
-- A data_lifecycle_config table stores per-table retention windows.

-- ── 1. Composite indexes for bounded tenant+time reads ──────────────────

-- llm_usage_log: client × time (primary dashboard query)
CREATE INDEX IF NOT EXISTS llm_usage_log_client_time_idx
  ON llm_usage_log (client_id, called_at DESC);

-- llm_usage_log: bot × time (per-bot spend breakdown)
CREATE INDEX IF NOT EXISTS llm_usage_log_bot_time_idx
  ON llm_usage_log (bot_id, called_at DESC);

-- model_selection_telemetry: client × time
CREATE INDEX IF NOT EXISTS model_selection_telemetry_client_time_idx
  ON model_selection_telemetry (client_id, created_at DESC);

-- bot_audit_log: client × time
CREATE INDEX IF NOT EXISTS bot_audit_log_client_time_idx
  ON bot_audit_log (client_id, created_at DESC);

-- platform_audit_log: client × time
CREATE INDEX IF NOT EXISTS platform_audit_log_client_time_idx
  ON platform_audit_log (client_id, created_at DESC);

-- bot_memories: per-tenant HNSW retrieval — client × bot compound index
-- lets queries add WHERE client_id = $1 AND bot_id = $2 before the ANN
-- step, drastically reducing the vector scan size per tenant.
CREATE INDEX IF NOT EXISTS bot_memories_client_bot_time_idx
  ON bot_memories (client_id, bot_id, created_at DESC);

-- ── 2. Retention configuration table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_lifecycle_config (
  id               SERIAL PRIMARY KEY,
  table_name       TEXT NOT NULL UNIQUE,
  retain_days      INTEGER NOT NULL DEFAULT 90,
  archive_enabled  BOOLEAN NOT NULL DEFAULT false,
  last_pruned_at   TIMESTAMPTZ,
  rows_pruned      BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default retention windows (upsert-safe).
INSERT INTO data_lifecycle_config (table_name, retain_days)
VALUES
  ('llm_usage_log',              90),
  ('model_selection_telemetry',  90),
  ('bot_audit_log',             180),
  ('platform_audit_log',        365),
  ('bot_memories',              730)
ON CONFLICT (table_name) DO NOTHING;

-- ── 3. LLM usage daily rollup ────────────────────────────────────────────
--
-- One row per (client_id, bot_id, model, model_tier, day).
-- Rollup workers upsert rows for the previous day; dashboard queries
-- read from this table for date ranges that are at least 1 day old.

CREATE TABLE IF NOT EXISTS llm_usage_daily_rollup (
  id                      SERIAL PRIMARY KEY,
  rollup_date             DATE NOT NULL,
  client_id               INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  bot_id                  INTEGER,
  model                   TEXT NOT NULL,
  model_tier              TEXT,
  call_count              INTEGER NOT NULL DEFAULT 0,
  prompt_tokens           BIGINT NOT NULL DEFAULT 0,
  completion_tokens       BIGINT NOT NULL DEFAULT 0,
  total_cost_usd          NUMERIC(18, 8) NOT NULL DEFAULT 0,
  avg_latency_ms          REAL NOT NULL DEFAULT 0,
  p95_latency_ms          REAL,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rollup_date, client_id, bot_id, model)
);

CREATE INDEX IF NOT EXISTS llm_usage_daily_rollup_client_date_idx
  ON llm_usage_daily_rollup (client_id, rollup_date DESC);

CREATE INDEX IF NOT EXISTS llm_usage_daily_rollup_date_idx
  ON llm_usage_daily_rollup (rollup_date DESC);

-- ── 4. Model selection telemetry daily rollup ────────────────────────────

CREATE TABLE IF NOT EXISTS model_telemetry_daily_rollup (
  id                      SERIAL PRIMARY KEY,
  rollup_date             DATE NOT NULL,
  client_id               INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  task_category           TEXT NOT NULL,
  model                   TEXT NOT NULL,
  model_tier              TEXT,
  selection_mode          TEXT,
  shadow                  BOOLEAN NOT NULL DEFAULT false,
  sample_count            INTEGER NOT NULL DEFAULT 0,
  avg_reward_score        REAL,
  avg_quality_score       REAL,
  avg_cost_usd            REAL,
  avg_latency_ms          REAL,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rollup_date, client_id, task_category, model, shadow)
);

CREATE INDEX IF NOT EXISTS model_telemetry_daily_rollup_client_date_idx
  ON model_telemetry_daily_rollup (client_id, rollup_date DESC);

-- ── 5. Audit-log daily rollup (admin overview) ──────────────────────────

CREATE TABLE IF NOT EXISTS audit_log_daily_rollup (
  id           SERIAL PRIMARY KEY,
  rollup_date  DATE NOT NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  event_count  INTEGER NOT NULL DEFAULT 0,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rollup_date, client_id, action)
);

CREATE INDEX IF NOT EXISTS audit_log_daily_rollup_client_date_idx
  ON audit_log_daily_rollup (client_id, rollup_date DESC);
