/**
 * Moltbook API client (Task #207, Phase 1 — step 2).
 *
 * A thin, PURE HTTP client for the Moltbook v1 API
 * (https://www.moltbook.com/api/v1). It has NO database coupling: callers pass
 * the (decrypted) api_key for the calling agent. This keeps the client buildable
 * and testable in isolation; persistence, eligibility, governance, sanitization
 * and the approval queue are layered on by the governed tools (step 4+).
 *
 * Discipline enforced here:
 *  - The Moltbook host is ALWAYS `www.moltbook.com`. Any request that resolves
 *    to a different host is refused (the api_key is the agent's identity secret
 *    and must only ever be sent to Moltbook).
 *  - The `Authorization` header carrying the api_key is attached ONLY to
 *    Moltbook requests (the host check above guarantees this).
 *  - The api_key is NEVER logged.
 *  - Repeated transport/5xx failures trip a shared circuit breaker (reusing the
 *    agent-core circuit-breaker), and auth failures surface a `needsReauth`
 *    signal so DB-aware callers can mark the credential for re-authorization
 *    (mirroring the credential-retry/needs-reauth pattern in `_shared.ts`).
 */

import {
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
} from "../../agent-core/circuit-breaker";

export const MOLTBOOK_HOST = "www.moltbook.com";
export const MOLTBOOK_API_BASE = `https://${MOLTBOOK_HOST}/api/v1`;

const CIRCUIT_KEY = "moltbook";
const REQUEST_TIMEOUT_MS = 10_000;

/** Discriminated result returned by every client function. */
export type MoltbookResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      /** HTTP status code, when a response was received. */
      status?: number;
      /** Set when the api_key is rejected (401/403) — caller should re-auth. */
      needsReauth?: boolean;
      /** Set when the request was short-circuited by the open circuit breaker. */
      circuitOpen?: boolean;
    };

// ---------------------------------------------------------------------------
// Request/response types
// ---------------------------------------------------------------------------

export interface MoltbookRegisterRequest {
  /** Unique agent handle/name on Moltbook. */
  agentName: string;
  /** Human-friendly display name (optional). */
  displayName?: string;
  /** Short agent bio (optional). */
  bio?: string;
  /** X/Twitter handle used for the claim verification tweet (optional). */
  xHandle?: string;
}

export interface MoltbookRegisterResponse {
  agentId: string;
  /** The agent's secret api_key — store encrypted, never log. */
  apiKey: string;
  /** URL the owner visits to complete the human claim. */
  claimUrl: string;
  /** Code to include in the X verification tweet. */
  verificationCode: string;
  /** e.g. "pending" until claimed, then "active". */
  status: string;
}

export interface MoltbookFeedItem {
  id: string;
  submolt?: string;
  authorAgent?: string;
  authorHandle?: string;
  title?: string;
  body?: string;
  url?: string;
  score?: number;
  commentCount?: number;
  createdAt?: string;
}

export interface MoltbookFeedResponse {
  items: MoltbookFeedItem[];
  nextCursor?: string;
}

export interface MoltbookGetFeedRequest {
  /** Limit to a specific submolt (optional). */
  submolt?: string;
  /** Page size (optional). */
  limit?: number;
  /** Opaque pagination cursor from a previous response (optional). */
  cursor?: string;
}

export interface MoltbookCreatePostRequest {
  submolt: string;
  title: string;
  body: string;
}

export interface MoltbookPostResponse {
  id: string;
  url?: string;
  submolt?: string;
}

export interface MoltbookCommentRequest {
  /** The post/thread being commented on. */
  postId: string;
  /** Reply to a specific comment within the thread (optional). */
  parentCommentId?: string;
  body: string;
}

export interface MoltbookCommentResponse {
  id: string;
  url?: string;
  postId?: string;
}

export type MoltbookVoteTarget = "post" | "comment";

export interface MoltbookUpvoteRequest {
  targetType: MoltbookVoteTarget;
  targetId: string;
}

export interface MoltbookUpvoteResponse {
  targetType: MoltbookVoteTarget;
  targetId: string;
  score?: number;
}

export interface MoltbookCreateSubmoltRequest {
  /** URL-safe submolt name (e.g. "ai-agents"). */
  name: string;
  /** Display title (optional). */
  title?: string;
  description?: string;
}

export interface MoltbookSubmoltResponse {
  id: string;
  name: string;
  url?: string;
}

export interface MoltbookJoinSubmoltRequest {
  name: string;
}

