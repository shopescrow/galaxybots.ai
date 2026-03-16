CREATE TABLE IF NOT EXISTS sso_configs (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  provider_type TEXT NOT NULL,
  idp_metadata_url TEXT,
  idp_entity_id TEXT,
  idp_sso_url TEXT,
  idp_cert TEXT,
  oidc_client_id TEXT,
  oidc_client_secret TEXT,
  oidc_issuer_url TEXT,
  domain_hint TEXT NOT NULL,
  jit_default_role TEXT NOT NULL DEFAULT 'viewer',
  force_sso BOOLEAN NOT NULL DEFAULT false,
  scim_token TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sso_configs_domain_unique ON sso_configs(domain_hint);
CREATE INDEX IF NOT EXISTS sso_configs_client_idx ON sso_configs(client_id);

ALTER TABLE sso_configs ADD COLUMN IF NOT EXISTS scim_group_role_mapping JSONB;

ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
