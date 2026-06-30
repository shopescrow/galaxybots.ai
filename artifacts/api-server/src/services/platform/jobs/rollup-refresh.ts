/**
 * Rollup-refresh job — upserts pre-aggregated daily summaries into the three
 * rollup tables so that analytics dashboard routes can stop scanning millions
 * of raw event rows.
 *
 * Run once per day (registered on the BullMQ sweep queue).  Computes rollups
 * for the *previous* calendar day so all raw rows for that day are present.
 * Uses ON CONFLICT DO UPDATE so re-runs on the same day are idempotent.
 *
 * Tables refreshed:
 *   llm_usage_daily_rollup       — per (client, bot, model, day)
 *   model_telemetry_daily_rollup — per (client, task_category, model, shadow, day)
 *   audit_log_daily_rollup       — per (client, action, day)
 */

import { pool } from "@workspace/db";

export async function runRollupRefresh(targetDate?: Date): Promise<void> {
  const client = await pool.connect();
  try {
    // Default: refresh yesterday so the full day's data is available.
    const d = targetDate ?? new Date(Date.now() - 86_400_000);
    const day = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

    await refreshLlmUsageRollup(client, day);
    await refreshModelTelemetryRollup(client, day);
    await refreshAuditLogRollup(client, day);

    console.log(`[rollup-refresh] Completed rollups for ${day}`);
  } finally {
    client.release();
  }
}

async function refreshLlmUsageRollup(
  client: Awaited<ReturnType<typeof pool.connect>>,
  day: string,
): Promise<void> {
  await client.query(
    `INSERT INTO llm_usage_daily_rollup
       (rollup_date, client_id, bot_id, model, model_tier,
        call_count, prompt_tokens, completion_tokens, total_cost_usd,
        avg_latency_ms, p95_latency_ms, computed_at)
     SELECT
       $1::date                                               AS rollup_date,
       client_id,
       bot_id,
       model,
       model_tier,
       COUNT(*)                                               AS call_count,
       SUM(prompt_tokens)                                     AS prompt_tokens,
       SUM(completion_tokens)                                 AS completion_tokens,
       SUM(estimated_cost_usd::numeric)                       AS total_cost_usd,
       AVG(latency_ms)                                        AS avg_latency_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
       NOW()                                                  AS computed_at
     FROM llm_usage_log
     WHERE called_at >= $1::date
       AND called_at <  $1::date + INTERVAL '1 day'
     GROUP BY client_id, bot_id, model, model_tier
     ON CONFLICT (rollup_date, client_id, bot_id, model) DO UPDATE SET
       model_tier        = EXCLUDED.model_tier,
       call_count        = EXCLUDED.call_count,
       prompt_tokens     = EXCLUDED.prompt_tokens,
       completion_tokens = EXCLUDED.completion_tokens,
       total_cost_usd    = EXCLUDED.total_cost_usd,
       avg_latency_ms    = EXCLUDED.avg_latency_ms,
       p95_latency_ms    = EXCLUDED.p95_latency_ms,
       computed_at       = NOW()`,
    [day],
  );
}

async function refreshModelTelemetryRollup(
  client: Awaited<ReturnType<typeof pool.connect>>,
  day: string,
): Promise<void> {
  await client.query(
    `INSERT INTO model_telemetry_daily_rollup
       (rollup_date, client_id, task_category, model, model_tier,
        selection_mode, shadow, sample_count,
        avg_reward_score, avg_quality_score, avg_cost_usd, avg_latency_ms,
        computed_at)
     SELECT
       $1::date                           AS rollup_date,
       client_id,
       task_category,
       model,
       model_tier,
       selection_mode,
       shadow,
       COUNT(*)                           AS sample_count,
       AVG(reward_score)                  AS avg_reward_score,
       AVG(quality_score)                 AS avg_quality_score,
       AVG(cost_usd)                      AS avg_cost_usd,
       AVG(latency_ms)                    AS avg_latency_ms,
       NOW()                              AS computed_at
     FROM model_selection_telemetry
     WHERE created_at >= $1::date
       AND created_at <  $1::date + INTERVAL '1 day'
     GROUP BY client_id, task_category, model, model_tier, selection_mode, shadow
     ON CONFLICT (rollup_date, client_id, task_category, model, shadow) DO UPDATE SET
       model_tier        = EXCLUDED.model_tier,
       selection_mode    = EXCLUDED.selection_mode,
       sample_count      = EXCLUDED.sample_count,
       avg_reward_score  = EXCLUDED.avg_reward_score,
       avg_quality_score = EXCLUDED.avg_quality_score,
       avg_cost_usd      = EXCLUDED.avg_cost_usd,
       avg_latency_ms    = EXCLUDED.avg_latency_ms,
       computed_at       = NOW()`,
    [day],
  );
}

async function refreshAuditLogRollup(
  client: Awaited<ReturnType<typeof pool.connect>>,
  day: string,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log_daily_rollup
       (rollup_date, client_id, action, event_count, computed_at)
     SELECT
       $1::date  AS rollup_date,
       client_id,
       action,
       COUNT(*)  AS event_count,
       NOW()     AS computed_at
     FROM platform_audit_log
     WHERE created_at >= $1::date
       AND created_at <  $1::date + INTERVAL '1 day'
     GROUP BY client_id, action
     ON CONFLICT (rollup_date, client_id, action) DO UPDATE SET
       event_count = EXCLUDED.event_count,
       computed_at = NOW()`,
    [day],
  );
}