export interface MoltbookJoinSubmoltResponse {
  name: string;
  joined: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MoltbookRequestOptions {
  method?: "GET" | "POST";
  /** Path under the v1 base (e.g. "/feed"). */
  path: string;
  /** Decrypted api_key. Attached as a Bearer token only when provided. */
  apiKey?: string | null;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

function extractErrorMessage(parsed: unknown): string | undefined {
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["error", "message", "detail", "error_description"]) {
      const val = obj[key];
      if (typeof val === "string" && val.trim()) return val.trim().slice(0, 500);
    }
  }
  if (typeof parsed === "string" && parsed.trim()) return parsed.trim().slice(0, 500);
  return undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

async function moltbookRequest<T>(opts: MoltbookRequestOptions): Promise<MoltbookResult<T>> {
  if (isCircuitOpen(CIRCUIT_KEY)) {
    return {
      success: false,
      error: "Moltbook is temporarily unavailable (circuit breaker open after repeated failures).",
      circuitOpen: true,
    };
  }

  let url: URL;
  try {
    url = new URL(`${MOLTBOOK_API_BASE}${opts.path}`);
  } catch {
    return { success: false, error: `Invalid Moltbook request path: ${opts.path}` };
  }

  // Secret discipline: never send the api_key anywhere but the Moltbook host.
  if (url.hostname !== MOLTBOOK_HOST) {
    return {
      success: false,
      error: `Refusing Moltbook request to non-Moltbook host "${url.hostname}". The Moltbook api_key may only be sent to ${MOLTBOOK_HOST}.`,
    };
  }

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  if (bodyStr !== undefined) headers["Content-Type"] = "application/json";
  // Auth header is attached only here — and only to the verified Moltbook host.
  if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? (bodyStr !== undefined ? "POST" : "GET"),
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Transport-level failure (network/timeout): counts toward the circuit.
    recordCircuitFailure(CIRCUIT_KEY);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Moltbook] request to ${opts.path} failed: ${msg}`);
    return { success: false, error: `Moltbook request failed: ${msg}` };
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  // Auth failures: the server is reachable (don't trip the circuit) but the
  // api_key is bad/expired/revoked — signal needsReauth like _shared.ts does.
  if (response.status === 401 || response.status === 403) {
    recordCircuitSuccess(CIRCUIT_KEY);
    return {
      success: false,
      error:
        extractErrorMessage(parsed) ??
        `Moltbook authentication failed (HTTP ${response.status}). The agent's credentials may need re-authorization.`,
      status: response.status,
      needsReauth: true,
    };
  }

  if (response.status >= 500) {
    recordCircuitFailure(CIRCUIT_KEY);
    return {
      success: false,
      error: extractErrorMessage(parsed) ?? `Moltbook server error (HTTP ${response.status}).`,
      status: response.status,
    };
  }

  if (!response.ok) {
    // Other 4xx: reachable + a client error; reset the failure streak.
    recordCircuitSuccess(CIRCUIT_KEY);
    return {
      success: false,
      error: extractErrorMessage(parsed) ?? `Moltbook request failed (HTTP ${response.status}).`,
      status: response.status,
    };
  }

  recordCircuitSuccess(CIRCUIT_KEY);
  return { success: true, data: parsed as T };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a new agent identity on Moltbook. Registration is unauthenticated;
 * the response carries the secret api_key plus the human-claim materials.
 */
export async function registerAgent(
  req: MoltbookRegisterRequest,
): Promise<MoltbookResult<MoltbookRegisterResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: "/agents/register",
    body: {
      agent_name: req.agentName,
      display_name: req.displayName,
      bio: req.bio,
      x_handle: req.xHandle,
    },
  });
  if (!result.success) return result;

  const d = result.data;
  const apiKey = asString(pick(d, "api_key", "apiKey", "key"));
  if (!apiKey) {
    return { success: false, error: "Moltbook registration response did not include an api_key." };
  }
  return {
    success: true,
    data: {
      agentId: asString(pick(d, "agent_id", "agentId", "id")) ?? "",
      apiKey,
      claimUrl: asString(pick(d, "claim_url", "claimUrl")) ?? "",
      verificationCode: asString(pick(d, "verification_code", "verificationCode", "code")) ?? "",
      status: asString(pick(d, "status")) ?? "pending",
    },
  };
}

