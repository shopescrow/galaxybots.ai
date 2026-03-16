import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  DollarSign,
  Clock,
  Zap,
  Users,
  Shield,
  CheckCircle,
  XCircle,
  LogOut,
  ChevronRight,
  FileText,
  Download,
  ArrowLeft,
  Printer,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StakeholderInfo {
  id: number;
  name: string;
  email: string;
  clientId: number;
  companyName: string;
}

interface ROIData {
  clientId: number;
  companyName: string;
  hourlyRate: number;
  totalSessions: number;
  totalHoursSaved: number;
  totalDollarsSaved: number;
  totalToolsUsed: number;
  departmentBreakdown: { name: string; sessions: number; hoursSaved: number }[];
  topBots: { name: string; sessions: number; hoursSaved: number }[];
  sessionsOverTime: { date: string; sessions: number; hoursSaved: number }[];
  recentOutcomes: {
    id: number;
    sessionId: number;
    summary: string;
    hoursSaved: number;
    department: string;
    createdAt: string;
  }[];
}

interface MissionSummary {
  id: number;
  objective: string;
  status: string;
  createdAt: string;
  teamBots: { id: number; name: string; title: string; department: string }[];
  outcome: {
    summary: string;
    hoursSaved: number;
    department: string;
  } | null;
}

interface MissionDebrief {
  session: {
    id: number;
    objective: string;
    status: string;
    createdAt: string;
  };
  messages: {
    id: number;
    botName: string | null;
    botTitle: string | null;
    role: string;
    content: string;
    createdAt: string;
  }[];
  outcome: {
    summary: string;
    hoursSaved: number;
    department: string;
    toolsUsed: number;
  } | null;
}

interface Approval {
  id: number;
  botName: string | null;
  toolName: string;
  toolInput: unknown;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

function portalFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("stakeholder_token");
  return fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  }).then(async (res) => {
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xl">
      <p className="text-xs font-tech text-muted-foreground mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-bold">
          {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}
        </p>
      ))}
    </div>
  );
}

