-- Reconcile the bingolingo_clients FK name so it matches the Drizzle-generated
-- name (bingolingo_clients_galaxybots_client_id_fk).  PostgreSQL auto-names
-- constraints created via raw REFERENCES syntax as <table>_<col>_fkey, but
-- Drizzle expects <table>_<col>_fk.  The mismatch causes drizzle-kit push to
-- emit an interactive/destructive prompt that hangs in non-TTY environments.
-- The DO block is idempotent: it only renames if the old name still exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'bingolingo_clients'
      AND constraint_name = 'bingolingo_clients_galaxybots_client_id_fkey'
  ) THEN
    ALTER TABLE bingolingo_clients
      RENAME CONSTRAINT bingolingo_clients_galaxybots_client_id_fkey
      TO bingolingo_clients_galaxybots_client_id_fk;
  END IF;
END $$;
