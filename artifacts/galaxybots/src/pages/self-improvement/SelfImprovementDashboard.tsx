import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  Loader2,
  Brain,
  FlaskConical,
  Target,
  TrendingUp,
  Wrench,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  CartesianGrid,
  Legend,
} from "recharts";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  accent = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
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

function CalibrationPanel({ summary }: { summary: Record<string, unknown> | null | undefined }) {
  if (!summary) return null;
  const bots = (summary.botSummaries as Array<Record<string, unknown>>) ?? [];
  const latestBot = bots[0];
  const curve = (latestBot?.reliabilityCurve as Array<{ bin: number; predicted: number; actual: number; count: number }>) ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Calibration Reliability Diagram
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Avg ECE: <strong>{Number(summary.avgCalibrationError ?? 0).toFixed(4)}</strong> · Avg Temp Scale: <strong>{Number(summary.avgTemperatureFactor ?? 1).toFixed(3)}</strong>
        </p>
      </CardHeader>
      <CardContent>
        {curve.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
              <XAxis dataKey="predicted" name="Predicted" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} />
              <YAxis dataKey="actual" name="Actual" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
              <Scatter name="Observed" data={curve} fill="hsl(var(--primary))" opacity={0.8} />
              <Line type="linear" dataKey="predicted" stroke="#888" strokeDasharray="4 2" dot={false} name="Perfect calibration" />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No calibration data yet — runs weekly after sufficient confidence predictions.</p>
        )}
        {bots.length > 0 && (
          <div className="mt-3 space-y-2">
            {bots.slice(0, 5).map((b) => (
              <div key={String(b.botId)} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Bot #{b.botId}</span>
                <span className="font-tech">ECE: {Number(b.latestCalibrationError).toFixed(4)}</span>
                <span className="font-tech text-primary">T×{Number(b.latestTemperatureFactor).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PromptTimelinePanel({ timeline }: { timeline: Array<Record<string, unknown>> | null | undefined }) {
  if (!timeline?.length) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">Prompt Version Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">No prompt versions created yet — evolution runs weekly.</p>
        </CardContent>
      </Card>
    );
  }

  const statusColor: Record<string, string> = {
    active: "text-green-500",
    shadow: "text-blue-500",
    pending_review: "text-yellow-500",
    rolled_back: "text-red-500",
    archived: "text-muted-foreground",
    rejected: "text-red-400",
  };

  const StatusIcon: Record<string, React.ElementType> = {
    active: CheckCircle2,
    shadow: RefreshCw,
    pending_review: AlertTriangle,
    rolled_back: XCircle,
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Prompt Version Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {timeline.map((v) => {
            const status = String(v.status ?? "");
            const Icon = StatusIcon[status] ?? RefreshCw;
            return (
              <div key={String(v.id)} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${statusColor[status] ?? "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-tech">Bot #{v.botId} v{v.versionNum}</span>
                  <span className={`ml-2 text-xs ${statusColor[status] ?? "text-muted-foreground"}`}>{status}</span>
                  {v.diffMagnitudePct != null && (
                    <span className="ml-2 text-xs text-muted-foreground">{(Number(v.diffMagnitudePct) * 100).toFixed(1)}% diff</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {v.createdAt ? new Date(String(v.createdAt)).toLocaleDateString() : ""}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ToolHeuristicsPanel({ data }: { data: Record<string, unknown> | null | undefined }) {
  const heuristics = (data?.heuristics as Array<Record<string, unknown>>) ?? [];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
          Tool Heuristics (Top by Success Rate)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {heuristics.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={heuristics.slice(0, 10)} layout="vertical" margin={{ left: 60, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="toolName" tick={{ fontSize: 10 }} width={60} />
              <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
              <Bar dataKey="successRate" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} name="Success Rate" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No heuristics computed yet — runs weekly.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ExperimentSummaryPanel({ experiments }: { experiments: Array<Record<string, unknown>> | null | undefined }) {
  if (!experiments) return null;
  const running = experiments.filter((e) => e.status === "running");
  const completed = experiments.filter((e) => e.status === "completed");

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">Active Experiments</CardTitle>
          <Link href="/experiments">
            <span className="text-xs text-primary hover:underline cursor-pointer">View all →</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {running.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No running experiments.</p>
        ) : (
          <div className="space-y-3">
            {running.slice(0, 3).map((e) => (
              <div key={String(e.id)} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                <p className="text-xs font-medium truncate">{String(e.hypothesis)}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Metric: {String(e.metric)}</span>
                  {e.pValue != null && <span>p={Number(e.pValue).toFixed(3)}</span>}
                  <span>n={Number(e.currentSampleSizeA ?? 0) + Number(e.currentSampleSizeB ?? 0)}/{e.targetSampleSize}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {completed.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {completed.length} completed · {completed.filter((e) => e.winner != null).length} conclusive
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AlignmentSummaryPanel({ summary }: { summary: Record<string, unknown> | null | undefined }) {
  if (!summary) return null;
  const by = (summary.byStakeholder as Record<string, number>) ?? {};

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">Alignment Signals</CardTitle>
          <Link href="/alignment-audit">
            <span className="text-xs text-primary hover:underline cursor-pointer">Audit →</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {Object.entries(by).map(([k, v]) => (
            <div key={k} className="text-center p-2 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-lg font-display font-bold">{v}</p>
              <p className="text-xs text-muted-foreground capitalize">{k}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Proposed rules: <strong className="text-foreground">{String(summary.proposedRules ?? 0)}</strong></span>
          <span>Active rules: <strong className="text-green-500">{String(summary.activeRules ?? 0)}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SelfImprovementDashboard() {
  const overview = useQuery({
    queryKey: ["self-improvement", "overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/analytics/overview`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Record<string, unknown>>;
    },
  });

  const calibration = useQuery({
    queryKey: ["self-improvement", "calibration"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/calibration/summary`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Record<string, unknown>>;
    },
  });

  const promptTimeline = useQuery({
    queryKey: ["self-improvement", "prompt-timeline"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/analytics/prompt-timeline`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Array<Record<string, unknown>>>;
    },
  });

  const toolHeuristics = useQuery({
    queryKey: ["self-improvement", "tool-heuristics"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/analytics/tool-heuristics`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Record<string, unknown>>;
    },
  });

  const experiments = useQuery({
    queryKey: ["self-improvement", "experiments"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/experiments`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Array<Record<string, unknown>>>;
    },
  });

  const alignmentSummary = useQuery({
    queryKey: ["self-improvement", "alignment-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/self-improvement/alignment/summary`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Record<string, unknown>>;
    },
  });

  if (overview.isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const ov = overview.data ?? {};
  const cal = ov.calibration as Record<string, unknown> ?? {};
  const pv = ov.promptVersions as Record<string, unknown> ?? {};
  const exp = ov.experiments as Record<string, unknown> ?? {};
  const aln = ov.alignment as Record<string, unknown> ?? {};
  const th = ov.toolHeuristics as Record<string, unknown> ?? {};

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <Brain className="w-3 h-3 mr-1" />
                Phase 4 · Self-Improvement
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Self-Improvement <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Calibration · Prompt evolution · A/B experiments · Multi-stakeholder alignment
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <StatCard
            icon={Target}
            label="Avg Calib Error"
            value={Number(cal.avgError ?? 0).toFixed(4)}
            subtitle={`${cal.checkpointsCount ?? 0} checkpoints`}
          />
          <StatCard
            icon={Brain}
            label="Prompt Versions"
            value={String(pv.total ?? 0)}
            subtitle={`${pv.active ?? 0} active · ${pv.shadow ?? 0} shadow`}
          />
          <StatCard
            icon={FlaskConical}
            label="Experiments"
            value={String(exp.total ?? 0)}
            subtitle={`${exp.running ?? 0} running · ${(Number(exp.winRate ?? 0) * 100).toFixed(0)}% win rate`}
          />
          <StatCard
            icon={Wrench}
            label="Tool Heuristics"
            value={String(th.totalHeuristics ?? 0)}
            subtitle={`${(Number(th.avgSuccessRate ?? 0) * 100).toFixed(1)}% avg success`}
          />
          <StatCard
            icon={Shield}
            label="Alignment Rules"
            value={String(aln.activeRules ?? 0)}
            subtitle={`${aln.proposedRules ?? 0} proposed · ${(Number(aln.adoptionRate ?? 0) * 100).toFixed(0)}% adopted`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ErrorBoundary>
            <CalibrationPanel summary={calibration.data} />
          </ErrorBoundary>
          <ErrorBoundary>
            <PromptTimelinePanel timeline={promptTimeline.data} />
          </ErrorBoundary>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <ErrorBoundary>
            <ToolHeuristicsPanel data={toolHeuristics.data} />
          </ErrorBoundary>
          <ErrorBoundary>
            <ExperimentSummaryPanel experiments={experiments.data} />
          </ErrorBoundary>
          <ErrorBoundary>
            <AlignmentSummaryPanel summary={alignmentSummary.data} />
          </ErrorBoundary>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link href="/experiments">
            <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Manage Experiments
            </button>
          </Link>
          <Link href="/alignment-audit">
            <button className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Alignment Audit
            </button>
          </Link>
          <Link href="/prompt-versions">
            <button className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Prompt Versions
            </button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
