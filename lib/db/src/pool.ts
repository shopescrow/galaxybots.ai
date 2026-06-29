import pg from "pg";
import { tenantContextStore } from "./tenant-context.js";

const { Pool } = pg;

if (!process.env["DATABASE_URL"]) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Per-instance pool ceiling.
 *
 * When running behind a transaction-mode connection pooler (PgBouncer), this
 * controls how many *pooler* connections each API instance holds open.
 * PgBouncer then multiplexes those onto a much smaller set of real Postgres
 * backends.  Keep this at 10–20 so that `instances × DB_POOL_MAX` never
 * exceeds the pooler's `max_client_conn` limit.
 *
 * Without a pooler (e.g. local dev / CI) the value directly limits how many
 * Postgres backend connections this process opens.  Default is 10, which is
 * safe even for a single-instance deployment where Postgres max_connections
 * is 100.
 */
const POOL_MAX = Number(process.env["DB_POOL_MAX"] ?? "10");

/**
 * How long (ms) to wait for an available connection before throwing.
 * A clear error is far more useful than a silent hang.  5 s is enough for
 * transient bursts; if you see this error regularly, raise DB_POOL_MAX or
 * scale the pooler.
 */
const POOL_ACQUIRE_TIMEOUT_MS = Number(
  process.env["DB_POOL_ACQUIRE_TIMEOUT_MS"] ?? "5000",
);

/**
 * How long (ms) an idle connection is kept open before being closed.
 * 30 s strikes a balance: short enough to shed connections during lulls,
 * long enough to avoid churn on steady workloads.
 */
const POOL_IDLE_TIMEOUT_MS = Number(
  process.env["DB_POOL_IDLE_TIMEOUT_MS"] ?? "30000",
);

const _pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: POOL_MAX,
  connectionTimeoutMillis: POOL_ACQUIRE_TIMEOUT_MS,
  idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
  allowExitOnIdle: true,
});

_pool.on("error", (err) => {
  console.error("[db-pool] Unexpected idle-client error:", err.message);
});

_pool.on("connect", (_client) => {
  const { totalCount, idleCount, waitingCount } = _pool;
  if (waitingCount > 0) {
    console.warn(
      `[db-pool] Connection acquired — pool stats: total=${totalCount} idle=${idleCount} waiting=${waitingCount}`,
    );
  }
});

/**
 * Pool interceptor: automatic per-request RLS enforcement via AsyncLocalStorage.
 *
 * On every `pool.connect()` we read `tenantContextStore` — set by the Express
 * middleware via `tenantContextStore.run(ctx, next)` — and apply TRANSACTION-
 * SCOPED session variables before handing the connection to the caller:
 *
 *   type === 'tenant'
 *     BEGIN (if not already in a transaction)
 *     SET LOCAL ROLE app_tenant
 *     set_config('app.current_client_id', '<id>', true)   ← true = tx-scoped
 *     The rls_tenant_policy (TO app_tenant) enforces a strict client_id check
 *     with no bypass branch. Even a query that omits WHERE is bounded to the
 *     authenticated tenant's rows.
 *
 *   type === 'bypass'
 *     BEGIN (if not already in a transaction)
 *     SET LOCAL app.bypass_rls = 'on'                     ← tx-scoped
 *     Satisfies rls_owner_bypass. Reserved for platform-admin requests and
 *     background jobs; set explicitly via withBypassRLS().
 *
 *   null / undefined  (NO ALS context)
 *     Nothing applied. FORCE ROW LEVEL SECURITY causes tenant-table queries
 *     to return 0 rows — a hard backstop against missed middleware.
 *     Pre-auth code paths (auth.ts, API-key middleware, webhooks) MUST wrap
 *     any DB call they need in withBypassRLS() explicitly.
 *
 * Transaction-scope safety
 * ────────────────────────
 * We call `pg_current_xact_id_if_assigned()` to detect whether the connection
 * is already inside a transaction (e.g. drizzle's db.transaction()).  If so,
 * we skip BEGIN — SET LOCAL still works because a transaction is already open
 * and the context GUCs reset automatically on COMMIT/ROLLBACK.  If no open
 * transaction exists we issue BEGIN ourselves and COMMIT (or ROLLBACK) in the
 * overridden release().  This satisfies transaction-mode connection-pooling
 * requirements: no session-level state bleeds across requests.
 *
 * Cleanup
 * ───────
 * release() is overridden to COMMIT (or ROLLBACK on error) only when this
 * interceptor opened the transaction, followed by RESET ALL to clear any
 * remaining session state before the connection returns to the pool.
 */
const _originalConnect = _pool.connect.bind(_pool);

(_pool as unknown as { connect(): Promise<pg.PoolClient> }).connect =
  async function connectWithRlsContext(): Promise<pg.PoolClient> {
    const client = await _originalConnect();

    const _origRelease = (
      client.release as unknown as (err?: boolean | Error) => void
    ).bind(client);

    const ctx = tenantContextStore.getStore();

    try {
      if (ctx?.type === "tenant" || ctx?.type === "bypass") {
        // Detect whether we're already inside an open transaction so we know
        // whether to issue BEGIN.  This avoids a nested-BEGIN warning when
        // drizzle's db.transaction() has already opened one.
        const { rows } = await client.query<{ in_tx: boolean }>(
          "SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS in_tx",
        );
        const alreadyInTx = rows[0]?.in_tx ?? false;

        if (!alreadyInTx) {
          await client.query("BEGIN");
          (client as unknown as Record<string, unknown>)["__rlsTxOwned"] = true;
        }

        if (ctx.type === "tenant") {
          // SET LOCAL — resets on COMMIT/ROLLBACK (transaction-scoped)
          await client.query("SET LOCAL ROLE app_tenant");
          await client.query(
            "SELECT set_config('app.current_client_id', $1, true)",
            [String(ctx.clientId)],
          );
        } else {
          // bypass context — also transaction-scoped
          await client.query("SET LOCAL app.bypass_rls = 'on'");
        }
      }
      // No ALS context → no variables set → FORCE RLS returns 0 rows for all
      // tenant-scoped tables.  Pre-auth system code must use withBypassRLS().
    } catch (err) {
      // Cannot apply context — destroy the connection rather than return it
      // to the pool in an unknown state.
      _origRelease(true);
      throw err;
    }

    (client as unknown as {
      release(err?: boolean | Error): Promise<void>;
    }).release = async function releaseWithCleanup(
      err?: boolean | Error,
    ): Promise<void> {
      try {
        if ((client as unknown as Record<string, unknown>)["__rlsTxOwned"]) {
          // Only COMMIT/ROLLBACK if we still own an open transaction.
          // If drizzle's db.transaction() committed/rolled back already, the
          // transaction is gone and we must not attempt a second COMMIT.
          const { rows } = await client.query<{ in_tx: boolean }>(
            "SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS in_tx",
          );
          if (rows[0]?.in_tx) {
            if (err) {
              await client.query("ROLLBACK");
            } else {
              await client.query("COMMIT");
            }
          }
          delete (client as unknown as Record<string, unknown>)["__rlsTxOwned"];
        }
        // RESET ALL clears any remaining session-level state (role, GUCs, etc.)
        // so the connection is fully clean when it returns to the pool.
        await client.query("RESET ALL");
      } catch {
        // Cleanup failed — destroy the connection rather than return dirty
        // state to the pool.
        _origRelease(true);
        return;
      }
      _origRelease(err ? true : undefined);
    };

    return client;
  };

export const pool = _pool;
