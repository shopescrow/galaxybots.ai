-- Galaxy Autonomous Agent (GAA) — top-level constitutionally-grounded agent.

CREATE TABLE IF NOT EXISTS "gaa_goals" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "mode" text DEFAULT 'autonomous' NOT NULL,
  "temporal_tier" text DEFAULT 'evergreen' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 2 NOT NULL,
  "purpose" text,
  "client_id" integer,
  "parent_goal_id" integer,
  "cost_envelope_cents" integer DEFAULT 1000 NOT NULL,
  "spent_cents" integer DEFAULT 0 NOT NULL,
  "reversibility_score" integer,
  "risk_score" integer,
  "readiness_score" integer,
  "progress_score" integer DEFAULT 0 NOT NULL,
  "blocked_reason" text,
  "dead_letter_reason" text,
  "suspended_state" jsonb,
  "generated_by" text DEFAULT 'bootstrap' NOT NULL,
  "expires_at" timestamp with time zone,
  "last_evaluated_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_journal" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal_id" integer,
  "phase" text NOT NULL,
  "event_type" text NOT NULL,
  "decision" text,
  "detail" text,
  "cost_cents" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_constitution" (
  "id" serial PRIMARY KEY NOT NULL,
  "ordinal" integer DEFAULT 100 NOT NULL,
  "principle" text NOT NULL,
  "category" text DEFAULT 'safety' NOT NULL,
  "severity" text DEFAULT 'hard' NOT NULL,
  "rationale" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_action_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal_id" integer,
  "action" text NOT NULL,
  "tool_name" text,
  "payload" jsonb DEFAULT '{}'::jsonb,
  "compensating_action" text,
  "reversibility_score" integer,
  "status" text DEFAULT 'executed' NOT NULL,
  "undo_window_expires_at" timestamp with time zone,
  "rolled_back_at" timestamp with time zone,
  "rolled_back_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_memory" (
  "id" serial PRIMARY KEY NOT NULL,
  "tier" text DEFAULT 'hot' NOT NULL,
  "scope" text DEFAULT 'platform' NOT NULL,
  "client_id" integer,
  "goal_id" integer,
  "key" text NOT NULL,
  "content" text NOT NULL,
  "lesson" text,
  "confidence" integer DEFAULT 50 NOT NULL,
  "times_reinforced" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamp with time zone,
  "last_accessed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_escalations" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal_id" integer,
  "reason" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "recommended_action" text,
  "context" jsonb DEFAULT '{}'::jsonb,
  "status" text DEFAULT 'open' NOT NULL,
  "resolution" text,
  "resolved_by" text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "gaa_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal_id" integer,
  "event_type" text NOT NULL,
  "decision" text DEFAULT 'allow' NOT NULL,
  "tool_name" text,
  "pii_involved" boolean DEFAULT false NOT NULL,
  "purpose" text,
  "compliance_passed" boolean DEFAULT true NOT NULL,
  "violations" jsonb DEFAULT '[]'::jsonb,
  "detail" text,
  "pushed_to_kilopro" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "gaa_goals" ADD CONSTRAINT "gaa_goals_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "gaa_journal" ADD CONSTRAINT "gaa_journal_goal_id_gaa_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "gaa_goals"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "gaa_action_ledger" ADD CONSTRAINT "gaa_action_ledger_goal_id_gaa_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "gaa_goals"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "gaa_memory" ADD CONSTRAINT "gaa_memory_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "gaa_escalations" ADD CONSTRAINT "gaa_escalations_goal_id_gaa_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "gaa_goals"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "gaa_audit_events" ADD CONSTRAINT "gaa_audit_events_goal_id_gaa_goals_id_fk"
    FOREIGN KEY ("goal_id") REFERENCES "gaa_goals"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "gaa_goals_status_idx" ON "gaa_goals" ("status");
CREATE INDEX IF NOT EXISTS "gaa_goals_mode_idx" ON "gaa_goals" ("mode");
CREATE INDEX IF NOT EXISTS "gaa_goals_client_id_idx" ON "gaa_goals" ("client_id");
CREATE INDEX IF NOT EXISTS "gaa_goals_priority_idx" ON "gaa_goals" ("priority");
CREATE INDEX IF NOT EXISTS "gaa_journal_goal_id_idx" ON "gaa_journal" ("goal_id");
CREATE INDEX IF NOT EXISTS "gaa_journal_phase_idx" ON "gaa_journal" ("phase");
CREATE INDEX IF NOT EXISTS "gaa_journal_created_at_idx" ON "gaa_journal" ("created_at");
CREATE INDEX IF NOT EXISTS "gaa_constitution_ordinal_idx" ON "gaa_constitution" ("ordinal");
CREATE INDEX IF NOT EXISTS "gaa_constitution_category_idx" ON "gaa_constitution" ("category");
CREATE INDEX IF NOT EXISTS "gaa_action_ledger_goal_id_idx" ON "gaa_action_ledger" ("goal_id");
CREATE INDEX IF NOT EXISTS "gaa_action_ledger_status_idx" ON "gaa_action_ledger" ("status");
CREATE INDEX IF NOT EXISTS "gaa_memory_tier_idx" ON "gaa_memory" ("tier");
CREATE INDEX IF NOT EXISTS "gaa_memory_scope_idx" ON "gaa_memory" ("scope");
CREATE INDEX IF NOT EXISTS "gaa_memory_client_id_idx" ON "gaa_memory" ("client_id");
CREATE INDEX IF NOT EXISTS "gaa_escalations_status_idx" ON "gaa_escalations" ("status");
CREATE INDEX IF NOT EXISTS "gaa_escalations_goal_id_idx" ON "gaa_escalations" ("goal_id");
CREATE INDEX IF NOT EXISTS "gaa_audit_events_goal_id_idx" ON "gaa_audit_events" ("goal_id");
CREATE INDEX IF NOT EXISTS "gaa_audit_events_event_type_idx" ON "gaa_audit_events" ("event_type");
CREATE INDEX IF NOT EXISTS "gaa_audit_events_created_at_idx" ON "gaa_audit_events" ("created_at");
