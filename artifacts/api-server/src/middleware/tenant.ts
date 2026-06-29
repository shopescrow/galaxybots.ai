import type { Request, Response, NextFunction } from "express";
import { pool, tenantContextStore } from "@workspace/db";
import { createRlsHelpers } from "@workspace/db";
import type { TenantDb } from "@workspace/db";

export async function validateTenantOwnership(
  callerClientId: number,
  targetId: number,
  isPlatformAdmin: boolean,
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  if (callerClientId === targetId) return true;
  return false;
}

export function requireTenantAccess(
  paramName: "subClientId" | "clientId" = "subClientId",
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const callerClientId = req.user?.clientId;
    if (!callerClientId) {
      res
        .status(401)
        .json({ error: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    let targetId: number | null = null;

    if (paramName === "subClientId") {
      const raw = req.body?.subClientId ?? req.query?.subClientId;
      if (raw !== undefined && raw !== null && raw !== "") {
        targetId = Number(raw);
      }
    } else {
      const raw =
        req.body?.clientId ?? req.query?.clientId ?? req.params?.clientId;
      if (raw !== undefined && raw !== null && raw !== "") {
        targetId = Number(raw);
      }
    }

    if (targetId === null || isNaN(targetId)) {
      next();
      return;
    }

    const admin = isPlatformAdminUser(req);
    const allowed = await validateTenantOwnership(
      callerClientId,
      targetId,
      admin,
    );
    if (!allowed) {
      res.status(403).json({
        error: "TENANT_ACCESS_DENIED",
        message: `You do not have access to the requested ${
          paramName === "subClientId" ? "sub-client" : "client"
        }`,
      });
      return;
    }

    next();
  };
}

/**
 * Returns true only for requests carrying genuine platform-admin or platform-API-key
 * credentials — not for ordinary tenant users who happen to have bypassPayment set.
 *
 * Recognized platform identities:
 *   role === 'platform'  — platform API key (set by platform-api-key.ts middleware)
 *   role === 'owner' AND bypassPayment === true  — internal admin account
 *     (consistent with the existing require-queen-control.ts convention)
 */
function isPlatformAdminUser(req: Request): boolean {
  const user = req.user;
  if (!user) return false;
  if (user.role === "platform") return true;
  if (user.role === "owner" && user.bypassPayment === true) return true;
  return false;
}

/**
 * Attaches RLS-aware DB context to every authenticated request.
 *
 * KEY BEHAVIOUR — automatic enforcement:
 *   This middleware calls `tenantContextStore.run(ctx, next)` rather than
 *   `next()` directly. Because AsyncLocalStorage propagates through the entire
 *   async call-stack, every piece of code that runs after this middleware
 *   (route handlers, service functions, repositories) that touches the global
 *   `db` will automatically execute with the tenant context applied via the
 *   pool interceptor in lib/db/src/index.ts. No opt-in needed — a missed
 *   WHERE clause is still bounded by the database's RLS policy.
 *
 * Tenant requests (authenticated, non-admin):
 *   Pool connections are configured with SET ROLE app_tenant +
 *   SET app.current_client_id = '<clientId>'. The rls_tenant_policy (TO
 *   app_tenant) enforces a strict client_id check with no bypass branch.
 *
 * Platform-admin requests:
 *   Pool connections are configured with SET app.bypass_rls = 'on'.
 *   The rls_owner_bypass policy allows cross-tenant visibility. Admins also
 *   receive req.withBypassRLS for explicit cross-tenant operations.
 *
 * Unauthenticated paths:
 *   No ALS context is set. FORCE ROW LEVEL SECURITY ensures tenant-table
 *   queries return 0 rows, which is correct for pre-auth code paths.
 *
 * Mount AFTER `authenticate` so req.user is populated.
 *
 * Example — tenant-isolated query (WHERE clause is optional; RLS guarantees it):
 *   const rows = await db.select().from(usersTable);
 *   // Only this tenant's rows are returned even without WHERE.
 *
 * Example — explicit tenant context wrapper (for clarity in complex flows):
 *   const rows = await req.withTenantContext!((db) =>
 *     db.select().from(usersTable)
 *   );
 *
 * Example — admin cross-tenant (still include WHERE for clarity):
 *   const rows = await req.withBypassRLS!((db) =>
 *     db.select().from(usersTable).where(eq(usersTable.clientId, targetId))
 *   );
 */
export function attachTenantDbContext() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const clientId = req.user?.clientId;
    const helpers = createRlsHelpers(pool);
    const isAdmin = isPlatformAdminUser(req);

    if (clientId && !isAdmin) {
      // Tenant request: wrap the entire downstream call-stack in ALS tenant context.
      // All global `db` calls in routes/services will automatically execute as
      // app_tenant with client_id set — no explicit withTenantContext needed.
      req.withTenantContext = <T>(fn: (db: TenantDb) => Promise<T>) =>
        helpers.withTenantContext(clientId, fn);

      tenantContextStore.run({ type: "tenant", clientId }, next);
      return;
    }

    if (isAdmin) {
      // Platform-admin request: bypass context so cross-tenant queries work.
      req.withBypassRLS = <T>(fn: (db: TenantDb) => Promise<T>) =>
        helpers.withBypassRLS(fn);

      tenantContextStore.run({ type: "bypass" }, next);
      return;
    }

    // Unauthenticated request: no ALS context is set.
    // pool.ts no-context behavior = DENY (FORCE RLS returns 0 rows for all
    // tenant-scoped tables). This is the correct safe default — a missed
    // WHERE clause on an unauthenticated path cannot expose tenant data.
    //
    // Public routes that legitimately need tenant data (shared proposals,
    // webhook validators, etc.) MUST wrap their individual DB queries in
    // withBypassRLS() explicitly. This keeps bypasses narrowly scoped to
    // the specific query that needs them, not the entire request.
    next();
  };
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Explicitly run a DB operation in tenant-isolated context.
       * Equivalent to the implicit context already active for the request, but
       * useful for clarity or for nested operations that need a different clientId.
       */
      withTenantContext?: <T>(fn: (db: TenantDb) => Promise<T>) => Promise<T>;
      /**
       * Run a DB operation with RLS bypass. Only available to platform-admin
       * requests (role === 'platform' or 'owner' + bypassPayment).
       */
      withBypassRLS?: <T>(fn: (db: TenantDb) => Promise<T>) => Promise<T>;
    }
  }
}
