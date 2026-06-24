import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Zap,
  BarChart3,
  RefreshCw,
  DollarSign,
  Award,
  Target,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import type { IntelligenceReport } from "./types";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

function useIntelligenceReport(days: number) {
  return useQuery<IntelligenceReport>({
    queryKey: ["intelligence-report", days],
    queryFn: () => apiFetch<IntelligenceReport>(`intelligence/report?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });
}

const STRATEGY_COLORS: Record<string, string> = {
  parallel_synthesis: "#6366f1",
  sequential_debate: "#22c55e",
  hierarchical_delegation: "#f59e0b",
  round_robin_review: "#ec4899",
};

const STRATEGY_LABELS: Record<string, string> = {
  parallel_synthesis: "Parallel",
  sequential_debate: "Sequential",
  hierarchical_delegation: "Hierarchical",
  round_robin_review: "Round Robin",
};

function BotCapabilityHeatmap({ report }: { report: IntelligenceReport }) {
  const pairings = report.coordinatorEfficiency.topPairings;

  const byBot = new Map<string, typeof pairings>();
  for (const p of pairings) {
    if (!byBot.has(p.botName)) byBot.set(p.botName, []);
    byBot.get(p.botName)!.push(p);
  }

  const categories = [...new Set(pairings.map((p) => p.taskCategory))];
  const bots = [...byBot.keys()].slice(0, 8);

  if (bots.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No routing weight data yet. Run some task sessions to populate this chart.
      </div>
    );
  }

  function weightToColor(weight: number): string {
    const clamped = Math.min(3.0, Math.max(0.1, weight));
    const t = (clamped - 0.1) / 2.9;
    const r = Math.round(99 + t * (34 - 99));
    const g = Math.round(102 + t * (197 - 102));
    const b = Math.round(241 + t * (94 - 241));
    return `rgb(${r},${g},${b})`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left p-1 font-tech text-muted-foreground w-24">Bot</th>
            {categories.map((cat) => (
              <th key={cat} className="text-center p-1 font-tech text-muted-foreground capitalize">
                {cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bots.map((botName) => {
            const botPairings = byBot.get(botName) ?? [];
            return (
              <tr key={botName}>
                <td className="p-1 font-medium text-foreground truncate max-w-[6rem]" title={botName}>
                  {botName}
                </td>
                {categories.map((cat) => {
                  const pairing = botPairings.find((p) => p.taskCategory === cat);
                  const weight = pairing?.weight ?? 0;
                  return (
                    <td key={cat} className="p-0.5 text-center">
                      <div
                        className="rounded mx-auto flex items-center justify-center text-[10px] font-bold"
                        style={{
                          width: 36,
                          height: 28,
                          backgroundColor: weight > 0 ? weightToColor(weight) : "#1e1e2e",
                          color: weight > 1.5 ? "#fff" : "#94a3b8",
                        }}
                        title={`Weight: ${weight.toFixed(3)}`}
                      >
                        {weight > 0 ? weight.toFixed(1) : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-[10px] text-muted-foreground font-tech">Weight:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded" style={{ background: weightToColor(0.3) }} />
          <span className="text-[10px] text-muted-foreground">Low</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded" style={{ background: weightToColor(1.5) }} />
          <span className="text-[10px] text-muted-foreground">Mid</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 rounded" style={{ background: weightToColor(3.0) }} />
          <span className="text-[10px] text-muted-foreground">High</span>
        </div>
      </div>
    </div>
  );
}

function StrategyWinRateChart({ report }: { report: IntelligenceReport }) {
  const data = report.conductorStrategyWinRates.slice(0, 16).map((s) => ({
    name: `${s.taskCategory} / ${STRATEGY_LABELS[s.strategy] ?? s.strategy}`,
    winRate: Math.round(s.winRate * 100),
    strategy: s.strategy,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No strategy outcome data yet. Deploy bots to populate this chart.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={130} />
        <Tooltip formatter={(value: number) => [`${value}%`, "Win Rate"]} />
        <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={STRATEGY_COLORS[entry.strategy] ?? "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function QualityTrendChart({ report }: { report: IntelligenceReport }) {
  const data = report.qualityTrend.map((p) => ({
    week: p.week,
    score: Math.round(p.avgScore * 100),
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Not enough data for a trend yet. Quality scores will appear after sessions complete.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip formatter={(v: number) => [`${v}%`, "Avg Quality"]} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 4, fill: "#6366f1" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CostEfficiencyCard({ report }: { report: IntelligenceReport }) {
  const { costEfficiency } = report;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <p className="text-xs font-tech text-muted-foreground uppercase">Actual LLM Cost</p>
        <p className="text-2xl font-display font-bold">${costEfficiency.totalLlmCostUsd.toFixed(4)}</p>
        <p className="text-xs text-muted-foreground">With GalaxyConductor routing</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-tech text-muted-foreground uppercase">Naive Baseline</p>
        <p className="text-2xl font-display font-bold">${costEfficiency.estimatedNaiveCostUsd.toFixed(4)}</p>
        <p className="text-xs text-muted-foreground">Est. cost with GPT-4o only</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-tech text-muted-foreground uppercase">Estimated Savings</p>
        <p className="text-2xl font-display font-bold text-emerald-500">
          ${costEfficiency.estimatedSavingsUsd.toFixed(4)}
        </p>
        <p className="text-xs text-muted-foreground">vs. naive routing</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-tech text-muted-foreground uppercase">Savings %</p>
        <p className="text-2xl font-display font-bold text-emerald-500">
          {costEfficiency.savingsPct.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">Cost efficiency gain</p>
      </div>
    </div>
  );
}

export default function GalaxyIntelligence() {
  const [days, setDays] = useState(30);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useIntelligenceReport(days);

  const cycleMutation = useMutation({
    mutationFn: () => apiPost("intelligence/cycle/trigger", { days: 7 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence-report"] });
    },
  });

  const wow = data?.weekOverWeekImprovement;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <Brain className="w-3 h-3 mr-1" />
                Galaxy Intelligence
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Self-Optimization <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Routing intelligence, strategy win rates, and quality trends — updated automatically
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded text-xs font-tech transition-colors ${
                    days === d
                      ? "bg-background text-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cycleMutation.mutate()}
              disabled={cycleMutation.isPending}
              className="gap-1.5"
            >
              {cycleMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Run Cycle
            </Button>
          </div>
        </div>

        {cycleMutation.isSuccess && (
          <div className="mb-6 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-2">
            <CheckCircle className="w-4 h-4" />
            Intelligence cycle ran successfully. Weights have been updated.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive py-12 justify-center">
            <AlertCircle className="w-5 h-5" />
            <span>Failed to load intelligence report.</span>
          </div>
        ) : data ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-border/50 bg-card">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-1">Week-over-Week</p>
                      <p className={`text-2xl font-display font-bold ${wow != null && wow >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {wow != null ? `${wow > 0 ? "+" : ""}${wow}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Quality improvement</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                      {wow != null && wow >= 0 ? (
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-1">Bot-Role Pairs</p>
                      <p className="text-2xl font-display font-bold">
                        {data.coordinatorEfficiency.totalWeightedBotRoles}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Weighted routings tracked</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-1">Best Strategy</p>
                      <p className="text-lg font-display font-bold capitalize truncate">
                        {data.conductorStrategyWinRates[0]
                          ? STRATEGY_LABELS[data.conductorStrategyWinRates[0].strategy] ?? data.conductorStrategyWinRates[0].strategy
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {data.conductorStrategyWinRates[0]
                          ? `${Math.round(data.conductorStrategyWinRates[0].avgScore * 100)}% avg score`
                          : "No data yet"}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                      <Award className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-1">Cost Savings</p>
                      <p className="text-2xl font-display font-bold text-emerald-500">
                        ${data.costEfficiency.estimatedSavingsUsd.toFixed(3)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">vs. naive routing</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <DollarSign className="w-5 h-5 text-emerald-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Bot Capability Heatmap
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Routing weights by bot × task category (brighter = stronger preference)
                  </p>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary>
                    <BotCapabilityHeatmap report={data} />
                  </ErrorBoundary>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Strategy Win Rates
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Win rate (≥0.7 quality score) per task category and strategy
                  </p>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary>
                    <StrategyWinRateChart report={data} />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Quality Score Trend
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Week-over-week average quality score</p>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary>
                    <QualityTrendChart report={data} />
                  </ErrorBoundary>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    Cost Efficiency
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Actual cost vs. estimated cost with naive GPT-4o routing
                  </p>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary>
                    <CostEfficiencyCard report={data} />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </div>

            {data.lastCycleRun && (
              <Card className="border-border/50 bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    Last Intelligence Cycle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 text-sm mb-3">
                    <span className="text-muted-foreground">
                      Ran:{" "}
                      <span className="text-foreground font-medium">
                        {new Date(data.lastCycleRun.ranAt!).toLocaleString()}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      Coordinator corrections:{" "}
                      <span className="text-foreground font-medium">{data.lastCycleRun.coordinatorCorrections}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Conductor nudges:{" "}
                      <span className="text-foreground font-medium">{data.lastCycleRun.conductorCorrections}</span>
                    </span>
                  </div>
                  {data.lastCycleRun.summary && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 leading-relaxed">
                      {data.lastCycleRun.summary}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
