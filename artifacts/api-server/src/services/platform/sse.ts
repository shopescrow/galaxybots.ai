import { subscribeChannel, publishToChannel, isPubSubAvailable, tenantChannel, PLATFORM_CHANNEL } from "./pubsub.js";

export const MAX_SSE_CLIENTS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface SSEClient {
  id: string;
  clientId: number;
  res: import("express").Response;
  isPlatformSubscriber: boolean;
  unsubscribeTenant: () => void;
  unsubscribePlatform: () => void;
}

let sseClients: SSEClient[] = [];
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export interface AddSSEClientOptions {
  /** When true the client will also receive platform-wide SSE events.
   *  Only set this for admin/owner roles — non-admin clients must not
   *  receive cross-tenant platform telemetry. */
  subscribeToPlatform?: boolean;
}

export function getSSEClientCount(): number {
  return sseClients.length;
}

export function addSSEClient(
  id: string,
  res: import("express").Response,
  clientId: number,
  options: AddSSEClientOptions = {},
): boolean {
  if (sseClients.length >= MAX_SSE_CLIENTS) {
    return false;
  }

  const writeLocal = (payload: string) => {
    try {
      if (!res.closed && !res.writableEnded) {
        res.write(payload);
      }
    } catch (err) {
      console.warn(`[sse] Write error for client ${id}:`, (err as Error).message);
      removeClient(id);
    }
  };

  const unsubscribeTenant = subscribeChannel(tenantChannel(clientId), ({ event, data }) => {
    writeLocal(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  const unsubscribePlatform = options.subscribeToPlatform
    ? subscribeChannel(PLATFORM_CHANNEL, ({ event, data }) => {
        writeLocal(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      })
    : () => {};

  sseClients.push({ id, clientId, res, isPlatformSubscriber: options.subscribeToPlatform === true, unsubscribeTenant, unsubscribePlatform });

  res.on("close", () => {
    removeClient(id);
  });

  if (!heartbeatTimer) {
    startHeartbeat();
  }

  return true;
}

function removeClient(id: string): void {
  const idx = sseClients.findIndex((c) => c.id === id);
  if (idx === -1) return;
  const [client] = sseClients.splice(idx, 1);
  try { client.unsubscribeTenant(); } catch (err) { console.warn(`[sse] Unsubscribe tenant error for ${id}:`, (err as Error).message); }
  try { client.unsubscribePlatform(); } catch (err) { console.warn(`[sse] Unsubscribe platform error for ${id}:`, (err as Error).message); }
  if (sseClients.length === 0) stopHeartbeat();
}

/**
 * Broadcast a tenant-scoped event. Only SSE clients belonging to the tenant
 * identified by data.clientId will receive it.
 */
export function broadcastSSE(event: string, data: Record<string, unknown>): void {
  const targetClientId = data.clientId as number | undefined;
  if (!targetClientId) {
    return;
  }

  if (isPubSubAvailable()) {
    publishToChannel(tenantChannel(targetClientId), event, data).catch((err) => {
      console.error("[sse] Redis publish failed for tenant event:", (err as Error).message);
      deliverLocalTenant(event, data, targetClientId);
    });
  } else {
    deliverLocalTenant(event, data, targetClientId);
  }
}

/**
 * Broadcast a platform-wide event to all SSE clients that opted in with
 * subscribeToPlatform (i.e. admin/owner clients).
 * Non-admin clients are never subscribed to the platform channel, so this
 * never leaks cross-tenant platform telemetry to regular users.
 */
export function broadcastSSEToAll(event: string, data: Record<string, unknown>): void {
  if (isPubSubAvailable()) {
    publishToChannel(PLATFORM_CHANNEL, event, data).catch((err) => {
      console.error("[sse] Redis publish failed for platform event:", (err as Error).message);
      deliverLocalAdmins(event, data);
    });
  } else {
    deliverLocalAdmins(event, data);
  }
}

function deliverLocalTenant(event: string, data: Record<string, unknown>, clientId: number): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of [...sseClients]) {
    if (client.clientId !== clientId) continue;
    try {
      if (!client.res.closed && !client.res.writableEnded) {
        client.res.write(payload);
      }
    } catch (err) {
      console.warn(`[sse] Local tenant delivery error for client ${client.id}:`, (err as Error).message);
      removeClient(client.id);
    }
  }
}

/**
 * Local fallback delivery for platform-wide events.
 * Only delivers to clients that registered with subscribeToPlatform=true,
 * ensuring non-admin users never receive cross-tenant platform telemetry
 * even when Redis is unavailable.
 */
function deliverLocalAdmins(event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of [...sseClients]) {
    if (!client.isPlatformSubscriber) continue;
    try {
      if (!client.res.closed && !client.res.writableEnded) {
        client.res.write(payload);
      }
    } catch (err) {
      console.warn(`[sse] Local platform delivery error for client ${client.id}:`, (err as Error).message);
      removeClient(client.id);
    }
  }
}

function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    const deadClients: string[] = [];

    for (const client of sseClients) {
      try {
        if (client.res.closed || client.res.writableEnded) {
          deadClients.push(client.id);
          continue;
        }
        client.res.write(`:heartbeat\n\n`);
      } catch (err) {
        console.warn(`[sse] Heartbeat write error for client ${client.id}:`, (err as Error).message);
        deadClients.push(client.id);
      }
    }

    if (deadClients.length > 0) {
      for (const id of deadClients) removeClient(id);
      console.log(`[sse] Pruned ${deadClients.length} zombie connection(s), ${sseClients.length} remaining`);
    }

    if (sseClients.length === 0) {
      stopHeartbeat();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function closeAllSSEClients(): void {
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch (err) {
      console.warn(`[sse] Close error for client ${client.id}:`, (err as Error).message);
    }
    try { client.unsubscribeTenant(); } catch { /* already gone */ }
    try { client.unsubscribePlatform(); } catch { /* already gone */ }
  }
  sseClients = [];
  stopHeartbeat();
}
