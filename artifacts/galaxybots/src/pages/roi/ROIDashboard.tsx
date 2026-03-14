import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import {
  Loader2,
  ArrowLeft,
  DollarSign,
  Clock,
  Zap,
  Users,
  TrendingUp,
  Share2,
  FileText,
  ChevronRight,
  BarChart3,
  Copy,
  Check,
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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 270 50% 60%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 12 76% 61%))",
];

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
  topTools: { name: string; count: number }[];
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

interface BriefingData {
  clientId: number;
  companyName: string;
  briefing: string;
  highlights: string[];
  recommendation: string;
  metrics?: {
    sessions: number;
    hoursSaved: number;
    dollarsSaved: number;
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
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
          <div className={`p-2.5 rounded-xl bg-${color}/10 border border-${color}/20`}>
            <Icon className={`w-5 h-5 text-${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

export default function ROIDashboard() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [newRate, setNewRate] = useState("");

  const { data: roi, isLoading } = useQuery<ROIData>({
    queryKey: ["roi", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/roi/client/${clientId}`);
      if (!res.ok) throw new Error("Failed to fetch ROI data");
      return res.json();
    },
    enabled: !isNaN(clientId),
  });

  const { data: briefing, isLoading: briefingLoading } = useQuery<BriefingData>({
    queryKey: ["briefing", clientId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/roi/client/${clientId}/briefing`);
      if (!res.ok) throw new Error("Failed to fetch briefing");
      return res.json();
    },
    enabled: !isNaN(clientId),
  });

  const updateRate = useMutation({
    mutationFn: async (rate: number) => {
      const res = await fetch(`${BASE}/api/roi/client/${clientId}/hourly-rate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate: rate }),
      });
      if (!res.ok) throw new Error("Failed to update hourly rate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roi", clientId] });
      setRateDialogOpen(false);
      setNewRate("");
    },
  });

  const shareReport = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const res = await fetch(`${BASE}/api/roi/client/${clientId}/shareable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateFrom: threeMonthsAgo.toISOString(),
          dateTo: now.toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to create shareable report");
      return res.json();
    },
    onSuccess: (data) => {
      const url = `${window.location.origin}${BASE}/roi/shared/${data.shareToken}`;
      setShareUrl(url);
      setShareDialogOpen(true);
    },
  });

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!roi) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">No ROI data available.</p>
          <Link href="/clients">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Clients
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const deptChartData = roi.departmentBreakdown.map((d) => ({
    name: d.name,
    sessions: d.sessions,
    hoursSaved: Math.round(d.hoursSaved * 10) / 10,
    dollarsSaved: Math.round(d.hoursSaved * roi.hourlyRate),
  }));

  const botPieData = roi.topBots.map((b) => ({
    name: b.name,
    value: Math.round(b.hoursSaved * 10) / 10,
  }));

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center gap-3 mb-6">
          <Link href={`/clients/${clientId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5">
                <BarChart3 className="w-3 h-3 mr-1" />
                Value Report
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">
              {roi.companyName} — <span className="text-gradient">ROI Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-tech">
              Proof-of-Value metrics for your AI executive team
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setNewRate(String(roi?.hourlyRate || 150))}>
                  <DollarSign className="w-4 h-4 mr-1" />
                  ${roi?.hourlyRate || 150}/hr
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure Hourly Rate</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Set the hourly rate used to calculate dollar savings. This represents the cost of equivalent human labor.
                  </p>
                  <div className="space-y-2">
                    <Label>Hourly Rate ($)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                      placeholder="150"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      const rate = parseFloat(newRate);
                      if (!isNaN(rate) && rate >= 0) updateRate.mutate(rate);
                    }}
                    disabled={updateRate.isPending}
                  >
                    {updateRate.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Update Rate
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shareReport.mutate()}
                  disabled={shareReport.isPending}
                >
                  {shareReport.isPending ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4 mr-1" />
                  )}
                  Share Report
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Shareable Value Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Share this link with stakeholders for a board-ready view of your AI team's ROI.
                  </p>
                  <div className="flex gap-2">
                    <Input value={shareUrl} readOnly className="text-xs" />
                    <Button size="sm" variant="outline" onClick={copyUrl}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={DollarSign}
            label="Total Savings"
            value={`$${roi.totalDollarsSaved.toLocaleString()}`}
            subtitle={`@ $${roi.hourlyRate}/hr`}
            color="primary"
          />
          <StatCard
            icon={Clock}
            label="Hours Saved"
            value={roi.totalHoursSaved.toFixed(1)}
            subtitle="Estimated time savings"
            color="cyan"
          />
          <StatCard
            icon={Zap}
            label="Sessions Completed"
            value={String(roi.totalSessions)}
            subtitle="Task sessions run"
            color="purple"
          />
          <StatCard
            icon={Users}
            label="Tools Executed"
            value={String(roi.totalToolsUsed)}
            subtitle="Integrations & actions"
            color="gold"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Sessions Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roi.sessionsOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={roi.sessionsOverTime}>
                    <defs>
                      <linearGradient id="sessionsGrad" x1="0" y1="0" x2="0" y2="1">
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
                    <Area
                      type="monotone"
                      dataKey="sessions"
                      stroke="hsl(var(--primary))"
                      fill="url(#sessionsGrad)"
                      strokeWidth={2}
                      name="Sessions"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No session data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Savings by Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deptChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={deptChartData}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="dollarsSaved"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      name="$ Saved"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No department data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Top Performing Bots
              </CardTitle>
            </CardHeader>
            <CardContent>
              {botPieData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={botPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {botPieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-3 mt-2 justify-center">
                    {botPieData.map((b, i) => (
                      <div key={b.name} className="flex items-center gap-1.5 text-xs">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No bot data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Most Used Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roi.topTools.length > 0 ? (
                <div className="space-y-3">
                  {roi.topTools.slice(0, 6).map((tool) => (
                    <div key={tool.name} className="flex items-center justify-between">
                      <span className="text-sm truncate mr-2">{tool.name.replace(/_/g, " ")}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${Math.min(100, (tool.count / Math.max(...roi.topTools.map((t) => t.count))) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-tech text-muted-foreground w-8 text-right">
                          {tool.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
                  No tool data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Weekly Executive Briefing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {briefingLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating briefing...</span>
                </div>
              ) : briefing ? (
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed">{briefing.briefing}</p>
                  {briefing.highlights && briefing.highlights.length > 0 && (
                    <div className="space-y-1.5">
                      {briefing.highlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <TrendingUp className="w-3 h-3 mt-0.5 text-primary shrink-0" />
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {briefing.recommendation && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs font-tech text-primary mb-1">RECOMMENDATION</p>
                      <p className="text-sm">{briefing.recommendation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No briefing data available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {roi.recentOutcomes.length > 0 && (
          <Card className="border-border/50 mb-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider">
                Recent Session Outcomes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {roi.recentOutcomes.map((outcome) => (
                  <div
                    key={outcome.id}
                    className="flex items-start gap-4 p-4 rounded-xl border border-border/30 hover:border-border/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{outcome.summary}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground font-tech">
                        {outcome.department && (
                          <Badge variant="outline" className="text-[10px]">
                            {outcome.department}
                          </Badge>
                        )}
                        <span>{outcome.hoursSaved.toFixed(1)} hrs saved</span>
                        <span>
                          {new Date(outcome.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <Link href={`/task-rooms/${outcome.sessionId}`}>
                      <Button variant="ghost" size="sm">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