function PinLogin({ onLogin, brandName }: { onLogin: (info: StakeholderInfo, token: string) => void; brandName?: string }) {
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"identifier" | "pin">("identifier");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isEmail = identifier.includes("@");

  const requestPin = async () => {
    setError("");
    setLoading(true);
    try {
      const body = isEmail ? { email: identifier } : { phone: identifier };
      await fetch(`${BASE}/api/client-portal/request-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStep("pin");
    } catch {
      setError("Failed to send PIN. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const verifyPin = async () => {
    setError("");
    setLoading(true);
    try {
      const body = isEmail
        ? { email: identifier, pin }
        : { phone: identifier, pin };
      const res = await fetch(`${BASE}/api/client-portal/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid PIN");
        return;
      }
      onLogin(data.stakeholder, data.token);
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Shield className="w-12 h-12 text-primary" />
          </div>
          <CardTitle className="text-2xl font-display">
            {brandName || "Client Portal"}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {step === "identifier"
              ? "Enter your email or phone to receive a one-time PIN"
              : `Enter the 6-digit PIN sent to ${isEmail ? "your email" : "your phone"}`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "identifier" ? (
            <>
              <Input
                type="text"
                placeholder="email@example.com or phone number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && identifier && requestPin()}
              />
              <Button
                className="w-full"
                onClick={requestPin}
                disabled={!identifier || loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Send PIN
              </Button>
            </>
          ) : (
            <>
              <Input
                type="text"
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && pin.length === 6 && verifyPin()}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                maxLength={6}
              />
              <Button
                className="w-full"
                onClick={verifyPin}
                disabled={pin.length !== 6 || loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify PIN
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => { setStep("identifier"); setPin(""); setError(""); }}
              >
                Use a different email or phone
              </Button>
            </>
          )}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PortalDashboard({ stakeholder, onLogout }: { stakeholder: StakeholderInfo; onLogout: () => void }) {
  const [activeView, setActiveView] = useState<"dashboard" | "debrief">("dashboard");
  const [debriefId, setDebriefId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: roi, isLoading: roiLoading } = useQuery<ROIData>({
    queryKey: ["portal-roi"],
    queryFn: () => portalFetch("/client-portal/roi"),
  });

  const { data: missions } = useQuery<MissionSummary[]>({
    queryKey: ["portal-missions"],
    queryFn: () => portalFetch("/client-portal/missions"),
  });

  const { data: pendingApprovals } = useQuery<Approval[]>({
    queryKey: ["portal-approvals"],
    queryFn: () => portalFetch("/client-portal/approvals?status=pending"),
    refetchInterval: 30000,
  });

  const { data: debrief } = useQuery<MissionDebrief>({
    queryKey: ["portal-debrief", debriefId],
    queryFn: () => portalFetch(`/client-portal/missions/${debriefId}/debrief`),
    enabled: !!debriefId,
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: number; action: "approve" | "reject"; reason?: string }) =>
      portalFetch(`/client-portal/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-approvals"] });
    },
  });

  const openDebrief = (id: number) => {
    setDebriefId(id);
    setActiveView("debrief");
  };

  const exportCSV = useCallback(() => {
    if (!roi) return;
    const rows = [
      ["Metric", "Value"],
      ["Company", roi.companyName],
      ["Total Savings ($)", roi.totalDollarsSaved.toString()],
      ["Hours Saved", roi.totalHoursSaved.toFixed(1)],
      ["Sessions Completed", roi.totalSessions.toString()],
      ["Tools Used", roi.totalToolsUsed.toString()],
      ["Hourly Rate ($)", roi.hourlyRate.toString()],
      [],
      ["Department", "Sessions", "Hours Saved", "Dollar Savings"],
      ...roi.departmentBreakdown.map((d) => [
        d.name,
        d.sessions.toString(),
        d.hoursSaved.toFixed(1),
        (d.hoursSaved * roi.hourlyRate).toFixed(0),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${roi.companyName.replace(/\s+/g, "_")}_ROI_Report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [roi]);

  const exportPDF = useCallback(() => {
    window.print();
  }, []);

  if (activeView === "debrief" && debrief) {
    return (
      <DebriefView
        debrief={debrief}
        onBack={() => { setActiveView("dashboard"); setDebriefId(null); }}
        companyName={stakeholder.companyName}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card print:border-b-2 print:border-black">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-display font-bold">{stakeholder.companyName}</h1>
            <p className="text-xs text-muted-foreground font-tech">
              Welcome, {stakeholder.name}
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={!roi}>
              <Download className="w-4 h-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={!roi}>
              <Printer className="w-4 h-4 mr-1" />
              PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-1" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {roiLoading ? (
          <div className="flex justify-center py-12 print:hidden">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : roi ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border-border/50">
                <CardContent className="p-5 text-center">
                  <DollarSign className="w-6 h-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-display font-bold">${roi.totalDollarsSaved.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total Savings</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-5 text-center">
                  <Clock className="w-6 h-6 mx-auto mb-2 text-cyan-500" />
                  <p className="text-2xl font-display font-bold">{roi.totalHoursSaved.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Hours Saved</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-5 text-center">
                  <Zap className="w-6 h-6 mx-auto mb-2 text-purple-500" />
                  <p className="text-2xl font-display font-bold">{roi.totalSessions}</p>
                  <p className="text-xs text-muted-foreground mt-1">Sessions</p>
                </CardContent>
              </Card>
              <Card className="border-border/50">
                <CardContent className="p-5 text-center">
                  <Users className="w-6 h-6 mx-auto mb-2 text-amber-500" />
                  <p className="text-2xl font-display font-bold">{roi.totalToolsUsed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Tools Used</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
              {roi.sessionsOverTime.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Activity Over Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={roi.sessionsOverTime}>
                        <defs>
                          <linearGradient id="portalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" fill="url(#portalGrad)" strokeWidth={2} name="Sessions" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {roi.departmentBreakdown.length > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Savings by Department</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={roi.departmentBreakdown.map((d) => ({
                        name: d.name,
                        dollarsSaved: Math.round(d.hoursSaved * roi.hourlyRate),
                      }))}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="dollarsSaved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="$ Saved" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="hidden print:block">
              <h3 className="text-sm font-bold mb-2">Department Breakdown</h3>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left py-1">Department</th>
                    <th className="text-right py-1">Sessions</th>
                    <th className="text-right py-1">Hours Saved</th>
                    <th className="text-right py-1">$ Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {roi.departmentBreakdown.map((d) => (
                    <tr key={d.name} className="border-b border-gray-300">
                      <td className="py-1">{d.name}</td>
                      <td className="text-right py-1">{d.sessions}</td>
                      <td className="text-right py-1">{d.hoursSaved.toFixed(1)}</td>
                      <td className="text-right py-1">${Math.round(d.hoursSaved * roi.hourlyRate).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {pendingApprovals && pendingApprovals.length > 0 && (
          <div className="print:hidden">
            <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              Pending Approvals
              <Badge variant="secondary" className="ml-1">{pendingApprovals.length}</Badge>
            </h2>
            <div className="space-y-3">
              {pendingApprovals.map((approval) => (
                <Card key={approval.id} className="border-border/50">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{approval.toolName}</span>
                          <Badge variant="secondary">pending</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Requested by {approval.botName || "Unknown"} &middot;{" "}
                          {new Date(approval.createdAt).toLocaleString()}
                        </p>
                        {approval.toolInput ? (
                          <pre className="text-xs text-muted-foreground mt-2 bg-muted/30 p-2 rounded max-h-20 overflow-auto">
                            {JSON.stringify(approval.toolInput as Record<string, unknown>, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                      <div className="flex gap-2 shrink-0 ml-4">
                        <Button
                          size="sm"
                          onClick={() => approvalMutation.mutate({ id: approval.id, action: "approve" })}
                          disabled={approvalMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => approvalMutation.mutate({ id: approval.id, action: "reject" })}
                          disabled={approvalMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {missions && missions.length > 0 && (
          <div>
            <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary print:hidden" />
              Recent Missions
            </h2>
            <div className="space-y-3">
              {missions.map((mission) => (
                <Card
                  key={mission.id}
                  className="border-border/50 hover:border-primary/30 transition-colors cursor-pointer print:cursor-default print:hover:border-border/50"
                  onClick={() => openDebrief(mission.id)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{mission.objective}</span>
                          <Badge variant={mission.status === "active" ? "default" : "secondary"} className="text-[10px]">
                            {mission.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{new Date(mission.createdAt).toLocaleDateString()}</span>
                          {mission.teamBots.length > 0 && (
                            <span>{mission.teamBots.map((b) => b.name).join(", ")}</span>
                          )}
                          {mission.outcome && (
                            <span className="text-primary">{mission.outcome.hoursSaved.toFixed(1)} hrs saved</span>
                          )}
                        </div>
                        {mission.outcome?.summary && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {mission.outcome.summary}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2 print:hidden" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border/30 mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          Powered by <span className="text-primary font-tech">{stakeholder.companyName}</span>
        </div>
      </footer>
    </div>
  );
}

function DebriefView({ debrief, onBack, companyName }: { debrief: MissionDebrief; onBack: () => void; companyName: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="print:hidden">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
          </Button>
          <span className="hidden print:block text-sm font-bold">{companyName} - Mission Debrief</span>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
            <Printer className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-display font-bold">{debrief.session.objective}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(debrief.session.createdAt).toLocaleString()} &middot;{" "}
            <Badge variant={debrief.session.status === "active" ? "default" : "secondary"} className="text-[10px]">
              {debrief.session.status}
            </Badge>
          </p>
        </div>

        {debrief.outcome && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-5">
              <h3 className="text-sm font-tech text-primary uppercase mb-2">Outcome Summary</h3>
              <p className="text-sm leading-relaxed">{debrief.outcome.summary}</p>
              <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                {debrief.outcome.department && (
                  <Badge variant="outline" className="text-[10px]">{debrief.outcome.department}</Badge>
                )}
                <span>{debrief.outcome.hoursSaved.toFixed(1)} hours saved</span>
                <span>{debrief.outcome.toolsUsed} tools used</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Conversation Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {debrief.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg ${
                    msg.role === "user"
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-muted/30 border border-border/30"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-tech font-bold">
                      {msg.botName || "User"}
                    </span>
                    {msg.botTitle && (
                      <span className="text-[10px] text-muted-foreground">{msg.botTitle}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
              {debrief.messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No messages in this session.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function ClientPortal() {
  const [stakeholder, setStakeholder] = useState<StakeholderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("stakeholder_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetch(`${BASE}/api/client-portal/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setStakeholder(data);
        } else {
          localStorage.removeItem("stakeholder_token");
        }
      })
      .catch(() => {
        localStorage.removeItem("stakeholder_token");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogin = (info: StakeholderInfo, token: string) => {
    localStorage.setItem("stakeholder_token", token);
    setStakeholder(info);
  };

  const handleLogout = () => {
    localStorage.removeItem("stakeholder_token");
    setStakeholder(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stakeholder) {
    return <PinLogin onLogin={handleLogin} />;
  }

  return <PortalDashboard stakeholder={stakeholder} onLogout={handleLogout} />;
}
