import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock, TrendingUp, UserPlus, Phone, PhoneIncoming } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { CustomTooltip } from "./CustomTooltip";
import { BASE, type VoiceAnalyticsData } from "./types";

export function VoiceAnalyticsPanel() {
  const { data: voiceData, isLoading } = useQuery<VoiceAnalyticsData>({
    queryKey: ["analytics", "voice"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/voice`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
<Phone className="w-5 h-5 text-primary" /> Voice Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!voiceData || voiceData.totalCalls === 0) {
    return (
      <Card className="bg-card border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" /> Voice Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground text-sm font-tech">
            No call data yet. Call analytics will appear once the AI Receptionist handles inbound calls.
          </div>
        </CardContent>
      </Card>
    );
  }

  const urgencyChartData = (voiceData.urgencyDistribution || [])
    .filter(u => u.urgency !== null)
    .map(u => ({
      name: `Level ${u.urgency}`,
      value: u.count,
    }));

  const URGENCY_COLORS = ["#10b981", "#3b82f6", "#eab308", "#f97316", "#ef4444"];

  return (
    <Card className="bg-card border-border/50 lg:col-span-2">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" /> Voice Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <PhoneIncoming className="w-4 h-4 text-primary mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{voiceData.totalCalls}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Total Calls</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <Clock className="w-4 h-4 text-gold mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{voiceData.avgDurationSeconds}s</div>
            <div className="text-[10px] text-muted-foreground font-tech">Avg Duration</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <UserPlus className="w-4 h-4 text-cyan mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{voiceData.newProspects}</div>
            <div className="text-[10px] text-muted-foreground font-tech">New Leads</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <TrendingUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{voiceData.leadConversionRate}%</div>
            <div className="text-[10px] text-muted-foreground font-tech">Lead Rate</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Call Volume Over Time</p>
            {voiceData.callVolumeOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={voiceData.callVolumeOverTime}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Calls" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">No data</div>
            )}
          </div>

          <div>
            <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Urgency Distribution</p>
            {urgencyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={urgencyChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {urgencyChartData.map((_, i) => (
                      <Cell key={i} fill={URGENCY_COLORS[i % URGENCY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">No debrief data</div>
            )}
            {urgencyChartData.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-1">
                {urgencyChartData.map((u, i) => (
                  <div key={u.name} className="flex items-center gap-1 text-[10px]">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: URGENCY_COLORS[i] }} />
                    <span className="text-muted-foreground">{u.name}: {u.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {voiceData.topIntents.length > 0 && (
          <div>
            <p className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Top Call Intents</p>
            <div className="space-y-1.5">
              {voiceData.topIntents.slice(0, 5).map((intent, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                  <span className="truncate mr-2">{intent.intent}</span>
                  <Badge variant="secondary" className="font-mono text-[10px]">{intent.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
