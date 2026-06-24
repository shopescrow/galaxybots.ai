CREATE TABLE IF NOT EXISTS "belief_domain_map" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_category" text NOT NULL,
  "belief_domains" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "belief_domain_map_task_category_idx" ON "belief_domain_map" ("task_category");

CREATE TABLE IF NOT EXISTS "persona_divergence_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "client_a_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "client_b_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "cosine_similarity" real NOT NULL,
  "most_divergent_category" text,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "persona_divergence_log_bot_id_idx" ON "persona_divergence_log" ("bot_id");
CREATE INDEX IF NOT EXISTS "persona_divergence_log_computed_at_idx" ON "persona_divergence_log" ("computed_at");

CREATE TABLE IF NOT EXISTS "persona_divergence_alert" (
  "id" serial PRIMARY KEY NOT NULL,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "bot_name" text NOT NULL,
  "client_a_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "client_b_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "cosine_similarity" real NOT NULL,
  "most_divergent_category" text,
  "severity" text NOT NULL DEFAULT 'low',
  "summary" text NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "persona_divergence_alert_bot_id_idx" ON "persona_divergence_alert" ("bot_id");
CREATE INDEX IF NOT EXISTS "persona_divergence_alert_resolved_idx" ON "persona_divergence_alert" ("resolved_at");

INSERT INTO "belief_domain_map" ("task_category", "belief_domains") VALUES
  ('financial', '["market_conditions", "client_facts", "operational"]'),
  ('legal', '["operational", "client_facts", "relationship_dynamics"]'),
  ('research', '["market_conditions", "competitor_intel", "product_knowledge"]'),
  ('analysis', '["market_conditions", "competitor_intel", "operational"]'),
  ('execution', '["operational", "product_knowledge"]'),
  ('review', '["operational", "client_facts", "product_knowledge"]')
ON CONFLICT DO NOTHING;
