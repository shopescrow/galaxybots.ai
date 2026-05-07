CREATE TABLE IF NOT EXISTS "sso_state" (
  "id" serial PRIMARY KEY,
  "state_key" text NOT NULL UNIQUE,
  "state_data" jsonb NOT NULL,
  "state_type" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "sso_state_expires_at_idx" ON "sso_state" ("expires_at");
CREATE INDEX IF NOT EXISTS "sso_state_state_type_idx" ON "sso_state" ("state_type");
