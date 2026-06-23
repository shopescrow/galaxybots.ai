import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%belief%' OR table_name LIKE '%bot_loop%') ORDER BY table_name"
);
console.log("Tables:", r.rows.map(x => x.table_name));
await pool.end();
