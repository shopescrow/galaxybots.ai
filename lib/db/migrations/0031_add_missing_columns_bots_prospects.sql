-- Adds columns that exist in the Drizzle schema but were never
-- migrated to dev (added by task #117 CRM merge without a matching
-- migration file).  All statements are IF NOT EXISTS so the file is
-- safe to replay on envs that already have the columns (production).

-- bots.tenant_id (nullable integer FK to clients)
ALTER TABLE "bots"
  ADD COLUMN IF NOT EXISTS "tenant_id" integer;

-- prospects.retry_strategy (enum-constrained text, default 'none')
ALTER TABLE "prospects"
  ADD COLUMN IF NOT EXISTS "retry_strategy" text DEFAULT 'none';

ALTER TABLE "prospects"
  DROP CONSTRAINT IF EXISTS "prospects_retry_strategy_check";

ALTER TABLE "prospects"
  ADD CONSTRAINT "prospects_retry_strategy_check"
    CHECK ("retry_strategy" IS NULL OR "retry_strategy" IN ('exponential','fixed','none','escalate'));

-- prospects.enrichment_cost_credits (numeric NOT NULL, default 0)
ALTER TABLE "prospects"
  ADD COLUMN IF NOT EXISTS "enrichment_cost_credits" numeric NOT NULL DEFAULT 0;
