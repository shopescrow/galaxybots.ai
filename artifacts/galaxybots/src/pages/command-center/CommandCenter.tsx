import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import {
  Loader2,
  Activity,
  AlertTriangle,
  LayoutDashboard,
  RefreshCw,
  Workflow,
  ArrowRight,
  Building,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useEffect } from "react";
import { Redirect, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import OnboardingChecklist from "@/components/onboarding/OnboardingChecklist";
import { DashboardNotificationFeed } from "@/components/notifications/DashboardNotificationFeed";
import { useCommandCenterData } from "./components/useCommandCenterData";
import { GOVERNANCE_MODE_STYLES } from "./components/helpers";
import { ActivityFeed } from "./components/ActivityFeed";
import { PendingApprovals } from "./components/PendingApprovals";
import { AlertsSection } from "./components/AlertsSection";
import { CompanyStatusCards } from "./components/CompanyStatusCards";
import { SlaSettingsPanel } from "./components/SlaSettingsPanel";
import { SlaHealthSection } from "./components/SlaHealthSection";
import { BASE } from "./components/types";

export default function CommandCenter() {
  const { user } = useAuth();
  const { token } = useAuth();
  const { activity, approvals, alerts, companies, slaOverview, governanceMode, autonomyScore, opportunitySignals } = useCommandCenterData();
  const queryClient = useQueryClient();
  const searchString = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("scroll") === "approvals") {
      const tryScroll = () => {
        const el = document.getElementById("pending-approvals");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      const timer = setTimeout(tryScroll, 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [searchString]);

  if (user && user.role !== "owner" && user.role !== "admin") {
    return <Redirect to="/" />;
  }

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/opportunity-signals/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["command-center", "opportunity-signals"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/opportunity-signals/${id}/dismiss`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["command-center", "opportunity-signals"] }),
  });

  const isLoading =
    activity.isLoading || approvals.isLoading || alerts.isLoading || companies.isLoading;

  const pendingCount = approvals.data?.length || 0;
  const alertCount = alerts.data?.length || 0;
  const pendingSignals = opportunitySignals.data ?? [];
  const currentMode = governanceMode.data?.governanceMode ?? "approval_all";
  const modeStyle = GOVERNANCE_MODE_STYLES[currentMode] ?? GOVERNANCE_MODE_STYLES.approval_all;
  const ModeIcon = modeStyle.Icon;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <OnboardingChecklist />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-3">
              <LayoutDashboard className="text-primary w-7 h-7 sm:w-8 sm:h-8" />
              Command Center
            </h1>
            <p className="text-muted-foreground font-tech mt-1">
              Real-time operations view across all deployments.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant="outline"
              className={`font-tech text-xs gap-1.5 ${modeStyle.className}`}
            >
              <ModeIcon className="w-3 h-3" />
              {modeStyle.label}
            </Badge>
            {autonomyScore.data && autonomyScore.data.totalTasks > 0 && (
              <Badge
                variant="outline"
                className="font-tech text-xs text-primary border-primary/30 bg-primary/10"
              >
                {autonomyScore.data.score}% Autonomous (7d)
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-tech">
                {pendingCount} Pending
              </Badge>
            )}
            {alertCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 font-tech">
                {alertCount} Alert{alertCount !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="font-tech text-xs gap-1"
              onClick={() => {
                activity.refetch();
                approvals.refetch();
                alerts.refetch();
                companies.refetch();
                governanceMode.refetch();
                autonomyScore.refetch();
              }}
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Link href="/activity">
            <div className="p-4 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Activity Stream</p>
                    <p className="text-xs text-muted-foreground">Cross-platform unified feed</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </Link>
          <Link href="/process-studio">
            <div className="p-4 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Workflow className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Process Studio</p>
                    <p className="text-xs text-muted-foreground">Visual workflow builder</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </div>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3 border-b border-border/30">
                  <CardTitle className="text-lg flex items-center gap-2 font-tech">
                    <Activity className="w-5 h-5 text-primary" />
                    Activity Feed
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ErrorBoundary><ActivityFeed items={activity.data?.items || []} /></ErrorBoundary>
                </CardContent>
              </Card>

              <Card id="pending-approvals">
                <CardHeader className="pb-3 border-b border-border/30">
                  <CardTitle className="text-lg flex items-center gap-2 font-tech">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    Pending Approvals
                    {pendingCount > 0 && (
                      <Badge className="ml-2 bg-amber-500/20 text-amber-400 text-xs">
                        {pendingCount}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ErrorBoundary><PendingApprovals approvals={approvals.data || []} /></ErrorBoundary>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3 border-b border-border/30">
                  <CardTitle className="text-lg flex items-center gap-2 font-tech">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Alerts
                    {alertCount > 0 && (
                      <Badge className="ml-2 bg-red-500/20 text-red-400 text-xs">
                        {alertCount}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <ErrorBoundary><AlertsSection alerts={alerts.data || []} /></ErrorBoundary>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <ErrorBoundary><DashboardNotificationFeed limit={8} /></ErrorBoundary>
                </CardContent>
              </Card>
            </div>

            {pendingSignals.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-3 border-b border-amber-500/20">
                  <CardTitle className="text-lg flex items-center gap-2 font-tech">
                    <Lightbulb className="w-5 h-5 text-amber-400" />
                    Proactive Opportunity Signals
                    <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-xs">
                      {pendingSignals.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {pendingSignals.map((signal) => {
                    const pct = Math.round((signal.probabilityOfSuccess ?? 0) * 100);
                    return (
                      <div key={signal.id} className="p-4 rounded-xl border border-amber-500/20 bg-card/60">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[9px] uppercase font-tech border-amber-500/30 text-amber-400">
                                {signal.signalType.replace(/_/g, " ")}
                              </Badge>
                              <span className="text-sm font-medium truncate">{signal.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{signal.description}</p>
                            <div className="text-xs font-tech text-primary/80 bg-primary/5 border border-primary/20 rounded-lg p-2">
                              <span className="text-muted-foreground">Based on causal history (control-adjusted): </span>
                              {signal.suggestedAction}
                              {pct > 0 && (
                                <span className="ml-2 text-green-400 font-semibold">
                                  {pct}% probability of reversing this decline.
                                </span>
                              )}
                              <span className="ml-1 text-muted-foreground">Approve?</span>
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
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              className="text-xs h-7"
                              variant="ghost"
                              onClick={() => dismissMutation.mutate(signal.id)}
                              disabled={dismissMutation.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <ErrorBoundary><SlaSettingsPanel /></ErrorBoundary>

            <div>
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Company Status
              </h2>
              <ErrorBoundary><CompanyStatusCards companies={companies.data || []} /></ErrorBoundary>
            </div>

            <div>
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Bot SLA Health
                <span className="text-sm font-normal text-muted-foreground font-tech ml-1">7-day window</span>
              </h2>
              <ErrorBoundary><SlaHealthSection data={slaOverview.data} isLoading={slaOverview.isLoading} /></ErrorBoundary>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
