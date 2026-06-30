/**
 * Provider key pool — health-aware load balancing across multiple API keys.
 *
 * GLM/Zhipu runs on a single ZHIPU_API_KEY by default. When you set additional
 * keys (ZHIPU_API_KEY_1, ZHIPU_API_KEY_2, …) they are pooled and requests are
 * distributed with round-robin + per-key rate-limit backoff. A key that received
 * a 429 is skipped until its backoff window expires; only when ALL keys are
 * backing off does the call surface an error (or fall through to the GPT/Claude
 * chain via the normal fallback path).
 *
 * This keeps the global GLM circuit breaker from tripping just because one key
 * hit its rate limit — a transient per-key condition, not a provider outage.
 */

const KEY_RATE_LIMIT_BACKOFF_MS = 60_000;

interface KeyEntry {
  key: string;
  label: string;
  rateLimitedUntil: number;
  totalRequests: number;
  lastUsedAt: number;
}

const pool: KeyEntry[] = [];
let roundRobinIndex = 0;
let poolInitialised = false;

function loadPool(): void {
  if (poolInitialised) return;
  poolInitialised = true;

  const candidates: Array<{ label: string; key: string }> = [];

  const base = process.env["ZHIPU_API_KEY"];
  if (base && base.length > 0) candidates.push({ label: "ZHIPU_API_KEY", key: base });

  for (let i = 1; i <= 9; i++) {
    const k = process.env[`ZHIPU_API_KEY_${i}`];
    if (k && k.length > 0) candidates.push({ label: `ZHIPU_API_KEY_${i}`, key: k });
  }

  for (const c of candidates) {
    pool.push({ key: c.key, label: c.label, rateLimitedUntil: 0, totalRequests: 0, lastUsedAt: 0 });
  }

  if (pool.length === 0) {
    console.log("[ProviderKeyPool] No ZHIPU_API_KEY configured — GLM pool is empty");
  } else {
    console.log(`[ProviderKeyPool] GLM key pool initialised with ${pool.length} key(s): ${candidates.map((c) => c.label).join(", ")}`);
  }
}

/** True when at least one Zhipu key is configured (regardless of rate-limit state). */
export function glmPoolHasKeys(): boolean {
  loadPool();
  return pool.length > 0;
}

/**
 * Pick the next healthy GLM key using round-robin across all non-rate-limited entries.
 * Returns null when every configured key is currently rate-limited.
 */
export function pickGlmKey(): { key: string; label: string } | null {
  loadPool();
  if (pool.length === 0) return null;

  const now = Date.now();
  const healthy = pool.filter((e) => e.rateLimitedUntil <= now);

  if (healthy.length === 0) {
    return null;
  }

  const idx = roundRobinIndex % healthy.length;
  roundRobinIndex = (roundRobinIndex + 1) % healthy.length;

  const entry = healthy[idx]!;
  entry.totalRequests += 1;
  entry.lastUsedAt = now;

  return { key: entry.key, label: entry.label };
}

/**
 * Mark a specific key as rate-limited for the standard backoff window.
 * The key will be skipped by pickGlmKey() until the window expires.
 */
export function markGlmKeyRateLimited(key: string): void {
  loadPool();
  const entry = pool.find((e) => e.key === key);
  if (!entry) return;

  const until = Date.now() + KEY_RATE_LIMIT_BACKOFF_MS;
  entry.rateLimitedUntil = until;

  const healthyRemaining = pool.filter((e) => e.rateLimitedUntil <= Date.now()).length;
  console.warn(
    `[ProviderKeyPool] ${entry.label} rate-limited — backing off for ${KEY_RATE_LIMIT_BACKOFF_MS / 1000}s. ` +
      `${healthyRemaining} of ${pool.length} key(s) still healthy.`,
  );
}

/** Return an observable snapshot of the key pool (keys redacted). */
export function getGlmPoolStatus(): Array<{
  label: string;
  healthy: boolean;
  rateLimitedUntilMs: number | null;
  totalRequests: number;
}> {
  loadPool();
  const now = Date.now();
  return pool.map((e) => ({
    label: e.label,
    healthy: e.rateLimitedUntil <= now,
    rateLimitedUntilMs: e.rateLimitedUntil > now ? e.rateLimitedUntil : null,
    totalRequests: e.totalRequests,
  }));
}
