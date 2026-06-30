/**
 * Distributed sweep queues for per-tenant background jobs.
 *
 * Replaces the single-node serial sweeps (memory-embedding-backfill,
 * episodic-memory, model-reputation-reeval) with BullMQ queues so work
 * is sharded by tenant, retried with backoff, and processed in parallel
 * across a bounded worker pool. The recurring "fanout" triggers use
 * BullMQ's repeat feature so they fire exactly once cluster-wide.
 *
 * Falls back silently when REDIS_URL is absent — in that case the
 * existing setInterval scheduler remains responsible for these jobs.
 *
 * Design decisions:
 * - Per-tenant job IDs include a cycle-epoch suffix so the same tenant
 *   can be re-enqueued on the next cycle, but de-duplicated if the fanout
 *   fires twice within the same window.
 * - Episodic-memory workers check for an existing summary before
 *   inserting (application-level idempotency guard).
 * - Model-reputation is split: global aggregation runs once in the fanout
 *   handler; shadow-promotion is a per-client job for horizontal scale.
 * - Permanently-failed jobs (all retries exhausted) are moved to a
 *   dead-letter queue for operator inspection.
 * - areSweepQueuesActive() gates on Redis health so a node that loses
 *   Redis falls back to in-process sweeps instead of silently skipping.
 */

