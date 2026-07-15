import { db, partnerCredentialsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";

function decryptApiKey(encryptedApiKey: string, iv: string, authTag: string): string {
  const encryptionKey = process.env["WEBHOOK_SECRET_KEY"];
  if (!encryptionKey) throw new Error("WEBHOOK_SECRET_KEY not configured");
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, Buffer.from(iv, "hex"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encryptedApiKey, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptValue(value: string): { encrypted: string; iv: string; authTag: string } {
  const encryptionKey = process.env["WEBHOOK_SECRET_KEY"];
  if (!encryptionKey) throw new Error("WEBHOOK_SECRET_KEY not configured");
  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
}

async function getCredential(clientId?: number | null) {
  const conditions = clientId != null
    ? and(eq(partnerCredentialsTable.partner, "comedyclash"), eq(partnerCredentialsTable.clientId, clientId), eq(partnerCredentialsTable.status, "active"))
    : and(eq(partnerCredentialsTable.partner, "comedyclash"), eq(partnerCredentialsTable.status, "active"));

  const [cred] = await db.select().from(partnerCredentialsTable).where(conditions).limit(1);
  if (!cred) throw new Error("ComedyClash credentials not configured");

  const apiKey = decryptApiKey(cred.encryptedApiKey, cred.iv, cred.authTag);
  return { apiBaseUrl: cred.apiBaseUrl, apiKey };
}

async function ccFetch(path: string, options: RequestInit = {}, clientId?: number | null): Promise<Response> {
  const { apiBaseUrl, apiKey } = await getCredential(clientId);
  const url = `${apiBaseUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "X-Source": "galaxybots",
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

export async function generateScript(
  prompt: string,
  options: Record<string, unknown> = {},
  clientId?: number | null,
): Promise<{ jobId: string; status: string; script?: string }> {
  const res = await ccFetch("/v1/scripts/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, ...options }),
  }, clientId);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ComedyClash generateScript failed: HTTP ${res.status} — ${err}`);
  }
  return res.json() as Promise<{ jobId: string; status: string; script?: string }>;
}

export async function getContentOutput(
  jobId: string,
  clientId?: number | null,
): Promise<{ jobId: string; status: string; output?: unknown }> {
  const res = await ccFetch(`/v1/jobs/${encodeURIComponent(jobId)}`, {}, clientId);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ComedyClash getContentOutput failed: HTTP ${res.status} — ${err}`);
  }
  return res.json() as Promise<{ jobId: string; status: string; output?: unknown }>;
}

export async function callTool(
  toolSlug: string,
  params: Record<string, unknown>,
  clientId?: number | null,
): Promise<unknown> {
  const res = await ccFetch(`/v1/tools/${encodeURIComponent(toolSlug)}`, {
    method: "POST",
    body: JSON.stringify(params),
  }, clientId);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ComedyClash callTool(${toolSlug}) failed: HTTP ${res.status} — ${err}`);
  }
  return res.json();
}

export async function testConnection(clientId?: number | null): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await ccFetch("/v1/health", {}, clientId);
    return { ok: res.ok, message: res.ok ? "Connection successful" : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
