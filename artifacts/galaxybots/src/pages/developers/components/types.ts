export interface DevKey {
  id: number;
  label: string;
  keyPrefix: string;
  scopes: string[];
  tier: string;
  rateLimit: number;
  status: string;
  totalCalls: number;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface WebhookEvent {
  eventType: string;
  description: string;
  payload: object;
}

export interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  description: string;
  breaking: boolean;
  changes: string[];
  publishedAt: string;
}

export interface UsageData {
  keyId: number;
  label: string;
  totalCalls: number;
  rateLimit: number;
  rateLimitRemaining: number;
  lastUsedAt: string | null;
  usageByEndpoint: {
    endpoint: string;
    method: string;
    callCount: number;
    avgLatencyMs: number;
    errorCount: number;
    totalTokens: number;
  }[];
  usageOverTime: {
    date: string;
    callCount: number;
    errorCount: number;
    totalTokens: number;
  }[];
}

export interface ParsedEndpoint {
  path: string;
  methods: {
    method: string;
    summary: string;
    operationId: string;
    tags: string[];
    parameters: string[];
    requestBodyExample: string | null;
    responses: { status: string; description: string }[];
  }[];
}

export interface McpStats {
  toolCallVolume: { toolName: string; callCount: number; errorCount: number; avgLatencyMs: number; errorRate: number }[];
  dailyVolume: { date: string; callCount: number; errorCount: number }[];
  oauthClients: { id: number; clientId: string; clientName: string; allowedScopes: string[]; createdAt: string }[];
  totalCallsLast7Days: number;
}

export interface McpSession {
  sessionId: string;
  clientName: string;
  connectedAt: string;
  toolCallCount: number;
  callerType: string;
  oauthClientId: string | null;
}

export interface McpSessionsData {
  sessions: McpSession[];
  count: number;
}
