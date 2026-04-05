import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building,
  ExternalLink,
  ShieldCheck,
  XCircle,
  Zap,
  LayoutDashboard,
  RefreshCw,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Timer,
  Workflow,
  ArrowRight,
  Settings,
  Save,
  BarChart3,
  Shield,
  Eye,
  Lock,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Redirect, useSearch } from "wouter";
import OnboardingChecklist from "@/components/onboarding/OnboardingChecklist";
import { DashboardNotificationFeed } from "@/components/notifications/DashboardNotificationFeed";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ActivityItem = {
  id: number;
  type: string;
  clientId: number | null;
  action: string;
  resource: string | null;
  botName: string | null;
  metadata: unknown;
  createdAt: string;
};

type Approval = {
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

type Alert = {
  id: number;
  assignmentId: number;
  botId: number;
  botName: string;
  clientId: number | null;
  summary: string;
  runStatus: string;
  createdAt: string;
};

type CompanyCard = {
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

type UnifiedActivityEvent = {
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

function useCommandCenterData() {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const activity = useQuery<{ items: UnifiedActivityEvent[]; total: number }>({
    queryKey: ["command-center", "activity-unified"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/activity?limit=30`, { headers });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const approvals = useQuery<Approval[]>({
    queryKey: ["command-center", "approvals"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/approvals?status=pending`, { headers });
      if (!res.ok) throw new Error("Failed to load approvals");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const alerts = useQuery<Alert[]>({
    queryKey: ["command-center", "alerts"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/alerts?limit=20`, { headers });
      if (!res.ok) throw new Error("Failed to load alerts");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const companies = useQuery<CompanyCard[]>({
    queryKey: ["command-center", "companies"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/command-center/companies`, { headers });
      if (!res.ok) throw new Error("Failed to load companies");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const slaOverview = useQuery<{
    overallComplianceRate: number;
    totalEvents: number;
    totalBreached: number;
    bots: Array<{ botId: number; botName: string; total: number; breached: number; complianceRate: number; status: "green" | "yellow" | "red" }>;
  }>({
    queryKey: ["command-center", "sla-overview"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/sla-overview`, { headers });
      if (!res.ok) throw new Error("Failed to load SLA overview");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const governanceMode = useQuery<{ governanceMode: string }>({
    queryKey: ["governance", "mode"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/governance/mode`, { headers });
      if (!res.ok) throw new Error("Failed to load governance mode");
      return res.json();
    },
  });

  const autonomyScore = useQuery<{ score: number; totalTasks: number; autonomousTasks: number }>({
    queryKey: ["governance", "autonomy-score"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/governance/autonomy-score`, { headers });
      if (!res.ok) return { score: 100, totalTasks: 0, autonomousTasks: 0 };
      return res.json();
    },
    refetchInterval: 60000,
  });

  return { activity, approvals, alerts, companies, slaOverview, governanceMode, autonomyScore };
}

function formatTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function formatToolName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  info: <Activity className="w-3.5 h-3.5 text-blue-400" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  critical: <XCircle className="w-3.5 h-3.5 text-red-400" />,
};

function ActivityFeed({ items }: { items: UnifiedActivityEvent[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Activity className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No recent activity recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary/30 transition-colors"
        >
          <div className="mt-0.5 shrink-0">
            {SEVERITY_ICON[item.severity] ?? <Activity className="w-3.5 h-3.5 text-blue-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm truncate">{item.description}</p>
              {item.link && (
                <Link href={item.link}>
                  <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground shrink-0" />
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatTime(item.timestamp)}
              <Badge variant="secondary" className="text-[9px]">
                {item.source}
              </Badge>
              {item.clientName && (
                <span className="truncate">{item.clientName}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getSlaUrgency(
  slaDeadline: string | null | undefined,
  createdAt: string,
  isTimeSensitive?: boolean | null,
): { color: string; label: string; pct: number } {
  if (!slaDeadline) return { color: "text-green-400", label: "", pct: 100 };
  const now = Date.now();
  const deadline = new Date(slaDeadline).getTime();
  const created = new Date(createdAt).getTime();
  const remaining = deadline - now;
  if (remaining <= 0) return { color: "text-red-400", label: "SLA BREACHED", pct: 0 };
  const totalWindow = deadline - created;
  const windowMs = totalWindow > 0 ? totalWindow : (isTimeSensitive ? 60 : 240) * 60 * 1000;
  const pct = Math.max(0, Math.min(100, (remaining / windowMs) * 100));
  const mins = Math.round(remaining / 60000);
  if (mins < 30) return { color: "text-red-400", label: `${mins}m left`, pct };
  if (mins < 120) return { color: "text-amber-400", label: `${mins}m left`, pct };
  const hours = Math.round(mins / 60);
  return { color: "text-green-400", label: `${hours}h left`, pct };
}

function PendingApprovals({ approvals }: { approvals: Approval[] }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<number | null>(null);

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/governance/approvals/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Approval failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center", "approvals"] });
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/governance/approvals/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Declined from Command Center" }),
      });
      if (!res.ok) throw new Error("Rejection failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center", "approvals"] });
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  if (approvals.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No pending approvals. All clear.</p>
      </div>
    );
  }

  const sorted = [...approvals].sort((a, b) => {
    const aDeadline = a.slaDeadline ? new Date(a.slaDeadline).getTime() : Infinity;
    const bDeadline = b.slaDeadline ? new Date(b.slaDeadline).getTime() : Infinity;
    return aDeadline - bDeadline;
  });

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {sorted.map((a) => {
        const sla = getSlaUrgency(a.slaDeadline, a.createdAt, a.isTimeSensitive);
        const isBreached = a.slaDeadline && new Date(a.slaDeadline).getTime() < Date.now();
        const borderColor = isBreached ? "border-red-500/40 bg-red-500/5" : a.isTimeSensitive ? "border-amber-500/30 bg-amber-500/5" : "border-amber-500/20 bg-amber-500/5";
        return (
          <div key={a.id} className={`p-4 rounded-xl border ${borderColor}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-4 h-4 shrink-0 ${isBreached ? "text-red-400" : "text-amber-400"}`} />
                  <span className="text-sm font-medium truncate">{formatToolName(a.toolName)}</span>
                  {a.isTimeSensitive && (
                    <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-500/30 shrink-0">
                      TIME-SENSITIVE
                    </Badge>
                  )}
                </div>
                {a.botName && (
                  <p className="text-xs text-muted-foreground ml-6">Requested by {a.botName}</p>
                )}
                <div className="flex items-center gap-3 ml-6 mt-1">
                  <p className="text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {formatTime(a.createdAt)}
                  </p>
                  {sla.label && (
                    <p className={`text-xs font-medium flex items-center gap-1 ${sla.color}`}>
                      <Timer className="w-3 h-3" />
                      {sla.label}
                    </p>
                  )}
                </div>
                {a.slaDeadline && (
                  <div className="ml-6 mt-2">
                    <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sla.pct <= 10 ? "bg-red-500" : sla.pct <= 40 ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ width: `${sla.pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-tech h-8 text-green-400 border-green-500/30 hover:bg-green-500/10"
                  disabled={processingId === a.id}
                  onClick={() => {
                    setProcessingId(a.id);
                    approveMutation.mutate(a.id);
                  }}
                >
                  {processingId === a.id && approveMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs font-tech h-8 text-red-400 border-red-500/30 hover:bg-red-500/10"
                  disabled={processingId === a.id}
                  onClick={() => {
                    setProcessingId(a.id);
                    rejectMutation.mutate(a.id);
                  }}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertsSection({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No alerts. All systems operational.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3 rounded-xl border ${
            alert.runStatus === "failed"
              ? "border-red-500/20 bg-red-500/5"
              : "border-amber-500/20 bg-amber-500/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                alert.runStatus === "failed" ? "text-red-400" : "text-amber-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium">{alert.botName}</span>
                <Badge
                  variant="outline"
                  className={`text-[9px] ${
                    alert.runStatus === "failed"
                      ? "text-red-400 border-red-500/30"
                      : "text-amber-400 border-amber-500/30"
                  }`}
                >
                  {alert.runStatus.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {alert.summary}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatTime(alert.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const HEALTH_TAG_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  healthy: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30", label: "HEALTHY" },
  at_risk: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30", label: "AT RISK" },
  critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30", label: "CRITICAL" },
};

function HealthTrendIcon({ trend }: { trend: string | null }) {
  if (trend === "improving") return <TrendingUp className="w-3 h-3 text-green-400" />;
  if (trend === "declining") return <TrendingDown className="w-3 h-3 text-red-400" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function CompanyStatusCards({ companies }: { companies: CompanyCard[] }) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Building className="w-8 h-8 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-tech">No companies found.</p>
      </div>
    );
  }

  const sorted = [...companies].sort((a, b) => {
    const tagOrder: Record<string, number> = { critical: 0, at_risk: 1, healthy: 2 };
    const aOrder = a.healthTag ? (tagOrder[a.healthTag] ?? 3) : 3;
    const bOrder = b.healthTag ? (tagOrder[b.healthTag] ?? 3) : 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.healthScore ?? 100) - (b.healthScore ?? 100);
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sorted.map((company) => {
        const tagStyle = company.healthTag ? HEALTH_TAG_STYLES[company.healthTag] : null;
        const isCritical = company.healthTag === "critical";

        return (
          <Card
            key={company.id}
            className={`hover:border-primary/40 transition-colors ${
              isCritical ? "border-red-500/40 ring-1 ring-red-500/20" : ""
            }`}
          >
            <CardHeader className="pb-3 border-b border-border/30">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 min-w-0">
                  {isCritical && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
                  <CardTitle className="text-base truncate">{company.companyName}</CardTitle>
                </div>
                <Badge
                  variant={
                    company.status === "active"
                      ? "cyan"
                      : company.status === "trial"
                        ? "outline"
                        : "secondary"
                  }
                >
                  {company.status.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase text-gold border-gold/30 bg-gold/5"
                >
                  {company.plan} TIER
                </Badge>
                {tagStyle && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${tagStyle.text} ${tagStyle.border} ${tagStyle.bg}`}
                  >
                    <Heart className="w-3 h-3 mr-1" />
                    {company.healthScore !== null ? company.healthScore : "—"} {tagStyle.label}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              {company.healthScore !== null && (
                <div className="flex justify-between text-muted-foreground items-center">
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    Health
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          company.healthScore >= 70 ? "bg-green-500" :
                          company.healthScore >= 40 ? "bg-yellow-500" :
                          "bg-red-500"
                        }`}
                        style={{ width: `${company.healthScore}%` }}
                      />
                    </div>
                    <span className="text-foreground font-medium text-xs">{company.healthScore}</span>
                    <HealthTrendIcon trend={company.healthTrend} />
                  </div>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Active Sessions</span>
                <span className="text-foreground font-medium">{company.activeSessions}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Last Bot Action</span>
                <span className="text-foreground text-xs">
                  {company.lastBotAction
                    ? formatTime(company.lastBotAction)
                    : "None"}
                </span>
              </div>
              {company.lastToolName && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Last Tool</span>
                  <span className="text-foreground text-xs truncate ml-2">
                    {formatToolName(company.lastToolName)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Next Scheduled</span>
                <span className="text-foreground text-xs">
                  {company.nextScheduledRun
                    ? formatTime(company.nextScheduledRun)
                    : "None"}
                </span>
              </div>
              <div className="pt-3 border-t border-border/30">
                <Link href={`/clients/${company.id}`}>
                  <Button variant="outline" size="sm" className="w-full font-tech text-xs gap-1">
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

type SlaConfig = {
  defaultSlaMinutes: number;
  timeSensitiveSlaMinutes: number;
  secondaryApproverEmail: string | null;
  trustedCategories: string[];
};

function SlaSettingsPanel() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: slaConfig, isLoading } = useQuery<SlaConfig>({
    queryKey: ["sla-config"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/approval-sla-config`, { headers });
      if (!res.ok) return { defaultSlaMinutes: 240, timeSensitiveSlaMinutes: 60, secondaryApproverEmail: null, trustedCategories: [] };
      return res.json();
    },
  });

  const [defaultSla, setDefaultSla] = useState<string>("");
  const [timeSensitiveSla, setTimeSensitiveSla] = useState<string>("");
  const [secondaryEmail, setSecondaryEmail] = useState<string>("");
  const [trustedCats, setTrustedCats] = useState<string>("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (slaConfig && !initialized) {
      setDefaultSla(String(slaConfig.defaultSlaMinutes));
      setTimeSensitiveSla(String(slaConfig.timeSensitiveSlaMinutes));
      setSecondaryEmail(slaConfig.secondaryApproverEmail ?? "");
      setTrustedCats((slaConfig.trustedCategories ?? []).join(", "));
      setInitialized(true);
    }
  }, [slaConfig, initialized]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/approval-sla-config`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          defaultSlaMinutes: Number(defaultSla) || 240,
          timeSensitiveSlaMinutes: Number(timeSensitiveSla) || 60,
          secondaryApproverEmail: secondaryEmail || null,
          trustedCategories: trustedCats.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("Failed to save SLA settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla-config"] });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-border/30">
        <CardTitle className="text-lg flex items-center gap-2 font-tech">
          <Settings className="w-5 h-5 text-primary" />
          Approval SLA Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default SLA (minutes)</label>
                <Input
                  type="number"
                  value={defaultSla}
                  onChange={(e) => setDefaultSla(e.target.value)}
                  placeholder="240"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Standard approval deadline. Default: 240 min (4h)</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time-Sensitive SLA (minutes)</label>
                <Input
                  type="number"
                  value={timeSensitiveSla}
                  onChange={(e) => setTimeSensitiveSla(e.target.value)}
                  placeholder="60"
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">For email/SMS/invoice tools. Default: 60 min (1h)</p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Secondary Approver Email</label>
              <Input
                type="email"
                value={secondaryEmail}
                onChange={(e) => setSecondaryEmail(e.target.value)}
                placeholder="manager@company.com"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Receives email when SLA is breached</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trusted Categories (auto-approved)</label>
              <Input
                value={trustedCats}
                onChange={(e) => setTrustedCats(e.target.value)}
                placeholder="web_search, read_email"
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Comma-separated tool names that bypass approval queue</p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 font-tech"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Settings
            </Button>
            {saveMutation.isSuccess && (
              <p className="text-xs text-green-400">Settings saved successfully</p>
            )}
            {saveMutation.isError && (
              <p className="text-xs text-red-400">Failed to save settings</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const GOVERNANCE_MODE_STYLES: Record<string, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  approval_all: {
    label: "APPROVAL ALL",
    className: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    Icon: Lock,
  },
  exception_only: {
    label: "EXCEPTION ONLY",
    className: "text-blue-400 border-blue-500/30 bg-blue-500/10",
    Icon: Shield,
  },
  observe_only: {
    label: "OBSERVE ONLY",
    className: "text-green-400 border-green-500/30 bg-green-500/10",
    Icon: Eye,
  },
};

export default function CommandCenter() {
  const { user } = useAuth();
  const { activity, approvals, alerts, companies, slaOverview, governanceMode, autonomyScore } = useCommandCenterData();
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
  }, [searchString]);

  if (user && user.role !== "owner" && user.role !== "admin") {
    return <Redirect to="/" />;
  }

  const isLoading =
    activity.isLoading || approvals.isLoading || alerts.isLoading || companies.isLoading;

  const pendingCount = approvals.data?.length || 0;
  const alertCount = alerts.data?.length || 0;
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
                  <ActivityFeed items={activity.data?.items || []} />
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
                  <PendingApprovals approvals={approvals.data || []} />
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
                  <AlertsSection alerts={alerts.data || []} />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <DashboardNotificationFeed limit={8} />
                </CardContent>
              </Card>
            </div>

            <SlaSettingsPanel />

            <div>
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <Building className="w-5 h-5 text-primary" />
                Company Status
              </h2>
              <CompanyStatusCards companies={companies.data || []} />
            </div>

            <div>
              <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Bot SLA Health
                <span className="text-sm font-normal text-muted-foreground font-tech ml-1">7-day window</span>
              </h2>
              <SlaHealthSection data={slaOverview.data} isLoading={slaOverview.isLoading} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

type SlaBot = { botId: number; botName: string; total: number; breached: number; complianceRate: number; status: "green" | "yellow" | "red" };

function SlaHealthSection({ data, isLoading }: {
  data?: { overallComplianceRate: number; totalEvents: number; totalBreached: number; bots: SlaBot[] };
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || data.totalEvents === 0) {
    return (
      <Card className="border-border/40">
        <CardContent className="py-10 text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-tech text-muted-foreground">No SLA events recorded yet. Directives sent to bots will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  const underperforming = data.bots.filter((b) => b.status === "red");

  return (
    <div className="space-y-4">
      {underperforming.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {underperforming.map((bot) => (
              <p key={bot.botId} className="text-sm text-red-300">
                <Link href={`/bots/${bot.botId}`} className="font-medium hover:underline">{bot.botName}</Link>
                {" "}is underperforming SLA targets ({bot.complianceRate}% compliance) — review recent sessions.
              </p>
            ))}
          </div>
        </div>
      )}

      <Card className="border-border/40">
        <CardHeader className="pb-3 border-b border-border/30">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-tech">Platform SLA Overview (7d)</CardTitle>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${data.overallComplianceRate >= 95 ? "text-green-400" : data.overallComplianceRate >= 85 ? "text-yellow-400" : "text-red-400"}`}>
                {data.overallComplianceRate}%
              </span>
              <span className="text-xs text-muted-foreground">overall compliance</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {data.bots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No bot SLA data available.</p>
          ) : (
            <div className="space-y-2">
              {data.bots.map((bot) => (
                <Link key={bot.botId} href={`/bots/${bot.botId}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30 transition-colors cursor-pointer gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        bot.status === "green" ? "bg-green-400" : bot.status === "yellow" ? "bg-yellow-400" : "bg-red-400"
                      }`} />
                      <span className="text-sm truncate">{bot.botName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span>{bot.total} events</span>
                      <span>{bot.breached} breached</span>
                      <Badge
                        className={`text-xs ${
                          bot.status === "green"
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : bot.status === "yellow"
                            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            : "bg-red-500/20 text-red-400 border-red-500/30"
                        }`}
                      >
                        {bot.complianceRate}%
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
