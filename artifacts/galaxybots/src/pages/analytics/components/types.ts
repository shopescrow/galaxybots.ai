export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 270 50% 60%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 12 76% 61%))",
  "#6366f1",
  "#f59e0b",
  "#10b981",
];

export const HEALTH_COLORS = {
  healthy: "#22c55e",
  at_risk: "#eab308",
  critical: "#ef4444",
  unknown: "#6b7280",
};

export interface SpendData {
  totalSpend: number;
  monthlySpend: number;
  spendByModel: {
    model: string;
    totalCost: number;
    promptTokens: number;
    completionTokens: number;
    callCount: number;
    avgLatencyMs: number;
  }[];
  spendOverTime: { date: string; totalCost: number; totalTokens: number; callCount: number }[];
  spendByBot: { botId: number; totalCost: number; callCount: number }[];
}

export interface TokenData {
  tokensByModel: { model: string; promptTokens: number; completionTokens: number; total: number }[];
  tokensOverTime: { date: string; promptTokens: number; completionTokens: number }[];
}

export interface ToolData {
  toolFrequency: { toolName: string; callCount: number }[];
  heatmap: Record<string, unknown>[];
}

export interface OverviewData {
  totalSpend: number;
  monthlySpend: number;
  totalCalls: number;
  totalTokens: number;
  avgLatencyMs: number;
  totalToolCalls: number;
  costCap: {
    withinBudget: boolean;
    spend: number;
    cap: number;
    pctUsed: number;
  };
}

export interface CostCapData {
  cap: { monthlyCapUsd: number; alertAt80Pct: boolean; pauseAutonomousOnExhaust: boolean } | null;
  currentMonthlySpend: number;
}

export interface PipelineData {
  byStatus: { status: string; count: number }[];
}

export interface SchedulerData {
  byStatus: { status: string; count: number }[];
}

export interface HealthAnalyticsData {
  distribution: { healthy: number; at_risk: number; critical: number; unknown: number };
  averageScore: number;
  totalClients: number;
  trendOverTime: {
    date: string;
    avgScore: number;
    healthyCount: number;
    atRiskCount: number;
    criticalCount: number;
  }[];
  activityCorrelation?: {
    tag: string;
    avgScore: number;
    avgSessions: number;
    avgPipelines: number;
    avgEvents: number;
  }[];
  clients: {
    clientId: number;
    companyName: string;
    score: number | null;
    tag: string;
    trend: string;
    recommendedAction: string | null;
  }[];
}

export interface ScalingTelemetryData {
  windowDays: number;
  totals: {
    runs: number;
    totalMarginUsd: number;
    avgMarginUsd: number;
    totalCostUsd: number;
    totalRevenueUsd: number;
    avgFidelity: number | null;
    totalTokensSaved: number;
    marginPositiveRate: number;
  };
  byCategory: {
    taskCategory: string;
    fleetSize: number;
    runs: number;
    avgMarginUsd: number;
    totalMarginUsd: number;
    avgCostUsd: number;
    avgRevenueUsd: number;
    avgFidelity: number | null;
    totalTokensSaved: number;
    avgCacheHitRate: number | null;
    avgRetrievalHitRate: number | null;
  }[];
  marginTrend: { date: string; avgMarginUsd: number; runs: number; avgFidelity: number | null }[];
  recentRuns: {
    id: number;
    createdAt: string;
    taskCategory: string;
    strategy: string | null;
    fleetSize: number;
    modelTier: string | null;
    marginUsd: number;
    projectedCostUsd: number;
    creditRevenueUsd: number;
    fidelityScore: number | null;
    tokensSaved: number;
  }[];
  alerts: {
    type: "margin_regression" | "fidelity_regression";
    taskCategory: string;
    fleetSize: number;
    value: number;
    threshold: number;
    message: string;
  }[];
}

export interface VoiceAnalyticsData {
  totalCalls: number;
  avgDurationSeconds: number;
  callVolumeOverTime: { date: string; count: number; avgDuration: number }[];
  urgencyDistribution: { urgency: number | null; count: number }[];
  topIntents: { intent: string | null; count: number }[];
  leadConversionRate: number;
  newProspects: number;
  pipelinesTriggered: number;
}
