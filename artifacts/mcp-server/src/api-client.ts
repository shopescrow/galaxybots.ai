import jwt from "jsonwebtoken";

const API_BASE = `http://localhost:${process.env.API_PORT || "8080"}/api`;

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