import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { getBullConnection } from "./bull-client.js";
import { isRedisAvailable } from "../../scaling/redis-store.js";
import { db, clientBotsTable, episodicSummariesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { backfillMissingEmbeddings } from "../../bots/memory.js";
import { runEpisodicMemoryForBot } from "../jobs/episodic-memory.js";
import {
  computeGlobalModelReputations,
  evaluateShadowPromotionForClient,
  getClientsWithShadowTelemetry,
} from "../jobs/model-reputation.js";
import { runDataRetention } from "../jobs/data-retention.js";
import { runRollupRefresh } from "../jobs/rollup-refresh.js";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Queue names ────────────────────────────────────────────────────────────

export const QUEUE_MEMORY_BACKFILL  = "sweep:memory-embedding-backfill";
export const QUEUE_EPISODIC_MEMORY  = "sweep:episodic-memory";
export const QUEUE_MODEL_REPUTATION = "sweep:model-reputation";
export const QUEUE_DATA_RETENTION   = "sweep:data-retention";
export const QUEUE_ROLLUP_REFRESH   = "sweep:rollup-refresh";
export const QUEUE_DLQ              = "sweep:dlq";

// ── Job name constants ─────────────────────────────────────────────────────

const JOB_FANOUT         = "fanout";
const JOB_PROCESS_TENANT = "process-tenant";

// ── Shared job options ─────────────────────────────────────────────────────

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 10_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

// ── Worker concurrency ─────────────────────────────────────────────────────

const WORKER_CONCURRENCY = 5;

// ── Repeat intervals ───────────────────────────────────────────────────────

const MEMORY_BACKFILL_EVERY_MS  = 6  * 60 * 60 * 1000;  // 6 h
const EPISODIC_MEMORY_EVERY_MS  = 24 * 60 * 60 * 1000;  // 24 h (monthly gate inside job)
const MODEL_REPUTATION_EVERY_MS = 24 * 60 * 60 * 1000;  // 24 h (daily gate inside job)

// ── Active handles (for clean shutdown) ───────────────────────────────────

let queues:  Queue[]  = [];
let workers: Worker[] = [];

// ── Helpers ────────────────────────────────────────────────────────────────

async function getActiveAssignments() {
  return db
    .select({ botId: clientBotsTable.botId, clientId: clientBotsTable.clientId })
    .from(clientBotsTable)
    .where(eq(clientBotsTable.status, "active"));
}

/**
 * Routes a permanently-failed job to the dead-letter queue so operators can
 * inspect failed items without losing them. Called from the `failed` event
 * handler only when all retry attempts are exhausted.
 */
async function parkInDlq(
  dlqQueue: Queue,
  job: Job,
  err: Error,
): Promise<void> {
  try {
    await dlqQueue.add(
      "dead-letter",
      {
        sourceQueue: job.queueName,
        jobId:       job.id,
        jobName:     job.name,
        data:        job.data,
        failedReason: err.message,
        attemptsMade: job.attemptsMade,
        failedAt:    new Date().toISOString(),
      },
      { removeOnComplete: false, removeOnFail: false },
    );
  } catch (dlqErr) {
    console.error("[sweep:dlq] Failed to park dead-letter job:", errMsg(dlqErr));
  }
}

// ── Memory-embedding-backfill queue ───────────────────────────────────────

function createMemoryBackfillQueue(
  connection: NonNullable<ReturnType<typeof getBullConnection>>,
  dlqQueue: Queue,
) {
  const queue = new Queue(QUEUE_MEMORY_BACKFILL, { connection });

  const worker = new Worker<{ botId?: number; clientId?: number }>(
    QUEUE_MEMORY_BACKFILL,
    async (job) => {
      if (job.name === JOB_FANOUT) {
        const assignments = await getActiveAssignments();
        // Cycle epoch: unique per cadence window so the same tenant can be
        // re-enqueued on the next cycle, but de-duplicated within one window.
        const cycleEpoch = Math.floor(Date.now() / MEMORY_BACKFILL_EVERY_MS);
        for (const { botId, clientId } of assignments) {
          const jobId = `${QUEUE_MEMORY_BACKFILL}:${botId}:${clientId}:${cycleEpoch}`;
          await queue.add(
            JOB_PROCESS_TENANT,
            { botId, clientId },
            { ...defaultJobOpts, jobId },
          );
        }
        console.log(
          `[sweep:memory-backfill] Enqueued ${assignments.length} tenant job(s) for epoch ${cycleEpoch}`,
        );
        return;
      }

      const { botId, clientId } = job.data;
      if (!botId || !clientId) throw new UnrecoverableError("Job data missing botId or clientId");

      const { processed, failed } = await backfillMissingEmbeddings({
        botId,
        clientId,
        batchSize: 50,
      });
      if (processed > 0 || failed > 0) {
        console.log(
          `[sweep:memory-backfill] bot=${botId} client=${clientId}: processed=${processed} failed=${failed}`,
        );
      }
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[sweep:memory-backfill] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts ?? defaultJobOpts.attempts}): ${errMsg(err)}`,
    );
    if (job && job.attemptsMade >= (job.opts?.attempts ?? defaultJobOpts.attempts)) {
      await parkInDlq(dlqQueue, job, err);
    }
  });

  return { queue, worker };
}

// ── Episodic-memory queue ─────────────────────────────────────────────────

function createEpisodicMemoryQueue(
  connection: NonNullable<ReturnType<typeof getBullConnection>>,
  dlqQueue: Queue,
) {
  const queue = new Queue(QUEUE_EPISODIC_MEMORY, { connection });

  const worker = new Worker<{
    botId?: number;
    clientId?: number;
    periodStart?: string;
    periodEnd?: string;
  }>(
    QUEUE_EPISODIC_MEMORY,
    async (job) => {
      if (job.name === JOB_FANOUT) {
        const now = new Date();
        if (now.getUTCDate() !== 1) return; // Not the first of the month.

        const periodEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const monthKey    = periodStart.toISOString().slice(0, 7); // "YYYY-MM"

        const assignments = await getActiveAssignments();
        for (const { botId, clientId } of assignments) {
          // Month-scoped job ID: deduplicates across daily trigger runs for the
          // same month, but allows re-enqueueing on the next month's first day.
          const jobId = `${QUEUE_EPISODIC_MEMORY}:${botId}:${clientId}:${monthKey}`;
          await queue.add(
            JOB_PROCESS_TENANT,
            {
              botId,
              clientId,
              periodStart: periodStart.toISOString(),
              periodEnd:   periodEnd.toISOString(),
            },
            { ...defaultJobOpts, jobId },
          );
        }
        console.log(
          `[sweep:episodic-memory] Enqueued ${assignments.length} tenant job(s) for ${monthKey}`,
        );
        return;
      }

      const { botId, clientId, periodStart, periodEnd } = job.data;
      if (!botId || !clientId || !periodStart || !periodEnd) {
        throw new UnrecoverableError("Job data missing required fields");
      }

      // Application-level idempotency guard: skip if a summary already exists
      // for this bot/client/period (prevents duplicate inserts on retry).
      const existing = await db
        .select({ id: episodicSummariesTable.id })
        .from(episodicSummariesTable)
        .where(
          and(
            eq(episodicSummariesTable.botId, botId),
            eq(episodicSummariesTable.clientId, clientId),
            eq(episodicSummariesTable.periodStart, new Date(periodStart)),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(
          `[sweep:episodic-memory] Skipping bot=${botId} client=${clientId} — summary for ${periodStart} already exists`,
        );
        return;
      }

      await runEpisodicMemoryForBot(botId, clientId, new Date(periodStart), new Date(periodEnd));
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[sweep:episodic-memory] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts ?? defaultJobOpts.attempts}): ${errMsg(err)}`,
    );
    if (job && job.attemptsMade >= (job.opts?.attempts ?? defaultJobOpts.attempts)) {
      await parkInDlq(dlqQueue, job, err);
    }
  });

  return { queue, worker };
}

