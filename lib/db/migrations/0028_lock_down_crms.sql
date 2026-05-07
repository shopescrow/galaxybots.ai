-- Task #117: scope CRM blueprints to a user/tenant.
-- Adds owner_user_id, backfills with an admin user (or the lowest-id user as
-- a fallback), and indexes the new column. Idempotent.

ALTER TABLE "crm_blueprints"
  ADD COLUMN IF NOT EXISTS "owner_user_id" integer
  REFERENCES "users"("id") ON DELETE CASCADE;

DO $$
DECLARE
  admin_id integer;
BEGIN
  SELECT id INTO admin_id
    FROM users
    WHERE role = 'admin'
    ORDER BY id ASC
    LIMIT 1;

  IF admin_id IS NULL THEN
    SELECT id INTO admin_id FROM users ORDER BY id ASC LIMIT 1;
  END IF;

  IF admin_id IS NOT NULL THEN
    UPDATE crm_blueprints
       SET owner_user_id = admin_id
     WHERE owner_user_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "crm_blueprints_owner_idx"
  ON "crm_blueprints" ("owner_user_id");
