-- Guardian Queen — Immortal Hive Intelligence System
-- Creates guardian_state, guardian_incidents, guardian_workers, guardian_postmortems, guardian_patrols

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "guardian_state" (
  "id" serial PRIMARY KEY,
  "singleton_key" smallint NOT NULL DEFAULT 1,
  "mode" text NOT NULL DEFAULT 'active',
  "last_swarm_cycle_at" timestamp with time zone,
  "paused_by_user_id" integer,
  "paused_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "guardian_state_singleton_key_unique" UNIQUE ("singleton_key")
);

CREATE UNIQUE INDEX IF NOT EXISTS "guardian_state_singleton_key_idx" ON "guardian_state" ("singleton_key");

CREATE TABLE IF NOT EXISTS "guardian_incidents" (
  "id" serial PRIMARY KEY,
  "domain" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "severity" integer NOT NULL DEFAULT 0,
  "blast_radius" integer NOT NULL DEFAULT 0,
  "recurrence_rate" real NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'open',
  "affected_component" text,
  "error_fingerprint" text,
  "source_payload" jsonb,
  "kilopro_audit_tag" text,
  "embedding" vector(1536),
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "guardian_workers" (
  "id" serial PRIMARY KEY,
  "incident_id" integer NOT NULL REFERENCES "guardian_incidents"("id") ON DELETE CASCADE,
  "bee_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'dispatched',
  "finding" text,
  "proposed_fix" text,
  "root_cause" text,
  "confidence_score" real,
  "raw_response" jsonb,
  "dispatched_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "guardian_postmortems" (
  "id" serial PRIMARY KEY,
  "incident_id" integer NOT NULL REFERENCES "guardian_incidents"("id") ON DELETE CASCADE,
  "trigger_event" text NOT NULL,
  "detection_time" text,
  "blast_radius_summary" text,
  "timeline" text NOT NULL,
  "root_cause" text NOT NULL,
  "applied_remedy" text NOT NULL,
  "prevention_recommendation" text NOT NULL,
  "kilopro_compatible" text NOT NULL DEFAULT 'yes',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "guardian_patrols" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "domain" text NOT NULL,
  "trigger_pattern" text NOT NULL,
  "scheduler_job_name" text,
  "recurrence_count" integer NOT NULL DEFAULT 0,
  "is_active" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_triggered_at" timestamp with time zone
);

-- Add guardian_queen rank value (no constraint change needed, rank is free-text)
-- Ensure bots.rank column exists (idempotent)
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "declaration" text;
