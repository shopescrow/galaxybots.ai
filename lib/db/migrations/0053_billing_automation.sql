-- Migration: Invoice billing automation engine
-- Creates invoice tables, adds dunning/Stripe/usage-alert columns,
-- and adds scheduled-downgrade support.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS) so the file
-- is safe to re-run in any environment regardless of current schema state.

-- ── New tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id                       SERIAL PRIMARY KEY,
  client_id                INTEGER NOT NULL,
  subscription_id          INTEGER,
  plan_id                  INTEGER,
  invoice_number           TEXT NOT NULL UNIQUE,
  status                   TEXT NOT NULL DEFAULT 'draft',
  period_start             TIMESTAMPTZ NOT NULL,
  period_end               TIMESTAMPTZ NOT NULL,
  plan_tier                TEXT,
  included_credits         INTEGER NOT NULL DEFAULT 0,
  used_credits             INTEGER NOT NULL DEFAULT 0,
  overage_credits          INTEGER NOT NULL DEFAULT 0,
  overage_rate_per_credit  NUMERIC(10,4) NOT NULL DEFAULT 0,
  base_subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  addon_subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  usage_subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
  overage_subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate                 NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_amount               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  pdf_reference            TEXT,
  issued_at                TIMESTAMPTZ,
  due_at                   TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columns added after the base invoices table was deployed — ADD COLUMN is
-- safe on a fresh table (columns just won't exist yet) and on existing tables.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dunning_step             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS next_dunning_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            SERIAL PRIMARY KEY,
  invoice_id    INTEGER NOT NULL,
  line_type     TEXT NOT NULL,
  description   TEXT NOT NULL,
  bot_id        INTEGER,
  bot_name      TEXT,
  model         TEXT,
  model_tier    TEXT,
  service_route TEXT,
  usage_day     TEXT,
  quantity      NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_rate     NUMERIC(12,6) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_id);

-- ── account_subscriptions — additive columns ───────────────────────────────

ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id          TEXT;
ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS last_usage_alert_threshold  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS pending_plan_tier           TEXT;
ALTER TABLE account_subscriptions ADD COLUMN IF NOT EXISTS pending_plan_change_at      TIMESTAMPTZ;
