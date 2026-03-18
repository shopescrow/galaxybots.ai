CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  platform_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  welcome_message TEXT NOT NULL,
  offer TEXT,
  admin_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partner seed data intentionally omitted from this migration.
-- Admin passwords must never be committed to source control, even as hashes.
-- Insert partner records with hashed passwords via a secure admin process
-- or a deployment script that reads credentials from environment variables.
