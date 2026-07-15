-- Migration: ComedyClash Partner Tables
-- Creates partner_credentials, partner_webhook_subscriptions,
-- partner_inbound_secrets, and partner_inbound_events tables
-- for the ComedyClash ↔ GalaxyBots bilateral integration.

CREATE TABLE IF NOT EXISTS partner_credentials (
  id SERIAL PRIMARY KEY,
  partner TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  api_base_url TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_credentials_partner_client_id_idx
  ON partner_credentials (partner, client_id);

CREATE INDEX IF NOT EXISTS partner_credentials_partner_idx
  ON partner_credentials (partner);

CREATE TABLE IF NOT EXISTS partner_webhook_subscriptions (
  id SERIAL PRIMARY KEY,
  partner TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  events JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_webhook_subscriptions_partner_idx
  ON partner_webhook_subscriptions (partner);

CREATE INDEX IF NOT EXISTS partner_webhook_subscriptions_status_idx
  ON partner_webhook_subscriptions (status);

CREATE TABLE IF NOT EXISTS partner_inbound_secrets (
  id SERIAL PRIMARY KEY,
  partner TEXT NOT NULL UNIQUE,
  encrypted_secret TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS partner_inbound_events (
  id SERIAL PRIMARY KEY,
  partner TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_inbound_events_partner_idx
  ON partner_inbound_events (partner);

CREATE INDEX IF NOT EXISTS partner_inbound_events_client_id_idx
  ON partner_inbound_events (client_id);

CREATE INDEX IF NOT EXISTS partner_inbound_events_created_at_idx
  ON partner_inbound_events (created_at);

-- Partner webhook deliveries table (queued outbound events to CC)
CREATE TABLE IF NOT EXISTS partner_webhook_deliveries (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES partner_webhook_subscriptions(id) ON DELETE CASCADE,
  partner TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_status_idx
  ON partner_webhook_deliveries (status);

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_subscription_id_idx
  ON partner_webhook_deliveries (subscription_id);

CREATE INDEX IF NOT EXISTS partner_webhook_deliveries_partner_idx
  ON partner_webhook_deliveries (partner);
