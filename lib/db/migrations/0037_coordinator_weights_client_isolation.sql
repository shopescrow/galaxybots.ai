-- Migration 0037: Add client_id to coordinator_weights and fix multi-tenant isolation.
-- The original table was created without client_id (schema drift), and the unique index
-- (bot_id, task_category, role) allowed cross-client weight overwrites.

BEGIN;

-- Step 1: Add client_id column (nullable, FK to clients)
ALTER TABLE coordinator_weights
  ADD COLUMN IF NOT EXISTS client_id integer REFERENCES clients(id) ON DELETE CASCADE;

-- Step 2: Drop old non-client-scoped unique index
DROP INDEX IF EXISTS coordinator_weights_bot_category_role_idx;

-- Step 3: Client-scoped unique index for rows with a real client
CREATE UNIQUE INDEX coordinator_weights_client_bot_category_role_idx
  ON coordinator_weights(client_id, bot_id, task_category, role);

COMMIT;
