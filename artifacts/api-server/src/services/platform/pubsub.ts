/**
 * Redis pub/sub event bus for SSE horizontal scaling.
 *
 * Channels are namespaced:
 *   sse:tenant:{clientId}  — events scoped to a single tenant
 *   sse:platform           — platform-wide events (broadcast to all nodes)
 *
 * A single dedicated subscriber Redis connection is shared across the process.
 * Publishing uses the shared store client from redis-store.ts.
 *
 * Graceful degradation: if Redis is unavailable, publish() is a no-op and
 * subscribe() is a no-op — callers fall back to the local in-memory registry.
 */

import Redis from "ioredis";

let subscriber: Redis | null = null;
let subscriberAvailable = false;

const handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
const refCounts = new Map<string, number>();

function buildSubscriberClient(): Redis | null {
  const url = process.env["REDIS_URL"];
  if (!url) return null;

  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 0,
    retryStrategy: (times: number) => {
      if (times > 10) return null;
      return Math.min(times * 300, 3000);
    },
  });

  client.on("connect", () => {
    subscriberAvailable = true;
    console.log("[pubsub] Subscriber connected");
  });
  client.on("error", (err: Error) => {
    if (subscriberAvailable) {
      console.warn("[pubsub] Subscriber connection lost:", err.message);
    }
    subscriberAvailable = false;
  });
  client.on("close", () => {
    subscriberAvailable = false;
  });
  client.on("reconnecting", () => {
    console.log("[pubsub] Subscriber reconnecting...");
  });

  client.on("message", (channel: string, message: string) => {
    const channelHandlers = handlers.get(channel);
    if (!channelHandlers) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      console.warn("[pubsub] Failed to parse message on channel", channel);
      return;
    }
    for (const handler of channelHandlers) {
      try {
        handler(parsed);
      } catch (err) {
        console.error("[pubsub] Handler error on channel", channel, (err as Error).message);
      }
    }
  });

  return client;
}

export async function initPubSub(): Promise<void> {
  const url = process.env["REDIS_URL"];
  if (!url) {
    console.log("[pubsub] REDIS_URL not set — SSE pub/sub disabled (single-instance mode)");
    return;
  }

  subscriber = buildSubscriberClient();
  if (!subscriber) return;

  try {
    await subscriber.connect();
    await subscriber.ping();
    subscriberAvailable = true;
    console.log("[pubsub] Subscriber ready");
  } catch (err) {
    console.warn("[pubsub] Could not connect subscriber on startup — degrading to single-instance:", (err as Error).message);
    subscriberAvailable = false;
  }
}

export async function closePubSub(): Promise<void> {
  if (subscriber) {
    try {
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
    subscriber = null;
    subscriberAvailable = false;
  }
}

export function isPubSubAvailable(): boolean {
  return subscriberAvailable;
}

/**
 * Subscribe this node to a channel. When a message arrives on the channel,
 * the handler is called. Returns an unsubscribe function.
 */
export function subscribeChannel(
  channel: string,
  handler: (data: Record<string, unknown>) => void,
): () => void {
  if (!subscriberAvailable || !subscriber) {
    return () => {};
  }

  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
  }
  handlers.get(channel)!.add(handler);

  const count = (refCounts.get(channel) ?? 0) + 1;
  refCounts.set(channel, count);

  if (count === 1) {
    subscriber.subscribe(channel).catch((err: Error) => {
      console.error("[pubsub] Failed to subscribe to channel", channel, err.message);
    });
  }

  return () => {
    const set = handlers.get(channel);
    if (set) {
      set.delete(handler);
      if (set.size === 0) handlers.delete(channel);
    }
    const remaining = (refCounts.get(channel) ?? 1) - 1;
    if (remaining <= 0) {
      refCounts.delete(channel);
      if (subscriber && subscriberAvailable) {
        subscriber.unsubscribe(channel).catch((err: Error) => {
          console.error("[pubsub] Failed to unsubscribe from channel", channel, err.message);
        });
      }
    } else {
      refCounts.set(channel, remaining);
    }
  };
}

/**
 * Publish an event to a channel. All nodes subscribed to that channel will
 * receive it and forward to their local SSE clients.
 */
export async function publishToChannel(
  channel: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!subscriberAvailable) return;

  const { getRedisClient } = await import("../scaling/redis-store.js");
  const client = getRedisClient();
  if (!client) return;

  const message = JSON.stringify({ event, data });
  try {
    await client.publish(channel, message);
  } catch (err) {
    console.warn("[pubsub] Publish failed on channel", channel, (err as Error).message);
  }
}

export function tenantChannel(clientId: number): string {
  return `sse:tenant:${clientId}`;
}

export const PLATFORM_CHANNEL = "sse:platform";
