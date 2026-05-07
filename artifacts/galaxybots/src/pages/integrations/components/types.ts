export const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/\//g, "/");

export interface Integration {
  id: number;
  clientId: number;
  service: string;
  credential: string;
  status: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpKey {
  id: number;
  label: string | null;
  status: string;
  rateLimit: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface McpStats {
  toolCallStats: Array<{ toolName: string; count: number; cachedCount: number }>;
  totalCalls: number;
  cacheHitRate: number;
  activeWebhookCount: number;
  pendingScanCount: number;
}

export interface AuditEvent {
  id: number;
  action: string;
  createdAt: string;
}

export interface ProspectorStats {
  dispatched: number;
  received: number;
  lastWebhook: string | null;
  avgConfidence: number;
}
