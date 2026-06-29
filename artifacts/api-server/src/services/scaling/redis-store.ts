/**
 * Shared Redis store with graceful in-memory fallback.
 *
 * When REDIS_URL is set and the connection is healthy, all state (circuit
 * breakers, concurrency counters, rate-limit windows) is stored in Redis so
 * every API instance sees a single consistent view.
 *
 * When Redis is absent or momentarily unreachable, every operation degrades to
 * an in-memory fallback so local dev and single-instance deployments continue
 * to work without any configuration change. Degradation never hard-fails a
 * user request.
 */

import Redis from "ioredis";

let redis: Redis | null = null;
let redisAvailable = false;
let connectionAttempted = false;

function buildClient(): Redis | null {
  const url = process.env["REDIS_URL"];
  if (!url) {
    return null;
  }
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 0,
    retryStrategy: (times: number) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  client.on("connect", () => {
    redisAvailable = true;
    console.log("[Redis] Connected to shared store");
  });
  client.on("error", (err: Error) => {
    if (redisAvailable) {
      console.warn("[Redis] Connection lost — degrading to in-memory fallback:", err.message);
    }
    redisAvailable = false;
  });
  client.on("close", () => {
    redisAvailable = false;
  });
  client.on("reconnecting", () => {
    console.log("[Redis] Reconnecting to shared store...");
  });

  return client;
}

export async function initRedis(): Promise<void> {
  if (connectionAttempted) return;
  connectionAttempted = true;

  const url = process.env["REDIS_URL"];
  if (!url) {
    console.log("[Redis] REDIS_URL not set — using in-memory fallback (single-instance mode)");
    return;
  }

  redis = buildClient();
  if (!redis) return;

  try {
    await redis.connect();
    await redis.ping();
    redisAvailable = true;
    console.log("[Redis] Shared store ready");
  } catch (err) {
    console.warn("[Redis] Could not connect on startup — degrading to in-memory fallback:", (err as Error).message);
    redisAvailable = false;
  }
}

export function getRedisClient(): Redis | null {
  return redisAvailable ? redis : null;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Execute a Redis command with automatic fallback on failure.
 *
 * A transient command error (timeout, script error, WRONGTYPE, etc.) does NOT
 * mark Redis unavailable — the socket is still healthy and the next command
 * should succeed. Only socket-level events (error, close) transition
 * `redisAvailable` to false.  This keeps Redis in use after brief blips
 * instead of permanently falling back to in-memory state until process restart.
 */
export async function withRedis<T>(
  fn: (client: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  const client = getRedisClient();
  if (!client) return fallback;
  try {
    return await fn(client);
  } catch (err) {
    // Log but do NOT set redisAvailable = false. Command failures are transient;
    // connection failures are already handled by socket event listeners.
    console.warn("[Redis] Command failed (fallback used):", (err as Error).message);
    return fallback;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
    redis = null;
    redisAvailable = false;
  }
}
