import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  DollarSign,
  Activity,
  Zap,
  Clock,
  Download,
  Key,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Shield,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Play, Users, UserPlus, Heart, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 270 50% 60%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 12 76% 61%))",
  "#6366f1",
  "#f59e0b",
  "#10b981",
];

interface SpendData {
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

interface TokenData {
  tokensByModel: { model: string; promptTokens: number; completionTokens: number; total: number }[];
  tokensOverTime: { date: string; promptTokens: number; completionTokens: number }[];
}

interface ToolData {
  toolFrequency: { toolName: string; callCount: number }[];
  heatmap: Record<string, unknown>[];
}

interface OverviewData {
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

interface CostCapData {
  cap: { monthlyCapUsd: number; alertAt80Pct: boolean; pauseAutonomousOnExhaust: boolean } | null;
  currentMonthlySpend: number;
}

interface PipelineData {
  byStatus: { status: string; count: number }[];
}

interface SchedulerData {
  byStatus: { status: string; count: number }[];
}

interface HealthAnalyticsData {
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

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-1">
              {label}
            </p>
            <p className="text-2xl sm:text-3xl font-display font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xl">
      <p className="text-xs font-tech text-muted-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-bold">
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

function DemoMetricsPanel() {
  const { data: demoMetrics, isLoading } = useQuery<{
    totalDemoStarts: number;
    totalCompleted: number;
    totalClaimed: number;
    conversionRate: number;
    avgMessagesPerSession: number;
    last24h: { starts: number; completed: number; claimed: number };
  }>({
    queryKey: ["demoMetrics"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/demo-metrics`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Play className="w-5 h-5 text-cyan" /> Demo Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!demoMetrics) return null;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Play className="w-5 h-5 text-cyan" /> Demo Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <Users className="w-4 h-4 text-primary mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalDemoStarts}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Total Starts</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <Check className="w-4 h-4 text-gold mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalCompleted}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Completed</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <UserPlus className="w-4 h-4 text-cyan mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalClaimed}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Claimed</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-tech">Conversion Rate</span>
          <span className="font-display font-bold text-primary">{demoMetrics.conversionRate.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-tech">Avg Messages/Session</span>
          <span className="font-display font-bold">{demoMetrics.avgMessagesPerSession.toFixed(1)}</span>
        </div>
        <div className="border-t border-border/30 pt-3 mt-3">
          <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Last 24 Hours</div>
          <div className="flex justify-between text-xs">
            <span>{demoMetrics.last24h.starts} starts</span>
            <span>{demoMetrics.last24h.completed} completed</span>
            <span>{demoMetrics.last24h.claimed} claimed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CostCapPanel() {
  const queryClient = useQueryClient();
  const [capAmount, setCapAmount] = useState("");
  const [alert80, setAlert80] = useState(true);
  const [pauseOnExhaust, setPauseOnExhaust] = useState(false);

  const { data: costCap, isLoading } = useQuery<CostCapData>({
    queryKey: ["analytics", "cost-cap"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/cost-cap`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateCap = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/cost-cap`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyCapUsd: parseFloat(capAmount),
          alertAt80Pct: alert80,
          pauseAutonomousOnExhaust: pauseOnExhaust,
        }),
      });
      if (!res.ok) throw new Error("Failed to update cost cap");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });

  const currentCap = costCap?.cap;
  const spend = costCap?.currentMonthlySpend ?? 0;
  const pctUsed = currentCap && currentCap.monthlyCapUsd > 0
    ? (spend / currentCap.monthlyCapUsd) * 100
    : 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Cost Cap Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentCap && currentCap.monthlyCapUsd > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly spend</span>
              <span className="font-bold">${spend.toFixed(4)} / ${currentCap.monthlyCapUsd.toFixed(2)}</span>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pctUsed >= 100 ? "bg-destructive" : pctUsed >= 80 ? "bg-yellow-500" : "bg-primary"}`}
                style={{ width: `${Math.min(pctUsed, 100)}%` }}
              />
            </div>
            {pctUsed >= 80 && (
              <div className="flex items-center gap-1 text-xs text-yellow-500">
                <AlertTriangle className="w-3 h-3" />
                {pctUsed >= 100 ? "Cost cap exceeded!" : `${Math.round(pctUsed)}% of monthly cap used`}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Monthly Cap (USD)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder={currentCap ? String(currentCap.monthlyCapUsd) : "50.00"}
              value={capAmount}
              onChange={(e) => setCapAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Alert at 80% usage</Label>
            <Switch checked={alert80} onCheckedChange={setAlert80} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Pause autonomous runs at 100%</Label>
            <Switch checked={pauseOnExhaust} onCheckedChange={setPauseOnExhaust} />
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => updateCap.mutate()}
            disabled={updateCap.isPending || !capAmount}
          >
            {updateCap.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            Save Cost Cap
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysPanel() {
  const queryClient = useQueryClient();
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys } = useQuery<{ id: number; label: string; apiKeyPrefix: string; createdAt: string }[]>({
    queryKey: ["analytics", "api-keys"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/api-keys`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel || "default" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      setCreatedKey(data.apiKey);
      setNewKeyLabel("");
      queryClient.invalidateQueries({ queryKey: ["analytics", "api-keys"] });
    },
  });

  const deleteKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/analytics/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics", "api-keys"] });
    },
  });

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4" />
          Analytics API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Generate read-only API keys for data science teams to query analytics programmatically.
        </p>

        {createdKey && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-xs font-bold text-primary">New API Key Created (copy now, it won't be shown again)</p>
            <div className="flex gap-2">
              <Input value={createdKey} readOnly className="text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copyKey}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Key label (e.g. data-team)"
            value={newKeyLabel}
            onChange={(e) => setNewKeyLabel(e.target.value)}
            className="text-xs"
          />
          <Button size="sm" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
            {createKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          </Button>
        </div>

        {keys && keys.length > 0 && (
          <div className="space-y-1">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between text-xs p-2 rounded bg-secondary/50">
                <div>
                  <span className="font-bold">{k.label}</span>
                  <span className="text-muted-foreground ml-2">{k.apiKeyPrefix}...</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => deleteKey.mutate(k.id)}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const HEALTH_COLORS = {
  healthy: "#22c55e",
  at_risk: "#eab308",
  critical: "#ef4444",
  unknown: "#6b7280",
};

function ClientHealthAnalyticsPanel() {
  const { data: healthData, isLoading } = useQuery<HealthAnalyticsData>({
    queryKey: ["analytics", "client-health"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/client-health/analytics`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary" /> Client Health
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!healthData) return null;

  const distPieData = [
    { name: "Healthy", value: healthData.distribution.healthy, color: HEALTH_COLORS.healthy },
    { name: "At Risk", value: healthData.distribution.at_risk, color: HEALTH_COLORS.at_risk },
    { name: "Critical", value: healthData.distribution.critical, color: HEALTH_COLORS.critical },
  ].filter((d) => d.value > 0);

  const trendChartData = healthData.trendOverTime.map((d) => ({
    date: d.date,
    score: d.avgScore,
    healthy: d.healthyCount,
    atRisk: d.atRiskCount,
    critical: d.criticalCount,
  }));

  return (
    <>
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Portfolio Health Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center mb-3">
            <span className="text-3xl font-display font-bold">{healthData.averageScore}</span>
            <span className="text-sm text-muted-foreground font-tech ml-2">avg score</span>
          </div>
          {distPieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={distPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {distPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {distPieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm font-tech">
              No health data yet
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Average Health Score Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="healthAnalyticsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="score" stroke="#22c55e" fill="url(#healthAnalyticsGrad)" strokeWidth={2} name="Avg Score" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm font-tech">
              Not enough data points yet
            </div>
          )}
        </CardContent>
      </Card>

      {healthData.activityCorrelation && healthData.activityCorrelation.length > 0 && (
        <Card className="bg-card border-border/50 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Health vs. Activity Correlation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Tag</th>
                    <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Score</th>
                    <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Sessions</th>
                    <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Pipelines</th>
                    <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Events</th>
                  </tr>
                </thead>
                <tbody>
                  {healthData.activityCorrelation.map((row) => (
                    <tr key={row.tag} className="border-b border-border/20">
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            row.tag === "healthy" ? "text-green-400 border-green-500/30 bg-green-500/10" :
                            row.tag === "at_risk" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
                            row.tag === "critical" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                            "text-muted-foreground"
                          }`}
                        >
                          {row.tag === "at_risk" ? "AT RISK" : row.tag.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-bold">{row.avgScore}</td>
                      <td className="py-2 px-3 text-right">{row.avgSessions}</td>
                      <td className="py-2 px-3 text-right">{row.avgPipelines}</td>
                      <td className="py-2 px-3 text-right">{row.avgEvents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Client Health Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Client</th>
                  <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Score</th>
                  <th className="text-center py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Status</th>
                  <th className="text-center py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Trend</th>
                  <th className="text-left py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {healthData.clients.map((c) => (
                  <tr key={c.clientId} className="border-b border-border/20">
                    <td className="py-2 px-3 font-medium">{c.companyName}</td>
                    <td className="py-2 px-3 text-right font-bold">{c.score ?? "—"}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[9px] ${
                          c.tag === "healthy" ? "text-green-400 border-green-500/30 bg-green-500/10" :
                          c.tag === "at_risk" ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" :
                          c.tag === "critical" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                          "text-muted-foreground"
                        }`}
                      >
                        {c.tag === "at_risk" ? "AT RISK" : c.tag.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {c.trend === "improving" && <TrendingUp className="w-4 h-4 text-green-400 mx-auto" />}
                      {c.trend === "declining" && <TrendingDown className="w-4 h-4 text-red-400 mx-auto" />}
                      {c.trend === "stable" && <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[300px]">
                      {c.recommendedAction || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function DataExportPanel() {
  const downloadCsv = (dataset: string) => {
    window.open(`${BASE}/api/analytics/export/${dataset}`, "_blank");
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Download className="w-4 h-4" />
          Data Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground mb-3">
          Download raw datasets as CSV for analysis.
        </p>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => downloadCsv("llm-usage")}>
          <Download className="w-4 h-4 mr-2" />
          LLM Usage Log
        </Button>
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => downloadCsv("tool-activity")}>
          <Download className="w-4 h-4 mr-2" />
          Tool Activity Log
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard() {
  const { data: overview, isLoading: overviewLoading } = useQuery<OverviewData>({
    queryKey: ["analytics", "overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/overview`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: spend } = useQuery<SpendData>({
    queryKey: ["analytics", "spend"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/spend`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: tokens } = useQuery<TokenData>({
    queryKey: ["analytics", "tokens"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/tokens`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: tools } = useQuery<ToolData>({
    queryKey: ["analytics", "tools"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/tools`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: pipelines } = useQuery<PipelineData>({
    queryKey: ["analytics", "pipelines"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/pipelines`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: scheduler } = useQuery<SchedulerData>({
    queryKey: ["analytics", "scheduler"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/scheduler`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (overviewLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const spendChartData = spend?.spendOverTime.map((d) => ({
    date: d.date,
    cost: Math.round(d.totalCost * 10000) / 10000,
    calls: d.callCount,
  })) ?? [];

  const tokenModelData = tokens?.tokensByModel.map((m) => ({
    model: m.model.replace("gpt-", ""),
    prompt: m.promptTokens,
    completion: m.completionTokens,
  })) ?? [];

  const toolFreqData = tools?.toolFrequency.slice(0, 10).map((t) => ({
    name: t.toolName.length > 15 ? t.toolName.substring(0, 15) + "..." : t.toolName,
    fullName: t.toolName,
    calls: t.callCount,
  })) ?? [];

  const pipelinePieData = pipelines?.byStatus.map((p) => ({
    name: p.status,
    value: p.count,
  })) ?? [];

  const schedulerPieData = scheduler?.byStatus.map((s) => ({
    name: s.status,
    value: s.count,
  })) ?? [];

  const modelSpendData = spend?.spendByModel.map((m) => ({
    name: m.model.replace("gpt-", ""),
    value: Math.round(m.totalCost * 10000) / 10000,
  })) ?? [];

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <BarChart3 className="w-3 h-3 mr-1" />
                Analytics
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Platform <span className="text-gradient">Analytics</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              LLM costs, token usage, tool activity, and operational health
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={DollarSign}
            label="Total Spend"
            value={`$${(overview?.totalSpend ?? 0).toFixed(4)}`}
            subtitle={`$${(overview?.monthlySpend ?? 0).toFixed(4)} this month`}
          />
          <StatCard
            icon={Activity}
            label="LLM Calls"
            value={(overview?.totalCalls ?? 0).toLocaleString()}
            subtitle={`${(overview?.avgLatencyMs ?? 0)}ms avg latency`}
          />
          <StatCard
            icon={Zap}
            label="Total Tokens"
            value={(overview?.totalTokens ?? 0).toLocaleString()}
            subtitle="Prompt + completion"
          />
          <StatCard
            icon={Clock}
            label="Tool Executions"
            value={(overview?.totalToolCalls ?? 0).toLocaleString()}
            subtitle="Total tool calls"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Spend Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {spendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={spendChartData}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" fill="url(#spendGrad)" strokeWidth={2} name="Cost ($)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No spend data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Tokens by Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tokenModelData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={tokenModelData}>
                    <XAxis dataKey="model" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="prompt" stackId="a" fill="hsl(var(--primary))" name="Prompt" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="completion" stackId="a" fill="hsl(var(--chart-2, 173 58% 39%))" name="Completion" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No token data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Spend by Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              {modelSpendData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={modelSpendData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {modelSpendData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-2 justify-center">
                    {modelSpendData.map((m, i) => (
                      <div key={m.name} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground">{m.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No model data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Pipeline Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pipelinePieData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={pipelinePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pipelinePieData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              entry.name === "completed" ? "#10b981" :
                              entry.name === "failed" ? "#ef4444" :
                              entry.name === "running" ? "#6366f1" :
                              CHART_COLORS[i % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-2 justify-center">
                    {pipelinePieData.map((p) => (
                      <div key={p.name} className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{p.name}: {p.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No pipeline data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Scheduler Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {schedulerPieData.length > 0 ? (
                <div className="space-y-3">
                  {schedulerPieData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-2 rounded bg-secondary/50">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          s.name === "success" ? "bg-green-500" :
                          s.name === "failed" ? "bg-red-500" :
                          "bg-yellow-500"
                        }`} />
                        <span className="text-sm capitalize">{s.name}</span>
                      </div>
                      <Badge variant="secondary" className="font-mono">{s.value}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No scheduler data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-border/50 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Tool Call Frequency
              </CardTitle>
            </CardHeader>
            <CardContent>
              {toolFreqData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={toolFreqData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={120} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Calls" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No tool activity data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {spend?.spendByModel && spend.spendByModel.length > 0 && (
          <Card className="border-border/50 mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Model Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Model</th>
                      <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Calls</th>
                      <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Prompt Tokens</th>
                      <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Completion Tokens</th>
                      <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Cost</th>
                      <th className="text-right py-2 px-3 font-tech text-muted-foreground text-xs uppercase">Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spend.spendByModel.map((m) => (
                      <tr key={m.model} className="border-b border-border/20">
                        <td className="py-2 px-3 font-mono text-xs">{m.model}</td>
                        <td className="py-2 px-3 text-right">{m.callCount.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">{m.promptTokens.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">{m.completionTokens.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right font-bold">${m.totalCost.toFixed(4)}</td>
                        <td className="py-2 px-3 text-right">{m.avgLatencyMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <ClientHealthAnalyticsPanel />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <DemoMetricsPanel />
          <CostCapPanel />
          <ApiKeysPanel />
          <DataExportPanel />
        </div>
      </div>
    </AppLayout>
  );
}
