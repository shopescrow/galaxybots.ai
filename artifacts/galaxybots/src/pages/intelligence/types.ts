export interface BotRolePairing {
  botId: number;
  botName: string;
  taskCategory: string;
  role: string;
  weight: number;
}

export interface StrategyWinRate {
  taskCategory: string;
  strategy: string;
  avgScore: number;
  runCount: number;
  winRate: number;
}

export interface QualityTrendPoint {
  week: string;
  avgScore: number;
  sessionCount: number;
}

export interface IntelligenceReport {
  clientId?: number;
  generatedAt: string;
  dateFrom: string;
  dateTo: string;
  coordinatorEfficiency: {
    topPairings: BotRolePairing[];
    avgWeightDeviation: number;
    totalWeightedBotRoles: number;
  };
  conductorStrategyWinRates: StrategyWinRate[];
  qualityTrend: QualityTrendPoint[];
  costEfficiency: {
    totalLlmCostUsd: number;
    estimatedNaiveCostUsd: number;
    estimatedSavingsUsd: number;
    savingsPct: number;
  };
  lastCycleRun: {
    ranAt: string | null;
    coordinatorCorrections: number;
    conductorCorrections: number;
    summary: string | null;
  } | null;
  weekOverWeekImprovement: number | null;
}
