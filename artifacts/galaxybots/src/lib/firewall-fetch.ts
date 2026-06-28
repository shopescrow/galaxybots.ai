// Fetch helper for the Compliance & IP firewall endpoints. These routes are
// served by the api-server and are not part of the generated OpenAPI client, so
// we call them directly with the stored bearer token.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_PREFIX = `${BASE}/api/firewall`;

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

export async function firewallGet<T>(
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

export async function firewallPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function firewallPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "PUT",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function firewallDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handle<T>(res);
}

// ---- Shared types ---------------------------------------------------------
export type FirewallDecision = "pass" | "flag" | "block";
export type ReviewStatus =
  | "not_required"
  | "pending_review"
  | "approved"
  | "rejected"
  | "blocked";

export interface CheckResultItem {
  name: string;
  category: "policy" | "originality" | "trademark" | "disclosure";
  status: FirewallDecision;
  reason: string;
  detail?: Record<string, unknown>;
}

export interface ComplianceCheck {
  id: number;
  assetId: number;
  assetTitle?: string | null;
  assetStatus?: string | null;
  targetPlatform: string | null;
  decision: FirewallDecision;
  reviewStatus: ReviewStatus;
  checks: CheckResultItem[] | null;
  reasons: string[] | null;
  similarityScore: string | null;
  matchedAssetId?: number | null;
  matchedAssetTitle: string | null;
  triggeredBy?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
}

export interface LicenseSource {
  type: string;
  name: string;
  license?: string;
  url?: string;
}

export interface LicenseRecord {
  id: number;
  assetId: number;
  clientId: number;
  aiGenerated: boolean;
  sourcesUsed: LicenseSource[] | null;
  usageRights: string | null;
  disclosureState: string;
  disclosureText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyConfig {
  id: number;
  clientId: number;
  platform: string;
  strictness: string;
  aiContentAllowed: boolean;
  disclosureRequired: boolean;
  similarityThreshold: string;
  prohibitedKeywords: string[] | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GateResult {
  checkId: number;
  decision: FirewallDecision;
  reasons: string[];
  checks: CheckResultItem[];
  similarityScore?: number | null;
  matchedAssetTitle?: string | null;
}

export const POLICY_STRICTNESS_OPTIONS = ["lenient", "standard", "strict"] as const;
export const DISCLOSURE_STATE_OPTIONS = [
  "not_required",
  "required",
  "tagged",
] as const;
