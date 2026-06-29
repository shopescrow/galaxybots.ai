import { AsyncLocalStorage } from "node:async_hooks";

export type TenantCtx =
  | { type: "tenant"; clientId: number }
  | { type: "bypass" };

/**
 * AsyncLocalStorage that propagates the active tenant context across the
 * entire async call stack of an HTTP request.
 *
 * The Express middleware (attachTenantDbContext) calls `tenantContextStore.run()`
 * with the authenticated `clientId` BEFORE calling `next()`, so every middleware
 * and route handler that runs after it — including all existing code that uses
 * the global `db` — executes inside the correct ALS context.
 *
 * The pool interceptor in index.ts reads this store on every `pool.connect()`,
 * applies the appropriate session variables, and resets them on release.
 */
export const tenantContextStore = new AsyncLocalStorage<TenantCtx>();
