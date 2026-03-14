import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  Loader2,
  DollarSign,
  Clock,
  Zap,
  Users,
  TrendingUp,
  BarChart3,
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

interface ReportData {
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
    summary: string;
    hoursSaved: number;
    department: string;
    createdAt: string;
  }[];
}

interface SharedReport {
  id: number;
  clientId: number;
  shareToken: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  reportData: ReportData;
  recommendation: string;
  createdAt: string;
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

export default function SharedReport() {
  const params = useParams<{ token: string }>();

  const { data: report, isLoading } = useQuery<SharedReport>({
    queryKey: ["shared-report", params.token],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/roi/shared/${params.token}`);
      if (!res.ok) throw new Error("Report not found");
      return res.json();
    },
    enabled: !!params.token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-display font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground">This report may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const roi = report.reportData;
  const dateRange = `${new Date(report.dateFrom).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} — ${new Date(report.dateTo).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

  const deptChartData = roi.departmentBreakdown.map((d) => ({
    name: d.name,
    dollarsSaved: Math.round(d.hoursSaved * roi.hourlyRate),
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="text-center mb-12">
          <Badge variant="outline" className="text-[10px] uppercase text-primary border-primary/30 bg-primary/5 mb-4">
            <BarChart3 className="w-3 h-3 mr-1" />
            Proof of Value Report
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">{report.title}</h1>
          <p className="text-muted-foreground font-tech text-sm">{dateRange}</p>
          <p className="text-xs text-muted-foreground mt-2">Powered by GalaxyBots.ai</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <Card className="border-border/50 text-center">
            <CardContent className="p-5">
              <DollarSign className="w-6 h-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-display font-bold">${roi.totalDollarsSaved.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Savings</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 text-center">
            <CardContent className="p-5">
              <Clock className="w-6 h-6 mx-auto mb-2 text-cyan" />
              <p className="text-2xl font-display font-bold">{roi.totalHoursSaved.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">Hours Saved</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 text-center">
            <CardContent className="p-5">
              <Zap className="w-6 h-6 mx-auto mb-2 text-purple" />
              <p className="text-2xl font-display font-bold">{roi.totalSessions}</p>
              <p className="text-xs text-muted-foreground mt-1">Sessions</p>
            </CardContent>
          </Card>
          <Card className="border-border/50 text-center">
            <CardContent className="p-5">
              <Users className="w-6 h-6 mx-auto mb-2 text-gold" />
              <p className="text-2xl font-display font-bold">{roi.totalToolsUsed}</p>
              <p className="text-xs text-muted-foreground mt-1">Tools Used</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          {roi.sessionsOverTime.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Activity Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={roi.sessionsOverTime}>
                    <defs>
                      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" fill="url(#sg)" strokeWidth={2} name="Sessions" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {deptChartData.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Savings by Department</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={deptChartData}>
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

        {roi.recentOutcomes && roi.recentOutcomes.length > 0 && (
          <Card className="border-border/50 mb-10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-tech text-muted-foreground uppercase">Session Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {roi.recentOutcomes.slice(0, 5).map((o) => (
                  <div key={o.id} className="p-3 rounded-lg border border-border/30">
                    <p className="text-sm">{o.summary}</p>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {o.department && <Badge variant="outline" className="text-[10px]">{o.department}</Badge>}
                      <span>{o.hoursSaved.toFixed(1)} hrs saved</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {report.recommendation && (
          <Card className="border-primary/20 bg-primary/5 mb-10">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-tech text-primary mb-2 uppercase tracking-wider">What's Next</p>
                  <p className="text-sm leading-relaxed">{report.recommendation}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground py-8 border-t border-border/30">
          <p>Generated by <span className="text-primary font-tech">GalaxyBots.ai</span> Proof-of-Value Engine</p>
        </div>
      </div>
    </div>
  );
}
