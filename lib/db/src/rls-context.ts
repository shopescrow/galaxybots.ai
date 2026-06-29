import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema/index.js";
import { tenantContextStore } from "./tenant-context.js";
import { pool } from "./pool.js";

// Local drizzle instance backed by the shared (intercepted) pool.
// Using the same pool object means the pool interceptor in pool.ts applies
// to all queries made through this db as well — no separate connection setup needed.
const _db = drizzle(pool, { schema });

// Re-export the type so callers can type their fn parameters.
export type TenantDb = typeof _db;

/**
 * Runs `fn` with database-enforced tenant isolation.
 *
 * The entire async call-stack of `fn` executes inside an AsyncLocalStorage
 * context keyed to `clientId`. Every `pool.connect()` call within that stack
 * — including calls from the global `db` in services called by `fn` — will
 * read the ALS value and automatically apply:
 *
 *   SET ROLE app_tenant
 *   SET app.current_client_id = '<clientId>'
 *
 * The rls_tenant_policy (TO app_tenant) enforces a strict client_id check with
 * no bypass branch. Even a query that omits a WHERE clause returns only the
 * authenticated tenant's rows.
 *
 * Prerequisite: run the RLS migration before first use:
 *   pnpm --filter @workspace/db run rls-migrate
 */
export async function withTenantContext<T>(
  _pool: Pool,
  clientId: number,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return tenantContextStore.run(
    { type: "tenant", clientId },
    () => fn(_db),
  );
}

/**
 * Runs `fn` with full cross-tenant DB visibility.
 *
 * The call-stack of `fn` executes inside an ALS bypass context. Every
 * `pool.connect()` within that stack will apply `SET app.bypass_rls = 'on'`,
 * satisfying the rls_owner_bypass policy.
 *
 * Use only for legitimately cross-tenant operations: background jobs, billing
 * reconciliation, platform admin actions. Always include explicit WHERE clauses
 * even in bypass mode — defense in depth.
 */
export async function withBypassRLS<T>(
  _pool: Pool,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  return tenantContextStore.run(
    { type: "bypass" },
    () => fn(_db),
  );
}

/**
 * Creates bound versions of withTenantContext / withBypassRLS that do not
 * require passing `pool` on every call.
 */
export function createRlsHelpers(_pool: Pool) {
  return {
    withTenantContext: <T>(clientId: number, fn: (db: TenantDb) => Promise<T>) =>
      withTenantContext(_pool, clientId, fn),
    withBypassRLS: <T>(fn: (db: TenantDb) => Promise<T>) =>
      withBypassRLS(_pool, fn),
  };
}
