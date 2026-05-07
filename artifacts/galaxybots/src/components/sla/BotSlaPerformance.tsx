import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Target, Clock, TrendingUp, AlertTriangle, CheckCircle2, Edit2, Save, X } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SlaData {
  botId: number;
  clientId: number;
  period: string;
  targets: {
    responseTargetMs: number;
    completionTargetMinutes: number;
    tier: string;
    hasOverride: boolean;
  };
  tier: {
    id: string;
    name: string;
    responseTargetMs: number;
    completionTargetMinutes: number;
    escalationChannels: string[];
  };
  responseCompliance: {
    rate: number | null;
    met: number;
    total: number;
    avgResponseMs: number | null;
    p95ResponseMs: number | null;
    avgHoldMs: number;
  };
  completionCompliance: {
    rate: number | null;
    met: number;
    total: number;
  };
  recentBreaches: Array<{
    id: number;
    sessionId: number | null;
    eventType: string;
    directedAt: string;
    resolvedAt: string | null;
    netDurationMs: number | null;
    targetMs: number;
    tier: string;
  }>;
  trendData: Array<{
    date: string;
    avgResponseMs: number | null;
    total: number;
    breached: number;
  }>;
}

function msToDisplay(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function complianceBadge(rate: number | null) {
  if (rate === null) return <Badge variant="outline" className="text-muted-foreground">No data</Badge>;
  if (rate >= 95) return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">{rate}% ✓</Badge>;
  if (rate >= 85) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">{rate}%</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{rate}%</Badge>;
}

export function BotSlaPerformance({ botId, isAdmin }: { botId: number; isAdmin: boolean }) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [editing, setEditing] = useState(false);
  const [editResponse, setEditResponse] = useState("");
  const [editCompletion, setEditCompletion] = useState("");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const { data: sla, isLoading } = useQuery<SlaData>({
    queryKey: ["bot-sla", botId, period],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/bots/${botId}/sla?period=${period}`, { headers });
      if (!res.ok) throw new Error("Failed to load SLA data");
      return res.json();
    },
  });

  const updateSla = useMutation({
    mutationFn: async (data: { responseTargetMs?: number; completionTargetMinutes?: number }) => {
      const res = await fetch(`${BASE}/api/bots/${botId}/sla`, {
        method: "PUT",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update SLA");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-sla", botId] });
      setEditing(false);
    },
  });

  const handleSave = () => {
    const payload: { responseTargetMs?: number; completionTargetMinutes?: number } = {};
    if (editResponse) payload.responseTargetMs = Math.round(parseFloat(editResponse) * 1000);
    if (editCompletion) payload.completionTargetMinutes = parseInt(editCompletion);
    updateSla.mutate(payload);
  };

  const handleEdit = () => {
    if (sla) {
      setEditResponse(String(Math.round(sla.targets.responseTargetMs / 1000)));
      setEditCompletion(String(sla.targets.completionTargetMinutes));
    }
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sla) return <div className="text-muted-foreground text-sm py-8 text-center">Failed to load SLA data</div>;

  const responseTargetSec = Math.round(sla.targets.responseTargetMs / 1000);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-tech text-xs">
            {sla.tier.name} Tier
          </Badge>
          <div className="flex gap-1">
            <Button
              variant={period === "7d" ? "glow" : "ghost"}
              size="sm"
              className="text-xs font-tech h-7"
              onClick={() => setPeriod("7d")}
            >
              7 days
            </Button>
            <Button
              variant={period === "30d" ? "glow" : "ghost"}
              size="sm"
              className="text-xs font-tech h-7"
              onClick={() => setPeriod("30d")}
            >
              30 days
            </Button>
          </div>
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleEdit}>
            <Edit2 className="w-3 h-3" />
            Edit SLA Targets
          </Button>
        )}
      </div>

      {editing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech">Edit SLA Targets</CardTitle>
            <p className="text-xs text-muted-foreground">
              Targets can only be tighter than the tier default ({responseTargetSec}s response / {sla.tier.completionTargetMinutes}min completion).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-tech">Response Target (seconds)</Label>
                <Input
                  type="number"
                  value={editResponse}
                  onChange={(e) => setEditResponse(e.target.value)}
                  placeholder={String(responseTargetSec)}
                  min={1}
                  max={responseTargetSec}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-tech">Completion Target (minutes)</Label>
                <Input
                  type="number"
                  value={editCompletion}
                  onChange={(e) => setEditCompletion(e.target.value)}
                  placeholder={String(sla.tier.completionTargetMinutes)}
                  min={1}
                  max={sla.tier.completionTargetMinutes}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            {updateSla.error && (
              <p className="text-xs text-red-400">{updateSla.error.message}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={updateSla.isPending}>
                {updateSla.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => setEditing(false)}>
                <X className="w-3 h-3" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-tech flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            SLA Commitment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This bot responds within <span className="text-foreground font-medium">{responseTargetSec} seconds</span> on average.{" "}
            {period}-day compliance rate:{" "}
            {sla.responseCompliance.rate !== null ? (
              <span className={`font-medium ${sla.responseCompliance.rate >= 95 ? "text-green-400" : sla.responseCompliance.rate >= 85 ? "text-yellow-400" : "text-red-400"}`}>
                {sla.responseCompliance.rate}%
              </span>
            ) : (
              <span className="text-muted-foreground">No data yet</span>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Response Compliance"
          value={sla.responseCompliance.rate !== null ? `${sla.responseCompliance.rate}%` : "—"}
          sub={`${sla.responseCompliance.met} / ${sla.responseCompliance.total} directives`}
          status={sla.responseCompliance.rate === null ? "neutral" : sla.responseCompliance.rate >= 95 ? "green" : sla.responseCompliance.rate >= 85 ? "yellow" : "red"}
        />
        <MetricCard
          label="Avg Response Time"
          value={msToDisplay(sla.responseCompliance.avgResponseMs)}
          sub={`Target: ${responseTargetSec}s`}
          status="neutral"
        />
        <MetricCard
          label="P95 Response Time"
          value={msToDisplay(sla.responseCompliance.p95ResponseMs)}
          sub="95th percentile"
          status="neutral"
        />
        <MetricCard
          label="Task Completion"
          value={sla.completionCompliance.rate !== null ? `${sla.completionCompliance.rate}%` : "—"}
          sub={`${sla.completionCompliance.met} / ${sla.completionCompliance.total} sessions`}
          status={sla.completionCompliance.rate === null ? "neutral" : sla.completionCompliance.rate >= 95 ? "green" : sla.completionCompliance.rate >= 85 ? "yellow" : "red"}
        />
      </div>

      {sla.responseCompliance.avgHoldMs > 0 && (
        <Card className="border-border/40">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Average approval hold time per session:</span>
              <span className="font-medium">{msToDisplay(sla.responseCompliance.avgHoldMs)}</span>
              <span className="text-xs text-muted-foreground">(excluded from SLA clock)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {sla.trendData.length > 0 && (
        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              7-Day Response Time Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sla.trendData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}s`}
                  />
                  <Tooltip
                    formatter={(v: number) => msToDisplay(v)}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 11,
                    }}
                  />
                  <ReferenceLine
                    y={sla.targets.responseTargetMs}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="4 2"
                    label={{ value: "Target", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--destructive))" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgResponseMs"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Avg Response"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {sla.recentBreaches.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-tech flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-4 h-4" />
              Recent SLA Breaches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sla.recentBreaches.map((breach) => (
                <div
                  key={breach.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/15 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-red-400 border-red-500/30 shrink-0 capitalize">
                      {breach.eventType}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                      {formatDistanceToNow(new Date(breach.directedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-red-400">
                      {msToDisplay(breach.netDurationMs)} / {msToDisplay(breach.targetMs)} target
                    </span>
                    {breach.sessionId && (
                      <Link href={`/sessions/${breach.sessionId}`} className="text-primary hover:underline">
                        View
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sla.recentBreaches.length === 0 && sla.responseCompliance.total > 0 && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/5 border border-green-500/20 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          No SLA breaches in the selected period.
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub: string;
  status: "green" | "yellow" | "red" | "neutral";
}) {
  const colorMap = {
    green: "text-green-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
    neutral: "text-foreground",
  };

  return (
    <Card className="border-border/40">
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground font-tech uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-bold font-display ${colorMap[status]}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
