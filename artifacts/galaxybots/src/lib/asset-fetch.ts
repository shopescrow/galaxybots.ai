// Fetch helper for the Asset Studio endpoints. These routes are served by the
// api-server and are not part of the generated OpenAPI client, so we call them
// directly with the stored bearer token.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_PREFIX = `${BASE}/api/assets`;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("auth_token")
      : null;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function assetGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const qs = params
    ? "?" +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const res = await fetch(`${API_PREFIX}${path}${qs}`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handle<T>(res);
}

export async function assetPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function assetDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<T>(res);
}

// ---- Shared types ---------------------------------------------------------
export const ASSET_TYPE_OPTIONS = [
  "printable",
  "template",
  "ebook",
  "course",
  "micro_saas",
  "data_product",
  "video",
  "audio",
  "visual",
  "newsletter",
  "other",
] as const;

export const ASSET_STATUS_OPTIONS = [
  "idea",
  "draft",
  "in_review",
  "published",
  "tracking",
  "archived",
] as const;

export type AssetStatus = (typeof ASSET_STATUS_OPTIONS)[number];

export interface AssetStatusEvent {
  status: AssetStatus;
  changedBy: string;
  note?: string;
  at: string;
}

export interface Asset {
  id: number;
  clientId: number;
  botId: number | null;
  managerBotId: number | null;
  type: string;
  title: string;
  description: string | null;
  niche: string | null;
  status: AssetStatus;
  targetPlatform: string | null;
  revenueToDate: string;
  publishedAt: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  botName?: string | null;
}

export interface AssetFile {
  id: number;
  assetId: number;
  kind: string;
  fileName: string;
  objectPath: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface AssetListing {
  id: number;
  assetId: number;
  platform: string;
  externalUrl: string | null;
  externalId: string | null;
  listingStatus: string;
  price: string | null;
  currency: string;
  createdAt: string;
}

export interface AssetRevenueEntry {
  id: number;
  assetId: number;
  listingId: number | null;
  source: string;
  amount: string;
  currency: string;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface AssetDetail extends Asset {
  statusHistory: AssetStatusEvent[] | null;
  metadata: Record<string, unknown> | null;
  files: AssetFile[];
  listings: AssetListing[];
  revenue: AssetRevenueEntry[];
}

export interface Portfolio {
  totals: { total: number; published: number; revenue: number };
  byType: Record<string, { count: number; revenue: number }>;
  byStatus: Record<string, number>;
}
