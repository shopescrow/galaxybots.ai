-- Adds clients.timezone column missing from production.
-- Schema (lib/db/src/schema/clients.ts) declares this NOT NULL DEFAULT 'UTC',
-- but no prior migration created it. The scheduler queries this column on
-- every tick (weekly pulse, activation nurture, competitor alert, weekly
-- briefing), so its absence triggers repeated query failures and eventually
-- a crash loop in production.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'UTC';
