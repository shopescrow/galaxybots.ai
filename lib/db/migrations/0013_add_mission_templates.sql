-- Migration: add mission_templates table and client_id for org-level scoping
CREATE TABLE IF NOT EXISTS mission_templates (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  estimated_duration text,
  recommended_bots jsonb NOT NULL DEFAULT '[]',
  objective_template text NOT NULL,
  success_criteria text,
  is_built_in boolean NOT NULL DEFAULT false,
  created_by text,
  client_id integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add client_id to existing mission_templates tables in case the table already exists without the column
ALTER TABLE mission_templates ADD COLUMN IF NOT EXISTS client_id integer;
