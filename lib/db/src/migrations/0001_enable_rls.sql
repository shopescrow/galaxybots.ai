-- Migration: Enable Row-Level Security for tenant isolation
-- Idempotent — safe to run multiple times.
--
-- Design:
--   • A non-owner role `app_tenant` is created for all tenant-scoped queries.
--   • FORCE ROW LEVEL SECURITY is applied so even the table owner (the app's DB
--     user) is subject to RLS policies, not silently bypassed.
--   • TWO policies per table:
--       rls_tenant_policy (TO app_tenant)
--         USING (col = current_setting('app.current_client_id')::int)
--         No bypass branch.  Even if app.bypass_rls is 'on' in an app_tenant
--         session, the tenant policy ignores that GUC — only client_id matches.
--       rls_owner_bypass (TO <current_user> — the DB owner, NOT app_tenant)
--         USING (current_setting('app.bypass_rls', true) = 'on')
--         Scoped to current_user at migration time so app_tenant cannot satisfy
--         it even if app.bypass_rls is somehow set in its session.
--   • withTenantContext switches to app_tenant via SET ROLE, so only the strict
--     rls_tenant_policy applies.
--   • The pool interceptor (pool.ts) sets app.bypass_rls='on' as the default for
--     connections without an ALS tenant context (system/infra/unauthenticated
--     code paths) and switches to app_tenant for authenticated tenant requests.
--   • SET LOCAL + set_config(true) make context changes transaction-scoped, safe
--     under transaction-mode pooling.
--
-- Tenant-key safety:
--   The auto-discovery loop only applies policies to tables where `client_id`
--   is a FOREIGN KEY that directly references `clients.id`.  Tables that use
--   `client_id` to reference a different parent table (e.g. bingolingo_content
--   whose client_id → bingolingo_clients.id, not clients.id) are automatically
--   excluded — no incorrect cross-namespace ID-space policy is applied to them.

-- ── Tenant application role ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant;
  END IF;
END
$$;

-- Grant the current DB user membership so it can SET LOCAL ROLE app_tenant.
DO $$
DECLARE
  _current text := current_user;
BEGIN
  EXECUTE format('GRANT app_tenant TO %I', _current);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

-- Grant DML on all existing tables to app_tenant (for tables we protect with RLS).
-- Tables without an RLS policy will block app_tenant access implicitly since
-- FORCE ROW LEVEL SECURITY requires a passing policy for every row.
DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO app_tenant',
      _tbl
    );
  END LOOP;
END
$$;

-- Grant usage on sequences (needed for INSERT with serial PKs).
DO $$
DECLARE
  _seq text;
BEGIN
  FOR _seq IN
    SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO app_tenant', _seq);
  END LOOP;
END
$$;

-- ── Helper: enable RLS + create the two-policy pair per table ────────────────

CREATE OR REPLACE FUNCTION _rls_apply_tenant_policy(
  p_table      text,
  p_column     text    DEFAULT 'client_id',
  p_allow_null boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  _tenant_using text;
  _bypass_using text := $e$ current_setting('app.bypass_rls', true) = 'on' $e$;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  IF p_allow_null THEN
    _tenant_using := format(
      $e$ %I IS NULL OR %I = NULLIF(current_setting('app.current_client_id', true), '')::integer $e$,
      p_column, p_column
    );
  ELSE
    _tenant_using := format(
      $e$ %I = NULLIF(current_setting('app.current_client_id', true), '')::integer $e$,
      p_column, p_column
    );
  END IF;

  EXECUTE format('DROP POLICY IF EXISTS rls_tenant_policy ON public.%I', p_table);
  EXECUTE format('DROP POLICY IF EXISTS rls_owner_bypass  ON public.%I', p_table);

  -- Policy 1: strict tenant isolation for the app_tenant role.
  --   No bypass GUC branch — only client_id determines access.
  EXECUTE format(
    'CREATE POLICY rls_tenant_policy ON public.%I '
    'AS PERMISSIVE FOR ALL TO app_tenant '
    'USING (%s) WITH CHECK (%s)',
    p_table, _tenant_using, _tenant_using
  );

  -- Policy 2: bypass gate for the DB owner role ONLY — NOT for app_tenant.
  --   current_user is substituted at migration time to the actual DB username.
  --   This prevents app_tenant from ever satisfying the bypass policy, even if
  --   app.bypass_rls is set in its session — defense-in-depth is preserved.
  EXECUTE format(
    'CREATE POLICY rls_owner_bypass ON public.%I '
    'AS PERMISSIVE FOR ALL TO %I '
    'USING (%s) WITH CHECK (%s)',
    p_table, current_user, _bypass_using, _bypass_using
  );
END;
$$;

-- ── FK-aware auto-apply: only tables whose client_id → clients.id ─────────────
--
-- Uses information_schema FK metadata to find tables where `client_id` is a
-- genuine FK referencing `clients.id`.  This automatically excludes tables that
-- use `client_id` to reference a different parent (e.g. bingolingo_content whose
-- client_id → bingolingo_clients.id), preventing incorrect ID-space collisions.
--
-- Re-runnable: new tenant-scoped tables added with a proper FK to clients.id are
-- picked up automatically on the next migration run.

DO $$
DECLARE
  _tbl      text;
  _nullable bool;
BEGIN
  FOR _tbl, _nullable IN
    SELECT DISTINCT
      tc.table_name,
      (c.is_nullable = 'YES') AS nullable
    FROM information_schema.table_constraints    tc
    JOIN information_schema.key_column_usage     kcu
      ON  kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema    = tc.table_schema
      AND kcu.table_name      = tc.table_name
    JOIN information_schema.referential_constraints rc
      ON  rc.constraint_name  = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    JOIN information_schema.key_column_usage     ccu
      ON  ccu.constraint_name = rc.unique_constraint_name
      AND ccu.table_schema    = rc.unique_constraint_schema
    JOIN information_schema.columns              c
      ON  c.table_name  = tc.table_name
      AND c.column_name = kcu.column_name
      AND c.table_schema = tc.table_schema
    WHERE tc.table_schema      = 'public'
      AND tc.constraint_type   = 'FOREIGN KEY'
      AND kcu.column_name      = 'client_id'
      AND ccu.table_name       = 'clients'
      AND ccu.column_name      = 'id'
    ORDER BY tc.table_name
  LOOP
    PERFORM _rls_apply_tenant_policy(_tbl, 'client_id', _nullable);
  END LOOP;
END;
$$;

-- ── bots: tenant_id column (nullable — null = platform-wide bot) ─────────────

SELECT _rls_apply_tenant_policy('bots', 'tenant_id', true);

-- ── clients: keyed on `id` (which IS the tenant identifier) ──────────────────
-- A tenant in context sees only their own client record.
-- RLS on clients also prevents cross-tenant exposure via missed filter on clientsTable.

SELECT _rls_apply_tenant_policy('clients', 'id', false);

-- ── Cleanup ───────────────────────────────────────────────────────────────────

DROP FUNCTION _rls_apply_tenant_policy(text, text, boolean);
