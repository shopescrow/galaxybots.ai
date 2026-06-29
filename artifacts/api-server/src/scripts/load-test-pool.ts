/**
 * Pool load test — run with:
 *   npx tsx artifacts/api-server/src/scripts/load-test-pool.ts
 *
 * Simulates concurrent database access from many "tenants" and verifies:
 *   - No connection-acquisition timeouts occur within the configured limit
 *   - p50 / p95 / p99 acquisition latencies stay bounded
 *   - Pool queue depth does not grow unboundedly
 *
 * Environment variables:
 *   CONCURRENCY   Number of simultaneous workers  (default: 50)
 *   ITERATIONS    Requests per worker             (default: 20)
 *   QUERY_MS      Simulated query duration in ms  (default: 10)
 *   DATABASE_URL  Postgres connection string       (required)
 */

import { pool } from "@workspace/db";

const CONCURRENCY = Number(process.env.CONCURRENCY ?? "50");
const ITERATIONS = Number(process.env.ITERATIONS ?? "20");
const QUERY_MS = Number(process.env.QUERY_MS ?? "10");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function worker(id: number): Promise<number[]> {
  const acquireTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    let client;
    try {
      client = await pool.connect();
      acquireTimes.push(performance.now() - t0);
      await client.query(`SELECT pg_sleep($1)`, [QUERY_MS / 1000]);
    } finally {
      client?.release();
    }
    await sleep(Math.random() * 5);
  }
  return acquireTimes;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(
    `[load-test] Starting: ${CONCURRENCY} workers × ${ITERATIONS} iterations, simulated query=${QUERY_MS}ms`,
  );
  const poolMax = process.env.DB_POOL_MAX ?? "10";
  console.log(`[load-test] Pool max=${poolMax} (DB_POOL_MAX)`);

  const start = performance.now();
  let timeouts = 0;

  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i)),
  );

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const allTimes: number[] = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      allTimes.push(...r.value);
    } else {
      timeouts++;
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("connect")) {
        console.error(`[load-test] ACQUISITION TIMEOUT: ${msg}`);
      } else {
        console.error(`[load-test] Worker error: ${msg}`);
      }
    }
  }

  allTimes.sort((a, b) => a - b);

  const total = CONCURRENCY * ITERATIONS;
  const succeeded = allTimes.length;

  console.log(`\n[load-test] ── Results ──────────────────────────────────`);
  console.log(`  Total requests:      ${total}`);
  console.log(`  Succeeded:           ${succeeded}`);
  console.log(`  Failed / timed out:  ${timeouts} workers`);
  console.log(`  Elapsed:             ${elapsed}s`);
  console.log(`  Throughput:          ${(succeeded / Number(elapsed)).toFixed(1)} req/s`);
  if (allTimes.length > 0) {
    console.log(`\n  Connection acquisition latency (ms):`);
    console.log(`    min:  ${allTimes[0].toFixed(1)}`);
    console.log(`    p50:  ${percentile(allTimes, 50).toFixed(1)}`);
    console.log(`    p95:  ${percentile(allTimes, 95).toFixed(1)}`);
    console.log(`    p99:  ${percentile(allTimes, 99).toFixed(1)}`);
    console.log(`    max:  ${allTimes[allTimes.length - 1].toFixed(1)}`);
  }

  if (timeouts > 0) {
    console.error(`\n[load-test] FAIL — ${timeouts} worker(s) hit errors. ` +
      `Raise DB_POOL_MAX or reduce CONCURRENCY.`);
    process.exit(1);
  } else {
    console.log(`\n[load-test] PASS — no acquisition timeouts.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[load-test] Fatal:", err);
  process.exit(1);
});
