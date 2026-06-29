/**
 * Applies the RLS enable migration (0001_enable_rls.sql) to the database.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx lib/db/src/run-rls-migration.ts
 *
 * The migration is idempotent and safe to run more than once.
 * It must be executed by the same DB user that owns the application tables
 * so that the `GRANT app_tenant TO CURRENT_USER` step targets the right principal.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const client = await pool.connect();

  try {
    const sqlPath = join(__dirname, "migrations", "0001_enable_rls.sql");
    const sql = readFileSync(sqlPath, "utf8");

    console.log("Applying RLS migration …");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("RLS migration applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("RLS migration FAILED:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
