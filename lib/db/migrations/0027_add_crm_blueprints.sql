-- Task #112: Liberator "Rebuild as CRM" — adds the CRM blueprint + record store.
-- Idempotent: safe to run on environments where these tables already exist.

CREATE TABLE IF NOT EXISTS "crm_blueprints" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "description" text,
  "source_job_id" integer REFERENCES "extraction_jobs"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "definition" jsonb NOT NULL DEFAULT '{"entities":[]}'::jsonb,
  "record_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crm_records" (
  "id" serial PRIMARY KEY,
  "crm_id" integer NOT NULL REFERENCES "crm_blueprints"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_crm_records_crm_entity"
  ON "crm_records"("crm_id", "entity_type");
CREATE INDEX IF NOT EXISTS "idx_crm_blueprints_source_job"
  ON "crm_blueprints"("source_job_id");