// ── Model-reputation queue ─────────────────────────────────────────────────
//
// Sharded into two job types:
//   fanout          — runs global telemetry aggregation once, then enqueues
//                     one per-client shadow-promotion job per tenant.
//   process-tenant  — evaluates shadow-model promotion for a single clientId.
//
// This lets adding workers increase throughput for the per-client phase while
// keeping the global aggregation as a single atomic step per cycle.

function createModelReputationQueue(
  connection: NonNullable<ReturnType<typeof getBullConnection>>,
  dlqQueue: Queue,
) {
  const queue = new Queue(QUEUE_MODEL_REPUTATION, { connection });

  const worker = new Worker<{ clientId?: number }>(
    QUEUE_MODEL_REPUTATION,
    async (job) => {
      if (job.name === JOB_FANOUT) {
        // Phase 1: global reputation aggregation (single, not per-tenant).
        await computeGlobalModelReputations();
        console.log("[sweep:model-reputation] Global aggregation complete");

        // Phase 2: fan out per-client shadow-promotion jobs.
        const clientIds  = await getClientsWithShadowTelemetry();
        const cycleEpoch = Math.floor(Date.now() / MODEL_REPUTATION_EVERY_MS);
        for (const clientId of clientIds) {
          const jobId = `${QUEUE_MODEL_REPUTATION}:${clientId}:${cycleEpoch}`;
          await queue.add(
            JOB_PROCESS_TENANT,
            { clientId },
            { ...defaultJobOpts, jobId },
          );
        }
        console.log(
          `[sweep:model-reputation] Enqueued ${clientIds.length} shadow-promotion job(s) for epoch ${cycleEpoch}`,
        );
        return;
      }

      const { clientId } = job.data;
      if (!clientId) throw new UnrecoverableError("Job data missing clientId");
      await evaluateShadowPromotionForClient(clientId);
    },
    { connection, concurrency: WORKER_CONCURRENCY },
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[sweep:model-reputation] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts ?? defaultJobOpts.attempts}): ${errMsg(err)}`,
    );
    if (job && job.attemptsMade >= (job.opts?.attempts ?? defaultJobOpts.attempts)) {
      await parkInDlq(dlqQueue, job, err);
    }
  });

  return { queue, worker };
}

// ── Data-retention queue ──────────────────────────────────────────────────
//
// Single global job (no fanout) — retention runs DELETE on the DB directly
// and is naturally serialised through the table-lock mechanism.

function createDataRetentionQueue(
  connection: NonNullable<ReturnType<typeof getBullConnection>>,
  dlqQueue: Queue,
) {
  const queue = new Queue(QUEUE_DATA_RETENTION, { connection });

  const worker = new Worker(
    QUEUE_DATA_RETENTION,
    async () => {
      await runDataRetention();
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[sweep:data-retention] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${errMsg(err)}`,
    );
    if (job && job.attemptsMade >= (job.opts?.attempts ?? defaultJobOpts.attempts)) {
      await parkInDlq(dlqQueue, job, err);
    }
  });

  return { queue, worker };
}

// ── Rollup-refresh queue ──────────────────────────────────────────────────
//
// Single global job — computes yesterday's aggregates into the daily rollup
// tables so dashboard queries stop scanning raw event rows.

function createRollupRefreshQueue(
  connection: NonNullable<ReturnType<typeof getBullConnection>>,
  dlqQueue: Queue,
) {
  const queue = new Queue(QUEUE_ROLLUP_REFRESH, { connection });

  const worker = new Worker(
    QUEUE_ROLLUP_REFRESH,
    async () => {
      await runRollupRefresh();
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", async (job, err) => {
    console.error(
      `[sweep:rollup-refresh] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${errMsg(err)}`,
    );
    if (job && job.attemptsMade >= (job.opts?.attempts ?? defaultJobOpts.attempts)) {
      await parkInDlq(dlqQueue, job, err);
    }
  });

  return { queue, worker };
}

// ── Register cluster-safe repeat triggers ─────────────────────────────────

