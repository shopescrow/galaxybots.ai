export const MAX_SSE_CLIENTS = 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;

let sseClients: Array<{ id: string; clientId: number; res: import("express").Response }> = [];
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// TODO: This SSE client registry is single-instance only. For horizontal scaling
// across multiple server instances, implement Redis pub/sub to broadcast events
// to all connected instances. Each instance would subscribe to a Redis channel
// and forward events to its local SSE clients.

export function getSSEClientCount(): number {
  return sseClients.length;
}

export function addSSEClient(id: string, res: import("express").Response, clientId: number): boolean {
  if (sseClients.length >= MAX_SSE_CLIENTS) {
    return false;
  }

  sseClients.push({ id, clientId, res });
  res.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== id);
  });

  if (!heartbeatTimer) {
    startHeartbeat();
  }

  return true;
}

export function broadcastSSE(event: string, data: Record<string, unknown>) {
  const targetClientId = data.clientId as number | undefined;
  if (!targetClientId) {
    return;
  }
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (client.clientId !== targetClientId) continue;
    try {
      client.res.write(payload);
    } catch (_e) {}
  }
}

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    const deadClients: string[] = [];

    for (const client of sseClients) {
      try {
        if (client.res.closed || client.res.writableEnded) {
          deadClients.push(client.id);
          continue;
        }
        client.res.write(`:heartbeat\n\n`);
      } catch (_e) {
        deadClients.push(client.id);
      }
    }

    if (deadClients.length > 0) {
      sseClients = sseClients.filter((c) => !deadClients.includes(c.id));
      console.log(`[sse] Pruned ${deadClients.length} zombie connection(s), ${sseClients.length} remaining`);
    }

    if (sseClients.length === 0) {
      stopHeartbeat();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function closeAllSSEClients() {
  for (const client of sseClients) {
    try {
      client.res.end();
    } catch (_e) {}
  }
  sseClients = [];
  stopHeartbeat();
}
