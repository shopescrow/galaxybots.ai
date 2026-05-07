CREATE TABLE IF NOT EXISTS "bot_tool_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "tool_name" text NOT NULL,
  "allowed" boolean NOT NULL DEFAULT true,
  "requires_approval" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bot_tool_perm_unique" UNIQUE ("client_id", "bot_id", "tool_name")
);

CREATE TABLE IF NOT EXISTS "pending_approvals" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "bot_name" text,
  "tool_name" text NOT NULL,
  "tool_input" jsonb,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
  "resolved_by" integer,
  "resolved_at" timestamp with time zone,
  "rejection_reason" text,
  "tool_result" jsonb,
  "paused_loop_context" jsonb,
  "session_id" integer,
  "conversation_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "brand_voice_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "tone_description" text,
  "prohibited_phrases" text[] NOT NULL DEFAULT '{}',
  "required_disclaimers" text[] NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "brand_voice_client_unique" UNIQUE ("client_id")
);

CREATE TABLE IF NOT EXISTS "permission_profile_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