const DATA_RETENTION_EVERY_MS  = 24 * 60 * 60 * 1000; // 24 h
const ROLLUP_REFRESH_EVERY_MS  = 24 * 60 * 60 * 1000; // 24 h

async function registerRepeatTriggers(
  memQueue:        Queue,
  episodicQueue:   Queue,
  reputationQueue: Queue,
  retentionQueue:  Queue,
  rollupQueue:     Queue,
): Promise<void> {
  await memQueue.upsertJobScheduler(
    "memory-backfill-trigger",
    { every: MEMORY_BACKFILL_EVERY_MS },
    { name: JOB_FANOUT, opts: defaultJobOpts },
  );

  await episodicQueue.upsertJobScheduler(
    "episodic-memory-trigger",
    { every: EPISODIC_MEMORY_EVERY_MS },
    { name: JOB_FANOUT, opts: defaultJobOpts },
  );

  await reputationQueue.upsertJobScheduler(
    "model-reputation-trigger",
    { every: MODEL_REPUTATION_EVERY_MS },
    { name: JOB_FANOUT, opts: defaultJobOpts },
  );

  await retentionQueue.upsertJobScheduler(
    "data-retention-trigger",
    { every: DATA_RETENTION_EVERY_MS },
    { name: "run", opts: defaultJobOpts },
  );

  await rollupQueue.upsertJobScheduler(
    "rollup-refresh-trigger",
    { every: ROLLUP_REFRESH_EVERY_MS },
    { name: "run", opts: defaultJobOpts },
  );

  console.log("[sweep-queues] Cluster-safe repeat triggers registered");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts the distributed sweep queues. Safe to call multiple times — if
 * Redis is unavailable, this is a no-op and returns false so the caller
 * can fall back to the in-process scheduler.
 *
 * Returns true only when queues AND repeat triggers are both fully active.
 * Any failure during trigger registration tears workers down and returns
 * false so the in-process scheduler takes over without gaps.
 */
export async function startSweepQueues(): Promise<boolean> {
  const connection = getBullConnection();
  if (!connection) {
    console.log(
      "[sweep-queues] REDIS_URL not set — distributed sweep queues disabled (using in-process scheduler fallback)",
    );
    return false;
  }

  // Dead-letter queue — shared sink for permanently-failed jobs.
  const dlqQueue = new Queue(QUEUE_DLQ, { connection });

  const memResult        = createMemoryBackfillQueue(connection, dlqQueue);
  const episodicResult   = createEpisodicMemoryQueue(connection, dlqQueue);
  const reputationResult = createModelReputationQueue(connection, dlqQueue);
  const retentionResult  = createDataRetentionQueue(connection, dlqQueue);
  const rollupResult     = createRollupRefreshQueue(connection, dlqQueue);

  queues  = [
    dlqQueue,
    memResult.queue,
    episodicResult.queue,
    reputationResult.queue,
    retentionResult.queue,
    rollupResult.queue,
  ];
  workers = [
    memResult.worker,
    episodicResult.worker,
    reputationResult.worker,
    retentionResult.worker,
    rollupResult.worker,
  ];

  try {
    await registerRepeatTriggers(
      memResult.queue,
      episodicResult.queue,
      reputationResult.queue,
      retentionResult.queue,
      rollupResult.queue,
    );
  } catch (err) {
    console.error(
      "[sweep-queues] Failed to register repeat triggers — falling back to in-process scheduler:",
      errMsg(err),
    );
    await Promise.allSettled([
      ...workers.map((w) => w.close()),
      ...queues.map((q) => q.close()),
    ]);
    workers = [];
    queues  = [];
    return false;
  }

  console.log(
    "[sweep-queues] Distributed sweep queues started (memory-backfill, episodic-memory, model-reputation, data-retention, rollup-refresh)",
  );
  return true;
}

/**
 * Gracefully shuts down all queue workers. Called during server shutdown.
 */
export async function stopSweepQueues(): Promise<void> {
  await Promise.allSettled([
    ...workers.map((w) => w.close()),
    ...queues.map((q) => q.close()),
  ]);
  workers = [];
  queues  = [];
  console.log("[sweep-queues] Distributed sweep queues stopped");
}

/**
 * Whether distributed sweep queues are active AND Redis is currently healthy.
 *
 * Gating on isRedisAvailable() means a node that loses its Redis connection
 * automatically falls back to in-process sweeps rather than silently skipping
 * them, preventing a split-brain scenario where one node has workers but no
 * working triggers.
 */
export function areSweepQueuesActive(): boolean {
  return workers.length > 0 && isRedisAvailable();
}
