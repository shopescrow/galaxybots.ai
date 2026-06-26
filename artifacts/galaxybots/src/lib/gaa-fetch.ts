// Minimal fetch helper for the Galaxy Autonomous Agent (GAA) endpoints.
// GAA routes are served by the api-server and are not part of the generated
// OpenAPI client, so we call them directly with the stored bearer token.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_PREFIX = `${BASE}/api/gaa`;

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

export async function gaaGet<T>(
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

export async function gaaPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function gaaPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

// ---- Shared types ---------------------------------------------------------
export interface GaaGoal {
  id: number;
  title: string;
  description: string | null;
  mode: string;
  temporalTier: string;
  status: string;
  priority: number;
  purpose: string | null;
  clientId: number | null;
  costEnvelopeCents: number;
  spentCents: number;
  reversibilityScore: number | null;
  riskScore: number | null;
  readinessScore: number | null;
  progressScore: number;
  blockedReason: string | null;
  deadLetterReason: string | null;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GaaJournalEntry {
  id: number;
  goalId: number | null;
  phase: string;
  eventType: string;
  decision: string | null;
  detail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface GaaEscalation {
  id: number;
  goalId: number | null;
  reason: string;
  severity: string;
  status: string;
  recommendedAction: string | null;
  resolution: string | null;
  createdAt: string;
}

export interface GaaConstitutionPrinciple {
  id: number;
  ordinal: number;
  principle: string;
  category: string;
  rationale: string | null;
  severity: string;
  isActive: boolean;
}

export interface GaaOverview {
  totalGoals: number;
  byStatus: Record<string, number>;
  byMode: Record<string, number>;
  openEscalations: number;
  constitutionPrinciples: number;
}

export interface GaaCycleSummary {
  processed: number;
  executed: number;
  escalated: number;
  blocked: number;
  completed: number;
}

// ---- Self-actualization engine -------------------------------------------
export interface SelfActSnapshot {
  avgCompetence: number;
  avgConfidence: number;
  avgTrend: number;
  reflections: number;
  practiceRuns: number;
  practiceAdopted: number;
  practiceGainAvg: number;
  transfers: number;
  transfersApplied: number;
  modsProposed: number;
  modsPromoted: number;
  modsRolledBack: number;
  blockedPromotions: number;
  killSwitchActive: boolean;
}

export interface SelfActOverview {
  snapshot: SelfActSnapshot;
  killSwitch: boolean;
}

export interface BotCapability {
  id: number;
  botId: number;
  clientId: number | null;
  taskCategory: string;
  competence: number;
  confidence: number;
  trend: number;
  sampleCount: number;
  strengthTier: string;
  lastQuality: number | null;
  lastUpdated: string;
}

export interface BotReflectionRow {
  id: number;
  botId: number;
  taskCategory: string | null;
  failureCategory: string | null;
  rootCauseType: string;
  rootCause: string;
  durableLesson: string;
  preventionRule: string | null;
  confidence: number;
  createdAt: string;
}

export interface PracticeRunRow {
  id: number;
  botId: number;
  taskCategory: string;
  practiceTask: string;
  source: string;
  baselineScore: number;
  practiceScore: number;
  improvement: number;
  costCents: number;
  passedFidelity: boolean;
  adopted: boolean;
  createdAt: string;
}

export interface KnowledgeTransferRow {
  id: number;
  sourceBotId: number | null;
  targetBotId: number;
  taskCategory: string | null;
  lessonText: string;
  distilledBelief: string;
  transferType: string;
  confidence: number;
  status: string;
  conflictResolution: string | null;
  createdAt: string;
}

export interface SelfModificationRow {
  id: number;
  botId: number | null;
  modType: string;
  title: string;
  rationale: string;
  riskLevel: string;
  humanGated: boolean;
  status: string;
  governanceDecision: string | null;
  proposedBy: string;
  reviewedBy: string | null;
  createdAt: string;
}

export interface SelfActMetricRow {
  id: number;
  periodStart: string;
  periodEnd: string;
  scope: string;
  avgCompetence: number;
  avgConfidence: number;
  avgTrend: number;
  reflections: number;
  practiceRuns: number;
  practiceAdopted: number;
  transfers: number;
  transfersApplied: number;
  modsProposed: number;
  modsPromoted: number;
  modsRolledBack: number;
  blockedPromotions: number;
  killSwitchActive: boolean;
  createdAt: string;
}
