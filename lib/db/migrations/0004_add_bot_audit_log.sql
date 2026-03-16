CREATE TABLE IF NOT EXISTS "bot_audit_log" (
  "id" serial PRIMARY KEY,
  "action" text NOT NULL,
  "reasoning" text NOT NULL,
  "confidence" real NOT NULL,
  "requires_review" boolean NOT NULL DEFAULT false,
  "client_id" integer,
  "bot_id" integer,
  "metadata" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
