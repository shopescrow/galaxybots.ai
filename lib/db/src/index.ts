import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";
import { pool } from "./pool.js";

export { pool } from "./pool.js";

export const db = drizzle(pool, { schema });

export * from "./schema/index.js";
export { tenantContextStore } from "./tenant-context.js";
export { createRlsHelpers, withTenantContext, withBypassRLS } from "./rls-context.js";
export type { TenantDb } from "./rls-context.js";
