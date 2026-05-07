export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type ActivityItem = {
  id: number;
  type: string;
  clientId: number | null;
  action: string;
  resource: string | null;
  botName: string | null;
  metadata: unknown;
  createdAt: string;
};

export type Approval = {
  id: number;
  clientId: number;
  botId: number;
  botName: string | null;
  toolName: string;
  toolInput: unknown;
  status: string;
  createdAt: string;
  slaDeadline?: string | null;
  escalatedAt?: string | null;
  isTimeSensitive?: boolean;
};

export type Alert = {
  id: number;
  assignmentId: number;
  botId: number;
  botName: string;
  clientId: number | null;
  summary: string;
  runStatus: string;
  createdAt: string;
};

export type CompanyCard = {
  id: number;
  companyName: string;
  status: string;
  plan: string;
  activeSessions: number;
  lastBotAction: string | null;
  lastToolName: string | null;
  nextScheduledRun: string | null;
  nextRunObjective: string | null;
  healthScore: number | null;
  healthTag: string | null;
  healthTrend: string | null;
};

export type UnifiedActivityEvent = {
  id: string;
  timestamp: string;
  source: string;
  eventType: string;
  description: string;
  clientId: number | null;
  clientName?: string;
  severity: "info" | "warning" | "critical";
  link?: string;
  metadata?: unknown;
};

export type SlaBot = {
  botId: number;
  botName: string;
  total: number;
  breached: number;
  complianceRate: number;
  status: "green" | "yellow" | "red";
};

export type SlaOverviewData = {
  overallComplianceRate: number;
  totalEvents: number;
  totalBreached: number;
  bots: SlaBot[];
};

export type SlaConfig = {
  defaultSlaMinutes: number;
  timeSensitiveSlaMinutes: number;
  secondaryApproverEmail: string | null;
  trustedCategories: string[];
};
