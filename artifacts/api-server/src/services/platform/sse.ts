let sseClients: Array<{ id: string; clientId: number; res: import("express").Response }> = [];

export function addSSEClient(id: string, res: import("express").Response, clientId: number) {
  sseClients.push({ id, clientId, res });
  res.on("close", () => {
    sseClients = sseClients.filter((c) => c.id !== id);
  });
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
