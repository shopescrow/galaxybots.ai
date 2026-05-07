export interface CompanyCard {
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
}

export interface CostCapInfo {
  cap: {
    monthlyCapUsd: number;
    alertAt80Pct: boolean;
    pauseAutonomousOnExhaust: boolean;
  } | null;
  currentMonthlySpend: number;
}

export interface Approval {
  id: number;
  clientId: number;
  botId: number;
  botName: string | null;
  toolName: string;
  toolInput: unknown;
  status: string;
  conversationId: number | null;
  sessionId: number | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
  rejectionReason: string | null;
}

export interface Bot {
  id: number;
  name: string;
  title: string;
  department: string;
  category: string;
  description: string;
  responsibilities: string[];
  personality: string;
  avatar?: string | null;
  isAvailable: boolean;
}

export interface Conversation {
  id: number;
  clientId: number | null;
  botId: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: "user" | "bot" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
}

export interface ToolCallEvent {
  name: string;
  args?: unknown;
  result?: unknown;
}

export interface JournalEntry {
  id: number;
  date: string;
  title: string;
  summary: string;
  boardroomHighlights: string[];
  createdAt: string;
}

export interface RoiData {
  clientId: number;
  companyName: string;
  hourlyRate: number;
  totalSessions: number;
  totalHoursSaved: number;
  totalDollarsSaved: number;
  totalToolsUsed: number;
  departmentBreakdown: Array<{ name: string; sessions: number; hoursSaved: number }>;
  topBots: Array<{ name: string; sessions: number; hoursSaved: number }>;
  topTools: Array<{ name: string; count: number }>;
  recentOutcomes: Array<{
    id: number;
    sessionId: number;
    summary: string;
    hoursSaved: number;
    department: string;
    createdAt: string;
  }>;
}

export interface ActivityItem {
  id: number;
  type: string;
  clientId: number;
  action: string;
  resource: string;
  botName: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SessionOutcome {
  id: number;
  sessionId: number;
  outcomeSummary: string;
  botsDeployed: Array<{ botId: number; botName: string; department: string }>;
  toolsExecutedTotal: number;
  durationMinutes: string;
  estimatedHoursSaved: string;
  department: string | null;
  createdAt: string;
}
