import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from "recharts";
import {
  Brain,
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Zap,
  BarChart3,
  Users,
  Target,
  Cpu,
  ChevronRight,
  Clock,
  Star,
  ClipboardList,
  GitCompare,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DimensionScores {
  reasoningDepth: number;
  memoryCoherence: number;
  goalAutonomy: number;
  selfImprovementRate: number;
  alignmentFidelity: number;
}

interface OracleFinding {
  category: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  evidence?: string;
}

interface OracleRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  estimatedImpact: string;
  actionType: string;
  approvedToTaskAt?: string;
}

interface OracleReport {
  id: number;
  reportDate: string;
  intelligenceScore: number | null;
  dimensionScores: DimensionScores | null;
  reportJson: {
    findings: OracleFinding[];
    recommendations: OracleRecommendation[];
    anomalies: Array<{
      patternId: number | null;
      description: string;
      clientsAffected: number;
      quarantineStatus: string;
    }>;
    topPerformingBotConfigs: Array<{ botRole: string; variant: string; outcomeScore: number }>;
    underperformingRoles: Array<{ botRole: string; avgSuccessRate: number; sessionCount: number }>;
    experimentOutcomes: Array<{ experimentId: number; result: string; winner: string | null }>;
    alignmentRuleEffectiveness: number;
    consequenceModelAccuracy: number | null;
  };
}

interface SummaryData {
  latestReport: OracleReport | null;
  activeExperiments: number;
  pendingRoleGaps: number;
  quarantinedAnomalies: number;
  causalPatterns: number;
  highRiskActions: number;
}

interface BotVariantAssignment {
  id: number;
  botRole: string;
  assignmentWeightA: number;
  assignmentWeightB: number;
  performanceDelta: number | null;
  weeksOfSignificance: number;
  lastTTestPValue: number | null;
  sampleSizeA: number;
  sampleSizeB: number;
  meanOutcomeA: number | null;
  meanOutcomeB: number | null;
  championDeclaredAt: string | null;
  championVariant: string | null;
  status: string;
}

interface RoleGapSignal {
  id: number;
  gapDescription: string;
  evidenceSessions: number;
  avgSuccessRate: number;
  proposedRoleName: string | null;
  clusterId: string | null;
  clusterKeywords: string[];
  status: string;
  createdAt: string;
}

interface PlatformAnomaly {
  id: number;
  patternId: number | null;
  anomalyType: string;
  description: string;
  clientsAffected: number;
  deviationStdDevs: number | null;
  quarantineStatus: string;
  reviewedAt: string | null;
  createdAt: string;
}

