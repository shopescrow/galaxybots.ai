import jwt from "jsonwebtoken";

const API_BASE = `http://localhost:${process.env.API_PORT || "8080"}/api/v1`;

function getServiceToken(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required for internal API calls");
  }
  return jwt.sign(
    {
      userId: 0,
      clientId: 1,
      role: "admin",
      email: "mcp-service@galaxybots.ai",
      bypassPayment: true,
    },
    secret,
    { expiresIn: "1h" }
  );
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[MCP:API] GET ${url}`);
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${getServiceToken()}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE}${path}`;
  console.log(`[MCP:API] POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getServiceToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface StreamEvent {
  type: string;
  content?: string;
  [key: string]: unknown;
}

export async function apiPostStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void | Promise<void>
): Promise<string> {
  const url = `${API_BASE}${path}`;
  console.log(`[MCP:API] POST (stream) ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${getServiceToken()}`,
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API POST ${path} failed (${res.status}): ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const event = JSON.parse(raw) as StreamEvent;
        if (event.type === "done" && typeof event.content === "string") {
          finalContent = event.content;
        }
        await onEvent(event);
      } catch {
      }
    }
  }

  return finalContent;
}

const EXPECTED_API_ENDPOINTS = [
  { method: "GET", path: "/bots", label: "Bots listing" },
  { method: "GET", path: "/conversations", label: "Conversations" },
  { method: "GET", path: "/task-sessions", label: "Task sessions listing" },
  { method: "POST", path: "/task-sessions/analyze", label: "Task analysis" },
  { method: "POST", path: "/integrations/piratemonster/recommend", label: "PirateMonster recommendations" },
  { method: "GET", path: "/analytics/overview", label: "Analytics overview" },
  { method: "GET", path: "/compliance/platform", label: "Compliance platform status" },
];

export async function runStartupHealthCheck(): Promise<void> {
  console.log("[MCP:HealthCheck] Validating GalaxyBots API endpoints...");
  const results: { path: string; label: string; ok: boolean; status?: number; error?: string }[] = [];

  for (const endpoint of EXPECTED_API_ENDPOINTS) {
    const url = `${API_BASE}${endpoint.path}`;
    try {
      const res = await fetch(url, {
        method: endpoint.method === "POST" ? "POST" : "HEAD",
        headers: {
          "Authorization": `Bearer ${getServiceToken()}`,
          "Content-Type": "application/json",
        },
        body: endpoint.method === "POST" ? JSON.stringify({}) : undefined,
        signal: AbortSignal.timeout(5000),
      });
      const reachable = res.status !== 404 && res.status !== 502 && res.status !== 503;
      results.push({ path: endpoint.path, label: endpoint.label, ok: reachable, status: res.status });
    } catch (err) {
      results.push({
        path: endpoint.path,
        label: endpoint.label,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const unreachable = results.filter(r => !r.ok);
  if (unreachable.length === 0) {
    console.log(`[MCP:HealthCheck] All ${results.length} API endpoints reachable`);
  } else {
    for (const r of unreachable) {
      const detail = r.status ? `status=${r.status}` : `error=${r.error}`;
      console.warn(`[MCP:HealthCheck] UNREACHABLE: ${r.label} (${r.path}) — ${detail}`);
    }
    console.warn(`[MCP:HealthCheck] ${unreachable.length}/${results.length} endpoints unreachable — MCP tool calls to these routes will fail`);
  }
}
