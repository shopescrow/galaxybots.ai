import pLimit from "p-limit";

/**
 * Shared concurrency pool / token bucket for internal LLM fan-out.
 *
 * The conductor strategies used to fan out with raw `Promise.all`, which
 * bypasses every rate limiter and lets a single high-tier run saturate the
 * provider — driving up latency, retries, and cost for every other tenant.
 *
 * This module gives each client a `p-limit` semaphore sized by their plan tier
 * AND enforces a global ceiling so the sum of all internal fan-out never blows
 * past provider capacity. Strategies funnel their per-agent calls through
 * `runFanOut` instead of `Promise.all`.
 */

const PLAN_CONCURRENCY_LIMITS: Record<string, number> = {
  starter: 2,
  growth: 3,
  professional: 5,
  enterprise: 10,
  unlimited: 16,
};

const DEFAULT_CLIENT_CONCURRENCY = 3;
/** Hard global ceiling across ALL clients' internal fan-out. */
const GLOBAL_CONCURRENCY = 24;

const globalLimit = pLimit(GLOBAL_CONCURRENCY);
const clientLimiters = new Map<number, ReturnType<typeof pLimit>>();

export function resolveClientConcurrency(plan?: string | null): number {
  if (!plan) return DEFAULT_CLIENT_CONCURRENCY;
  return PLAN_CONCURRENCY_LIMITS[plan.toLowerCase()] ?? DEFAULT_CLIENT_CONCURRENCY;
}

function getClientLimiter(clientId: number | undefined, concurrency: number): ReturnType<typeof pLimit> {
  if (clientId == null) return pLimit(concurrency);
  const existing = clientLimiters.get(clientId);
  if (existing) return existing;
  const limiter = pLimit(concurrency);
  clientLimiters.set(clientId, limiter);
  return limiter;
}

export interface FanOutOptions {
  clientId?: number;
  /** Plan tier name used to size the per-client semaphore. */
  plan?: string | null;
  /** Explicit per-client concurrency override (wins over plan-derived). */
  concurrency?: number;
}

/**
 * Run a set of tasks honoring both the per-client tier limit and the global
 * ceiling. Order of results matches the order of `tasks`. Individual task
 * rejections propagate (callers wrap their own try/catch as they did with
 * Promise.all).
 */
export async function runFanOut<T>(
  tasks: Array<() => Promise<T>>,
  options: FanOutOptions = {},
): Promise<T[]> {
  const concurrency = options.concurrency ?? resolveClientConcurrency(options.plan);
  const clientLimit = getClientLimiter(options.clientId, concurrency);

  return Promise.all(
    tasks.map((task) => clientLimit(() => globalLimit(task))),
  );
}

/** Test/maintenance helper — clears cached per-client limiters. */
export function _resetConcurrencyPools(): void {
  clientLimiters.clear();
}