interface RiskScore {
  id: number;
  toolName: string;
  industryVertical: string;
  riskScore: number;
  confidenceScore: number;
  evidenceCount: number;
  negativeOutcomeCount: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-500";
  const ringColor =
    score >= 80 ? "stroke-green-500" : score >= 60 ? "stroke-yellow-500" : "stroke-red-500";

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className={ringColor}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-xl font-bold ${color}`}>{score.toFixed(0)}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (severity === "warning")
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
        Warning
      </Badge>
    );
  return <Badge variant="secondary">Info</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high") return <Badge variant="destructive">High</Badge>;
  if (priority === "medium")
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
        Medium
      </Badge>
    );
  return <Badge variant="outline">Low</Badge>;
}

/** Spider/radar chart for the 5 AGI capability dimensions using Recharts */
function DimensionSpiderChart({ dims }: { dims: DimensionScores }) {
  const data = [
    { dimension: "Reasoning", value: Math.round(dims.reasoningDepth * 100) },
    { dimension: "Memory", value: Math.round(dims.memoryCoherence * 100) },
    { dimension: "Autonomy", value: Math.round(dims.goalAutonomy * 100) },
    { dimension: "Self-Improve", value: Math.round(dims.selfImprovementRate * 100) },
    { dimension: "Alignment", value: Math.round(dims.alignmentFidelity * 100) },
  ];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
        <Radar
          name="Score"
          dataKey="value"
          stroke="#7c3aed"
          fill="#7c3aed"
          fillOpacity={0.25}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Trend line chart for intelligence score + dimension scores across reports */
function DimensionTrendChart({ reports }: { reports: OracleReport[] }) {
  const data = [...reports]
    .reverse()
    .slice(-8)
    .map((r) => ({
      date: new Date(r.reportDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Score: r.intelligenceScore != null ? Math.round(r.intelligenceScore) : null,
      Reasoning: r.dimensionScores ? Math.round(r.dimensionScores.reasoningDepth * 100) : null,
      Memory: r.dimensionScores ? Math.round(r.dimensionScores.memoryCoherence * 100) : null,
      Autonomy: r.dimensionScores ? Math.round(r.dimensionScores.goalAutonomy * 100) : null,
      Alignment: r.dimensionScores ? Math.round(r.dimensionScores.alignmentFidelity * 100) : null,
    }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v: number) => `${v}%`} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="Score" stroke="#7c3aed" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Reasoning" stroke="#2563eb" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="Memory" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="Autonomy" stroke="#ea580c" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Line type="monotone" dataKey="Alignment" stroke="#0891b2" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Weekly diff viewer: compares findings and intelligence score between
 * the latest and the previous Oracle report.
 */
function ReportDiffViewer({
  current,
  previous,
}: {
  current: OracleReport;
  previous: OracleReport;
}) {
  const scoreDelta =
    current.intelligenceScore != null && previous.intelligenceScore != null
      ? current.intelligenceScore - previous.intelligenceScore
      : null;

  const prevTitles = new Set(previous.reportJson.findings.map((f) => f.title));
  const currTitles = new Set(current.reportJson.findings.map((f) => f.title));

  const newFindings = current.reportJson.findings.filter((f) => !prevTitles.has(f.title));
  const resolvedFindings = previous.reportJson.findings.filter((f) => !currTitles.has(f.title));
  const persisting = current.reportJson.findings.filter((f) => prevTitles.has(f.title));

  const prevRecTitles = new Set(previous.reportJson.recommendations.map((r) => r.title));
  const newRecs = current.reportJson.recommendations.filter((r) => !prevRecTitles.has(r.title));

  return (
    <div className="space-y-4">
      {/* Score delta */}
      <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
        <div className="text-sm text-muted-foreground">
          vs. {new Date(previous.reportDate).toLocaleDateString()}
        </div>
        {scoreDelta != null && (
          <div
            className={`text-lg font-bold ${
              scoreDelta > 0 ? "text-green-600" : scoreDelta < 0 ? "text-red-600" : "text-muted-foreground"
            }`}
          >
            {scoreDelta > 0 ? "▲" : scoreDelta < 0 ? "▼" : "="}{" "}
            {Math.abs(scoreDelta).toFixed(1)} pts
          </div>
        )}
        {current.dimensionScores && previous.dimensionScores && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            {(
              [
                ["Reasoning", "reasoningDepth"],
                ["Memory", "memoryCoherence"],
                ["Autonomy", "goalAutonomy"],
                ["Self-Improve", "selfImprovementRate"],
                ["Alignment", "alignmentFidelity"],
              ] as [string, keyof DimensionScores][]
            ).map(([label, key]) => {
              const delta = (current.dimensionScores![key] - previous.dimensionScores![key]) * 100;
              if (Math.abs(delta) < 0.5) return null;
              return (
                <span key={key} className={delta > 0 ? "text-green-600" : "text-red-600"}>
                  {label}: {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* New findings */}
      {newFindings.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {newFindings.length} New Finding{newFindings.length > 1 ? "s" : ""}
          </h4>
          <div className="space-y-1.5">
            {newFindings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm p-2 rounded border-l-4 border-red-400 bg-red-50 dark:bg-red-950/20">
                <SeverityBadge severity={f.severity} />
                <span className="font-medium">{f.title}</span>
                <span className="text-muted-foreground text-xs">{f.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved findings */}
      {resolvedFindings.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-green-600 mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {resolvedFindings.length} Resolved Finding{resolvedFindings.length > 1 ? "s" : ""}
          </h4>
          <div className="space-y-1.5">
            {resolvedFindings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm p-2 rounded border-l-4 border-green-400 bg-green-50 dark:bg-green-950/20 opacity-75">
                <span className="font-medium line-through">{f.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New recommendations */}
      {newRecs.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-blue-600 mb-1 flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5" /> {newRecs.length} New Recommendation{newRecs.length > 1 ? "s" : ""}
          </h4>
          <div className="space-y-1.5">
            {newRecs.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm p-2 rounded border bg-blue-50 dark:bg-blue-950/20">
                <PriorityBadge priority={r.priority} />
                <span className="font-medium">{r.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persisting findings count */}
      {persisting.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {persisting.length} finding{persisting.length > 1 ? "s" : ""} carried over from previous report.
        </p>
      )}
    </div>
  );
}

export default function PlatformIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDiff, setShowDiff] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ["platform-intelligence-summary"],
    queryFn: () => fetchJson<SummaryData>("/platform-intelligence/summary"),
  });

  const { data: reportsData } = useQuery<OracleReport[]>({
    queryKey: ["platform-intelligence-oracle-reports"],
    queryFn: () => fetchJson<OracleReport[]>("/platform-intelligence/oracle-reports"),
  });

  const { data: championData } = useQuery<{
    champions: BotVariantAssignment[];
    active: BotVariantAssignment[];
  }>({
    queryKey: ["platform-intelligence-champion-configs"],
    queryFn: () =>
      fetchJson<{ champions: BotVariantAssignment[]; active: BotVariantAssignment[] }>(
        "/platform-intelligence/champion-configs",
      ),
  });

  const { data: roleGaps } = useQuery<RoleGapSignal[]>({
    queryKey: ["platform-intelligence-role-gaps"],
    queryFn: () => fetchJson<RoleGapSignal[]>("/platform-intelligence/role-gaps"),
  });

  const { data: anomalies } = useQuery<PlatformAnomaly[]>({
    queryKey: ["platform-intelligence-anomalies"],
    queryFn: () => fetchJson<PlatformAnomaly[]>("/platform-intelligence/anomalies"),
  });

  const { data: riskScores } = useQuery<RiskScore[]>({
    queryKey: ["platform-intelligence-consequence-risks"],
    queryFn: () => fetchJson<RiskScore[]>("/platform-intelligence/consequence-risks"),
  });

  const reviewGapMutation = useMutation({
    mutationFn: ({
      id,
      status,
      reviewerNote,
    }: {
      id: number;
      status: string;
      reviewerNote?: string;
    }) => patchJson(`/platform-intelligence/role-gaps/${id}`, { status, reviewerNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-role-gaps"] });
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-summary"] });
      toast({ title: "Role gap updated" });
    },
    onError: () => toast({ title: "Error updating role gap", variant: "destructive" }),
  });

  const reviewAnomalyMutation = useMutation({
    mutationFn: ({
      id,
      quarantineStatus,
      reviewNote,
    }: {
      id: number;
      quarantineStatus: string;
      reviewNote?: string;
    }) =>
      patchJson(`/platform-intelligence/anomalies/${id}/review`, {
        quarantineStatus,
        reviewNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-anomalies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-summary"] });
      toast({ title: "Anomaly reviewed" });
    },
    onError: () => toast({ title: "Error reviewing anomaly", variant: "destructive" }),
  });

  const approveToTaskMutation = useMutation({
    mutationFn: ({ reportId, recId }: { reportId: number; recId: string }) =>
      postJson(`/platform-intelligence/oracle-reports/${reportId}/recommendations/${recId}/create-task`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-oracle-reports"] });
      queryClient.invalidateQueries({ queryKey: ["platform-intelligence-summary"] });
      toast({ title: "Task created", description: "Recommendation approved and task notification sent to owners." });
    },
    onError: () => toast({ title: "Error creating task", variant: "destructive" }),
  });

  const latestReport = summary?.latestReport ?? reportsData?.[0] ?? null;
  const previousReport = reportsData && reportsData.length > 1 ? reportsData[1] : null;
  const dims = latestReport?.dimensionScores;
  const score = latestReport?.intelligenceScore ?? 0;

  const metricStrip = [
    {
      label: "Intelligence Score",
      value: score > 0 ? `${score.toFixed(0)}/100` : "—",
      icon: Star,
      color: "text-violet-600",
    },
    {
      label: "Active Experiments",
      value: summary?.activeExperiments ?? "—",
      icon: Zap,
      color: "text-blue-600",
    },
    {
      label: "Pending Role Gaps",
      value: summary?.pendingRoleGaps ?? "—",
      icon: Target,
      color: "text-orange-600",
    },
    {
      label: "Quarantined Anomalies",
      value: summary?.quarantinedAnomalies ?? "—",
      icon: AlertTriangle,
      color: "text-red-600",
    },
    {
      label: "Causal Patterns",
      value: summary?.causalPatterns ?? "—",
      icon: BarChart3,
      color: "text-green-600",
    },
    {
      label: "High-Risk Actions",
      value: summary?.highRiskActions ?? "—",
      icon: Shield,
      color: "text-yellow-600",
    },
  ] as const;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="w-7 h-7 text-violet-600" />
              Platform Intelligence
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              AGI capability dashboard — collective intelligence, consequence alignment & Oracle insights
            </p>
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {metricStrip.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="text-center">
              <CardContent className="pt-4 pb-3">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                <div className="text-xl font-bold">{summaryLoading ? "…" : value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="oracle">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="oracle">Oracle Report</TabsTrigger>
            <TabsTrigger value="dimensions">Intelligence Dimensions</TabsTrigger>
            <TabsTrigger value="specialization">Role Specialization</TabsTrigger>
            <TabsTrigger value="role-gaps">Role Discovery</TabsTrigger>
            <TabsTrigger value="consequence">Consequence Alignment</TabsTrigger>
            <TabsTrigger value="anomalies">Adversarial Events</TabsTrigger>
          </TabsList>

          {/* ─── Oracle Report Tab ─────────────────────────────────────────── */}
          <TabsContent value="oracle" className="space-y-4 mt-4">
            {latestReport ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Eye className="w-5 h-5 text-violet-600" />
                          Platform Intelligence Report
                        </CardTitle>
                        <CardDescription>
                          Generated {new Date(latestReport.reportDate).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-3">
                        {previousReport && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDiff((v) => !v)}
                            className="text-xs"
                          >
                            <GitCompare className="w-3.5 h-3.5 mr-1" />
                            {showDiff ? "Hide Diff" : "Week-over-Week Diff"}
                          </Button>
                        )}
                        <div className="text-right">
                          <div className="text-3xl font-bold text-violet-600">
                            {latestReport.intelligenceScore?.toFixed(1) ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">/ 100</div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">

                    {/* ── Week-over-week diff viewer ── */}
                    {showDiff && previousReport && (
                      <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                        <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                          <GitCompare className="w-4 h-4 text-violet-600" />
                          Week-over-Week Changes
                        </h3>
                        <ReportDiffViewer current={latestReport} previous={previousReport} />
                      </div>
                    )}

                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Findings ({latestReport.reportJson.findings.length})
                      </h3>
                      {latestReport.reportJson.findings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No findings this week.</p>
                      ) : (
                        <div className="space-y-2">
                          {latestReport.reportJson.findings.map((f, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-lg border-l-4 ${
                                f.severity === "critical"
                                  ? "border-red-500 bg-red-50 dark:bg-red-950/20"
                                  : f.severity === "warning"
                                  ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20"
                                  : "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-sm">{f.title}</span>
                                <SeverityBadge severity={f.severity} />
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{f.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Recommendations ({latestReport.reportJson.recommendations.length})
                      </h3>
                      {latestReport.reportJson.recommendations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No recommendations this week.</p>
                      ) : (
                        <div className="space-y-2">
                          {latestReport.reportJson.recommendations.map((r, i) => (
                            <div
                              key={i}
                              className="p-3 rounded-lg border bg-card flex items-start gap-3"
                            >
                              <ChevronRight className="w-4 h-4 mt-0.5 text-violet-500 shrink-0" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{r.title}</span>
                                  <PriorityBadge priority={r.priority} />
                                  {r.approvedToTaskAt && (
                                    <Badge variant="outline" className="text-xs text-green-600 border-green-400">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Task created
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {r.description}
                                </p>
                                <p className="text-xs text-green-600 mt-1">
                                  Impact: {r.estimatedImpact}
                                </p>
                              </div>
                              {!r.approvedToTaskAt && latestReport && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 text-xs"
                                  disabled={approveToTaskMutation.isPending}
                                  onClick={() =>
                                    approveToTaskMutation.mutate({
                                      reportId: latestReport.id,
                                      recId: r.id,
                                    })
                                  }
                                >
                                  <ClipboardList className="w-3 h-3 mr-1" />
                                  Create Task
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
                      <div className="text-center">
                        <div className="text-lg font-bold">
                          {(latestReport.reportJson.alignmentRuleEffectiveness * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs text-muted-foreground">Alignment Effectiveness</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">
                          {latestReport.reportJson.experimentOutcomes.length}
                        </div>
                        <div className="text-xs text-muted-foreground">Experiments Completed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">
                          {latestReport.reportJson.consequenceModelAccuracy != null
                            ? `${(latestReport.reportJson.consequenceModelAccuracy * 100).toFixed(0)}%`
                            : "Training…"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Consequence Model Accuracy
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {reportsData && reportsData.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Report History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {reportsData.slice(0, 8).map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between text-sm py-1 border-b last:border-0"
                          >
                            <span className="text-muted-foreground">
                              {new Date(r.reportDate).toLocaleDateString()}
                            </span>
                            <span className="font-medium">
                              {r.intelligenceScore != null
                                ? `${r.intelligenceScore.toFixed(1)}/100`
                                : "—"}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {r.reportJson.findings.length} findings
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Eye className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No Oracle reports yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The Oracle runs weekly and will publish the first report automatically.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Intelligence Dimensions Tab ──────────────────────────────── */}
          <TabsContent value="dimensions" className="space-y-4 mt-4">
            {dims ? (
              <>
                {/* Spider chart + gauge side-by-side */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-violet-600" />
                      AGI Capability Spider Chart
                    </CardTitle>
                    <CardDescription>
                      Five dimensions composited into the platform intelligence score via geometric mean
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                      <div className="flex flex-col items-center gap-4">
                        <ScoreGauge score={score} label="Intelligence Score" />
                        <div className="grid grid-cols-5 gap-2 w-full">
                          {(
                            [
                              { key: "reasoningDepth" as keyof DimensionScores, label: "Reasoning" },
                              { key: "memoryCoherence" as keyof DimensionScores, label: "Memory" },
                              { key: "goalAutonomy" as keyof DimensionScores, label: "Autonomy" },
                              { key: "selfImprovementRate" as keyof DimensionScores, label: "Self-Improve" },
                              { key: "alignmentFidelity" as keyof DimensionScores, label: "Alignment" },
                            ]
                          ).map(({ key, label }) => (
                            <div key={key} className="text-center p-2 rounded-lg bg-muted">
                              <div className="text-base font-bold text-violet-600">
                                {Math.round((dims[key] ?? 0) * 100)}%
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <DimensionSpiderChart dims={dims} />
                    </div>
                  </CardContent>
                </Card>

                {/* Trend chart — only shown when multiple reports available */}
                {reportsData && reportsData.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-violet-600" />
                        Weekly Trend (last {Math.min(reportsData.length, 8)} reports)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DimensionTrendChart reports={reportsData} />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Brain className="w-10 h-10 mx-auto mb-3" />
                  No dimension scores computed yet. The platform intelligence score runs weekly.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Role Specialization Tab ──────────────────────────────────── */}
          <TabsContent value="specialization" className="space-y-4 mt-4">
            {championData?.champions && championData.champions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    Champion Configurations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {championData.champions.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-yellow-50 dark:bg-yellow-950/20"
                      >
                        <div>
                          <div className="font-medium">{c.botRole}</div>
                          <div className="text-sm text-muted-foreground">
                            Champion: Variant {c.championVariant} •{" "}
                            {c.championDeclaredAt
                              ? `Declared ${new Date(c.championDeclaredAt).toLocaleDateString()}`
                              : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-sm">
                            {c.performanceDelta != null
                              ? `Δ${c.performanceDelta > 0 ? "+" : ""}${c.performanceDelta.toFixed(3)}`
                              : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            p={c.lastTTestPValue != null ? c.lastTTestPValue.toFixed(3) : "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-600" />
                  Active Experiments
                </CardTitle>
                <CardDescription>
                  A/B variant competitions — champion declared after 4 consecutive weeks of
                  statistically significant outperformance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!championData?.active || championData.active.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No active role specialization experiments.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {championData.active.map((v) => (
                      <div key={v.id} className="p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">{v.botRole}</div>
                          <Badge variant="outline">
                            {v.weeksOfSignificance}/4 weeks significant
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-muted-foreground">
                            Variant A: {((v.assignmentWeightA ?? 0) * 100).toFixed(0)}% traffic
                            {v.meanOutcomeA != null ? ` • Score: ${v.meanOutcomeA.toFixed(3)}` : ""}
                          </div>
                          <div className="text-muted-foreground">
                            Variant B: {((v.assignmentWeightB ?? 0) * 100).toFixed(0)}% traffic
                            {v.meanOutcomeB != null ? ` • Score: ${v.meanOutcomeB.toFixed(3)}` : ""}
                          </div>
                        </div>
                        {v.lastTTestPValue != null && (
                          <div className="text-xs text-muted-foreground mt-1">
                            p-value: {v.lastTTestPValue.toFixed(3)} • n=
                            {v.sampleSizeA + v.sampleSizeB} samples
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Role Discovery Tab ───────────────────────────────────────── */}
          <TabsContent value="role-gaps" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-600" />
                  Novel Role Proposals
                </CardTitle>
                <CardDescription>
                  Weekly gap analysis — TF-IDF semantic clustering detects unmet objective patterns;
                  clusters of ≥20 failing sessions trigger a new role proposal
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!roleGaps || roleGaps.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No role gap signals detected yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {roleGaps.map((gap) => (
                      <div key={gap.id} className="p-4 rounded-lg border">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-medium">
                              {gap.proposedRoleName ?? gap.clusterId ?? "Unnamed Gap"}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {gap.gapDescription}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(gap.clusterKeywords ?? []).map((kw) => (
                                <Badge key={kw} variant="outline" className="text-xs">
                                  {kw}
                                </Badge>
                              ))}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {gap.evidenceSessions} sessions •{" "}
                              {(gap.avgSuccessRate * 100).toFixed(0)}% avg success
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {gap.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() =>
                                    reviewGapMutation.mutate({
                                      id: gap.id,
                                      status: "approved",
                                    })
                                  }
                                  disabled={reviewGapMutation.isPending}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    reviewGapMutation.mutate({
                                      id: gap.id,
                                      status: "dismissed",
                                    })
                                  }
                                  disabled={reviewGapMutation.isPending}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Badge
                                variant={gap.status === "approved" ? "default" : "secondary"}
                              >
                                {gap.status}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Consequence Alignment Tab ────────────────────────────────── */}
          <TabsContent value="consequence" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-violet-600" />
                  Consequence-Grounded Alignment
                </CardTitle>
                <CardDescription>
                  Actions gated by a consequence model trained on temporal action→harm linkages
                  (harm event within 30 days of action). Per-bot risk thresholds configurable
                  via bot loop config quality threshold.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!riskScores || riskScores.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    No consequence risk scores yet. The model trains monthly on accumulated
                    action→outcome history.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20">
                        <div className="text-xl font-bold text-red-600">
                          {riskScores.filter((r) => r.riskScore >= 0.7).length}
                        </div>
                        <div className="text-xs text-muted-foreground">High Risk (≥70%)</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20">
                        <div className="text-xl font-bold text-yellow-600">
                          {
                            riskScores.filter((r) => r.riskScore >= 0.4 && r.riskScore < 0.7)
                              .length
                          }
                        </div>
                        <div className="text-xs text-muted-foreground">Medium Risk (40–70%)</div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20">
                        <div className="text-xl font-bold text-green-600">
                          {riskScores.filter((r) => r.riskScore < 0.4).length}
                        </div>
                        <div className="text-xs text-muted-foreground">Low Risk (&lt;40%)</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {riskScores.slice(0, 20).map((r) => {
                        const riskColor =
                          r.riskScore >= 0.7
                            ? "bg-red-500"
                            : r.riskScore >= 0.4
                            ? "bg-yellow-500"
                            : "bg-green-500";
                        return (
                          <div
                            key={r.id}
                            className="flex items-center gap-3 p-2 rounded border text-sm"
                          >
                            <div className="flex-1">
                              <span className="font-medium">{r.toolName}</span>
                              <span className="text-muted-foreground ml-2 text-xs">
                                {r.industryVertical}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${riskColor}`}
                                  style={{ width: `${r.riskScore * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-10 text-right">
                                {(r.riskScore * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground w-20 text-right">
                              n={r.evidenceCount}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Adversarial Events Tab ───────────────────────────────────── */}
          <TabsContent value="anomalies" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  Adversarial Event Log
                </CardTitle>
                <CardDescription>
                  Causal patterns flagged for implausible effects or coordinated data quality
                  failures — quarantined until reviewed
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!anomalies || anomalies.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-70" />
                    No adversarial events detected. Platform patterns are clean.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomalies.map((a) => (
                      <div
                        key={a.id}
                        className={`p-3 rounded-lg border ${
                          a.quarantineStatus === "quarantined"
                            ? "border-red-200 bg-red-50 dark:bg-red-950/20"
                            : a.quarantineStatus === "resolved"
                            ? "border-green-200 bg-green-50 dark:bg-green-950/20"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  a.quarantineStatus === "quarantined"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {a.quarantineStatus}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {a.anomalyType}
                              </Badge>
                            </div>
                            <p className="text-sm mt-1">{a.description}</p>
                            <div className="text-xs text-muted-foreground mt-1">
                              {a.clientsAffected} clients affected
                              {a.deviationStdDevs != null
                                ? ` • ${a.deviationStdDevs.toFixed(1)}x deviation`
                                : ""}
                              {" • "}
                              Detected {new Date(a.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          {a.quarantineStatus === "quarantined" && (
                            <div className="flex gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-700 border-green-300"
                                onClick={() =>
                                  reviewAnomalyMutation.mutate({
                                    id: a.id,
                                    quarantineStatus: "resolved",
                                    reviewNote: "Manually resolved by owner",
                                  })
                                }
                                disabled={reviewAnomalyMutation.isPending}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Resolve
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