/** Read the agent's feed (optionally scoped to a submolt). */
export async function getFeed(
  apiKey: string,
  req: MoltbookGetFeedRequest = {},
): Promise<MoltbookResult<MoltbookFeedResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "GET",
    path: "/feed",
    apiKey,
    query: { submolt: req.submolt, limit: req.limit, cursor: req.cursor },
  });
  if (!result.success) return result;

  const d = result.data;
  const rawItems = pick(d, "items", "posts", "feed", "results");
  const items: MoltbookFeedItem[] = Array.isArray(rawItems)
    ? rawItems.map((raw) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return {
          id: asString(pick(item, "id", "post_id", "postId")) ?? "",
          submolt: asString(pick(item, "submolt", "submolt_name")),
          authorAgent: asString(pick(item, "author_agent", "authorAgent", "author")),
          authorHandle: asString(pick(item, "author_handle", "authorHandle", "handle")),
          title: asString(pick(item, "title")),
          body: asString(pick(item, "body", "content", "text")),
          url: asString(pick(item, "url", "permalink")),
          score: asNumber(pick(item, "score", "upvotes", "votes")),
          commentCount: asNumber(pick(item, "comment_count", "commentCount", "comments")),
          createdAt: asString(pick(item, "created_at", "createdAt")),
        };
      })
    : [];
  return {
    success: true,
    data: {
      items,
      nextCursor: asString(pick(d, "next_cursor", "nextCursor", "cursor")),
    },
  };
}

/** Create a post in a submolt. */
export async function createPost(
  apiKey: string,
  req: MoltbookCreatePostRequest,
): Promise<MoltbookResult<MoltbookPostResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: "/posts",
    apiKey,
    body: { submolt: req.submolt, title: req.title, body: req.body },
  });
  if (!result.success) return result;

  const d = result.data;
  return {
    success: true,
    data: {
      id: asString(pick(d, "id", "post_id", "postId")) ?? "",
      url: asString(pick(d, "url", "permalink")),
      submolt: asString(pick(d, "submolt", "submolt_name")),
    },
  };
}

/** Comment on a post (optionally replying to a specific comment). */
export async function createComment(
  apiKey: string,
  req: MoltbookCommentRequest,
): Promise<MoltbookResult<MoltbookCommentResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: "/comments",
    apiKey,
    body: {
      post_id: req.postId,
      parent_comment_id: req.parentCommentId,
      body: req.body,
    },
  });
  if (!result.success) return result;

  const d = result.data;
  return {
    success: true,
    data: {
      id: asString(pick(d, "id", "comment_id", "commentId")) ?? "",
      url: asString(pick(d, "url", "permalink")),
      postId: asString(pick(d, "post_id", "postId")),
    },
  };
}

/** Upvote a post or comment. */
export async function upvote(
  apiKey: string,
  req: MoltbookUpvoteRequest,
): Promise<MoltbookResult<MoltbookUpvoteResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: "/votes",
    apiKey,
    body: { target_type: req.targetType, target_id: req.targetId, direction: "up" },
  });
  if (!result.success) return result;

  const d = result.data;
  return {
    success: true,
    data: {
      targetType: req.targetType,
      targetId: req.targetId,
      score: asNumber(pick(d, "score", "upvotes", "votes")),
    },
  };
}

/** Create a new submolt (community). */
export async function createSubmolt(
  apiKey: string,
  req: MoltbookCreateSubmoltRequest,
): Promise<MoltbookResult<MoltbookSubmoltResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: "/submolts",
    apiKey,
    body: { name: req.name, title: req.title, description: req.description },
  });
  if (!result.success) return result;

  const d = result.data;
  return {
    success: true,
    data: {
      id: asString(pick(d, "id", "submolt_id", "submoltId")) ?? "",
      name: asString(pick(d, "name", "submolt", "submolt_name")) ?? req.name,
      url: asString(pick(d, "url", "permalink")),
    },
  };
}

/** Join an existing submolt. */
export async function joinSubmolt(
  apiKey: string,
  req: MoltbookJoinSubmoltRequest,
): Promise<MoltbookResult<MoltbookJoinSubmoltResponse>> {
  const result = await moltbookRequest<Record<string, unknown>>({
    method: "POST",
    path: `/submolts/${encodeURIComponent(req.name)}/join`,
    apiKey,
  });
  if (!result.success) return result;

  const d = result.data;
  const joined = pick(d, "joined", "success", "member");
  return {
    success: true,
    data: {
      name: req.name,
      joined: typeof joined === "boolean" ? joined : true,
    },
  };
}
