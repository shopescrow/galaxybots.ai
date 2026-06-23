import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import {
  Loader2,
  GitBranch,
  Target,
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  BarChart2,
  Lightbulb,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CausalSummary {
  patterns: {
    total: number;
    avgAttributionConfidence: number;
    topPatterns: Array<{
      id: number;
      toolName: string;
      metricName: string;
      treatmentEffect: number | null;
      attributionConfidence: number | null;
      causalPatternSummary: string | null;
      measuredAt: string;
    }>;
  };
  controls: {
    total: number;
    avgMatchQuality: number;
    matchQualityDistribution: number[];
  };
  opportunities: {
    total: number;
    pending: number;
    approved: number;
    dismissed: number;
    hitRate: number;
    signals: Array<{
      id: number;
      signalType: string;
      title: string;
      description: string;
      suggestedAction: string;
      probabilityOfSuccess: number | null;
      status: string;
      detectedAt: string;
    }>;
  };
  goals: {
    totalAutonomous: number;
    autoApproved: number;
    pendingApproval: number;
  };
  conflicts: {
    total: number;
    autoResolved: number;
    escalatedToHuman: number;
    history: Array<{
      id: number;
      goalAId: number;
      goalBId: number;
      conflictType: string;
      resolution: string | null;
      resolvedBy: string;
      escalatedToHuman: number;
      createdAt: string;
    }>;
  };
}

function useCausalSummary(token: string | null) {
  return useQuery<CausalSummary>({
    queryKey: ["causal-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/causal/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load causal summary");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 60000,
  });
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  color = "text-primary",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card/60 flex items-start gap-3">
      <div className={`mt-0.5 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-tech uppercase">{label}</p>
        <p className="text-2xl font-display font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function SignalTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    engagement_drop: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    churn_precursor: "bg-red-500/10 text-red-400 border-red-500/30",
    upsell_trigger: "bg-green-500/10 text-green-400 border-green-500/30",
    re_engagement: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    optimization: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };
  const label = type.replace(/_/g, " ");
  return (
    <Badge variant="outline" className={`text-[10px] uppercase font-tech ${styles[type] ?? "bg-muted/30"}`}>
      {label}
    </Badge>
  );
}

export default function CausalModelDashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useCausalSummary(token);

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/opportunity-signals/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["causal-summary"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/opportunity-signals/${id}/dismiss`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to dismiss");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["causal-summary"] }),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-16 text-muted-foreground">
            <GitBranch className="w-10 h-10 mx-auto mb-4 opacity-20" />
            <p className="font-tech">Causal model data will appear here as bots take actions and outcomes are measured.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const pendingSignals = data.opportunities.signals.filter((s) => s.status === "pending");

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <GitBranch className="w-3 h-3 mr-1" />
                AGI Phase 3
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              Causal Model <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Control-adjusted attribution, opportunity signals, and autonomous goal intelligence
            </p>
          </div>
          <Link href="/analytics">
            <Button variant="outline" size="sm" className="font-tech text-xs gap-1.5">
              Platform Analytics <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatTile
            icon={GitBranch}
            label="Causal Patterns"
            value={data.patterns.total}
            sub={`${(data.patterns.avgAttributionConfidence * 100).toFixed(0)}% avg confidence`}
            color="text-primary"
          />
          <StatTile
            icon={Target}
            label="Control Cohorts"
            value={data.controls.total}
            sub={`${(data.controls.avgMatchQuality * 100).toFixed(0)}% avg match quality`}
            color="text-blue-400"
          />
          <StatTile
            icon={Lightbulb}
            label="Opportunities"
            value={data.opportunities.pending}
            sub={`${data.opportunities.hitRate}% approval rate`}
            color="text-amber-400"
          />
          <StatTile
            icon={TrendingUp}
            label="Autonomous Goals"
            value={data.goals.totalAutonomous}
            sub={`${data.goals.autoApproved} auto-approved`}
            color="text-green-400"
          />
        </div>

        {pendingSignals.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5 mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                Proactive Opportunity Signals
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                  {pendingSignals.length} pending
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingSignals.map((signal) => {
                const pct = Math.round((signal.probabilityOfSuccess ?? 0) * 100);
                return (
                  <div key={signal.id} className="p-4 rounded-xl border border-border/40 bg-card/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <SignalTypeBadge type={signal.signalType} />
                          <span className="text-sm font-medium truncate">{signal.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{signal.description}</p>
                        <div className="text-xs font-tech text-primary/80 bg-primary/5 border border-primary/20 rounded-lg p-2">
                          <span className="text-muted-foreground">Suggested: </span>{signal.suggestedAction}
                          {pct > 0 && <span className="ml-2 text-green-400 font-semibold">{pct}% probability of success</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          className="text-xs h-7 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                          variant="ghost"
                          onClick={() => approveMutation.mutate(signal.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs h-7"
                          variant="ghost"
                          onClick={() => dismissMutation.mutate(signal.id)}
                          disabled={dismissMutation.isPending}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />
                Top Causal Patterns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.patterns.topPatterns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="w-6 h-6 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-tech">Causal patterns will appear as attribution jobs run.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.patterns.topPatterns.map((p) => (
                    <div key={p.id} className="p-3 rounded-lg border border-border/40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate">{p.causalPatternSummary ?? `${p.toolName} → ${p.metricName}`}</span>
                        <span className={`text-xs font-mono font-semibold ml-2 shrink-0 ${(p.treatmentEffect ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(p.treatmentEffect ?? 0) >= 0 ? "+" : ""}{(p.treatmentEffect ?? 0).toFixed(1)} effect
                        </span>
                      </div>
                      <ConfidenceBar value={p.attributionConfidence ?? 0} />
                      <p className="text-[10px] text-muted-foreground mt-1 font-tech">
                        Measured {new Date(p.measuredAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                Counterfactual Match Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.controls.matchQualityDistribution.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-6 h-6 mx-auto mb-2 opacity-20" />
                  <p className="text-xs font-tech">Control cohorts built on first significant outreach actions.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-display font-bold text-primary">
                      {(data.controls.avgMatchQuality * 100).toFixed(0)}%
                    </div>
                    <div>
                      <p className="text-xs font-tech text-muted-foreground">Average match quality</p>
                      <p className="text-xs text-muted-foreground">{data.controls.total} control cohorts built</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-tech text-muted-foreground mb-2 uppercase">Quality distribution</p>
                    <div className="space-y-1.5">
                      {["0–20%", "20–40%", "40–60%", "60–80%", "80–100%"].map((range, i) => {
                        const count = data.controls.matchQualityDistribution.filter(
                          (s) => s >= i * 0.2 && s < (i + 1) * 0.2 + (i === 4 ? 0.001 : 0),
                        ).length;
                        const pct = data.controls.total > 0 ? (count / data.controls.total) * 100 : 0;
                        return (
                          <div key={range} className="flex items-center gap-2 text-xs">
                            <span className="w-12 text-muted-foreground font-tech shrink-0">{range}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-5 text-right text-muted-foreground">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                Goal Conflict Resolution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <p className="text-xl font-display font-bold">{data.conflicts.total}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Total</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                  <p className="text-xl font-display font-bold text-green-400">{data.conflicts.autoResolved}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Auto-resolved</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xl font-display font-bold text-amber-400">{data.conflicts.escalatedToHuman}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Escalated</p>
                </div>
              </div>
              {data.conflicts.history.length === 0 ? (
                <p className="text-xs text-muted-foreground font-tech text-center py-4">No conflicts detected yet.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.conflicts.history.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs p-2 rounded-lg border border-border/40">
                      {c.escalatedToHuman ? (
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-tech text-muted-foreground">
                          Goals #{c.goalAId} vs #{c.goalBId}
                        </span>
                        <span className="ml-2 text-primary/70">{c.conflictType?.replace(/_/g, " ")}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] shrink-0 ${c.escalatedToHuman ? "border-amber-500/30 text-amber-400" : "border-green-500/30 text-green-400"}`}>
                        {c.escalatedToHuman ? "escalated" : "auto"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                Autonomous Goal Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 rounded-lg bg-muted/30">
                  <p className="text-xl font-display font-bold">{data.goals.totalAutonomous}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Generated</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                  <p className="text-xl font-display font-bold text-green-400">{data.goals.autoApproved}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Auto-approved</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-xl font-display font-bold text-amber-400">{data.goals.pendingApproval}</p>
                  <p className="text-[10px] font-tech text-muted-foreground uppercase">Pending</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs p-2 rounded-lg border border-border/40">
                  <span className="font-tech text-muted-foreground">Opportunity hit rate</span>
                  <span className="font-semibold text-primary">{data.opportunities.hitRate}%</span>
                </div>
                <div className="flex items-center justify-between text-xs p-2 rounded-lg border border-border/40">
                  <span className="font-tech text-muted-foreground">Opportunities approved</span>
                  <span className="font-semibold text-green-400">{data.opportunities.approved}</span>
                </div>
                <div className="flex items-center justify-between text-xs p-2 rounded-lg border border-border/40">
                  <span className="font-tech text-muted-foreground">Opportunities dismissed</span>
                  <span className="font-semibold text-muted-foreground">{data.opportunities.dismissed}</span>
                </div>
              </div>
              {data.goals.pendingApproval > 0 && (
                <Link href="/command-center?scroll=approvals">
                  <Button className="w-full mt-3 text-xs h-8 font-tech gap-1.5" size="sm">
                    Review {data.goals.pendingApproval} Pending Goal{data.goals.pendingApproval > 1 ? "s" : ""}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
