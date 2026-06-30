/**
 * Data-retention job — prunes aged raw rows from high-growth, append-only
 * tables according to the per-table windows stored in data_lifecycle_config.
 *
 * Design decisions:
 * - Uses DELETE … WHERE time_col < NOW() - INTERVAL '…' LIMIT batch_size so
 *   a single run never locks the table for too long.  It loops until fewer
 *   rows than the batch threshold were deleted, meaning the cohort is clean.
 * - Reads the retention window from data_lifecycle_config at job-start so ops
 *   can tune it at runtime without a redeploy.
 * - Updates last_pruned_at + rows_pruned in data_lifecycle_config after each
 *   successful pass for observability.
 * - bot_memories pruning only touches rows where archivedAt IS NOT NULL (i.e.
 *   already soft-deleted) to avoid destroying live memories.
 * - Registered on the BullMQ sweep queue; falls back to in-process scheduler.
 */

import { pool } from "@workspace/db";
import type { PoolClient } from "pg";

const BATCH_SIZE = 5_000;

interface RetentionTarget {
  table: string;
  timeColumn: string;
  extraWhere?: string;
}

const TARGETS: RetentionTarget[] = [
  { table: "llm_usage_log",             timeColumn: "called_at" },
  { table: "model_selection_telemetry", timeColumn: "created_at" },
  { table: "bot_audit_log",             timeColumn: "created_at" },
  { table: "platform_audit_log",        timeColumn: "created_at" },
  // Only prune memories that have been explicitly archived (soft-deleted).
  {
    table: "bot_memories",
    timeColumn: "created_at",
    extraWhere: "AND archived_at IS NOT NULL",
  },
];

async function getRetainDays(client: PoolClient, tableName: string): Promise<number> {
  const { rows } = await client.query<{ retain_days: number }>(
    `SELECT retain_days FROM data_lifecycle_config WHERE table_name = $1`,
    [tableName],
  );
  return rows[0]?.retain_days ?? 90;
}

async function pruneTable(
  client: PoolClient,
  target: RetentionTarget,
  retainDays: number,
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const res = await client.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM "${target.table}"
         WHERE ctid = ANY(
           ARRAY(
             SELECT ctid FROM "${target.table}"
             WHERE ${target.timeColumn} < NOW() - ($1 || ' days')::INTERVAL
             ${target.extraWhere ?? ""}
             LIMIT $2
           )
         )
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
      [retainDays, BATCH_SIZE],
    );

    const deleted = parseInt(res.rows[0]?.count ?? "0", 10);
    totalDeleted += deleted;

    if (deleted < BATCH_SIZE) break;

    // Brief pause between batches to reduce table-lock pressure.
    await new Promise((r) => setTimeout(r, 200));
  }

  return totalDeleted;
}

async function updateConfig(
  client: PoolClient,
  tableName: string,
  rowsPruned: number,
): Promise<void> {
  await client.query(
    `UPDATE data_lifecycle_config
     SET last_pruned_at = NOW(),
         rows_pruned    = rows_pruned + $2,
         updated_at     = NOW()
     WHERE table_name = $1`,
    [tableName, rowsPruned],
  );
}

export async function runDataRetention(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const target of TARGETS) {
      try {
        const retainDays = await getRetainDays(client, target.table);
        const deleted    = await pruneTable(client, target, retainDays);

        if (deleted > 0) {
          await updateConfig(client, target.table, deleted);
          console.log(
            `[data-retention] Pruned ${deleted} rows from ${target.table} (retain=${retainDays}d)`,
          );
        }
      } catch (err) {
        // Log per-table errors without aborting the other tables.
        console.error(`[data-retention] Error pruning ${target.table}:`, err);
      }
    }
  } finally {
    client.release();
  }
}
