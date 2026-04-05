import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Check, Play, Users, UserPlus } from "lucide-react";
import { BASE } from "./types";

export function DemoMetricsPanel() {
  const { data: demoMetrics, isLoading } = useQuery<{
    totalDemoStarts: number;
    totalCompleted: number;
    totalClaimed: number;
    conversionRate: number;
    avgMessagesPerSession: number;
    last24h: { starts: number; completed: number; claimed: number };
  }>({
    queryKey: ["demoMetrics"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/demo-metrics`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Play className="w-5 h-5 text-cyan" /> Demo Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!demoMetrics) return null;

  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Play className="w-5 h-5 text-cyan" /> Demo Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <Users className="w-4 h-4 text-primary mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalDemoStarts}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Total Starts</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <Check className="w-4 h-4 text-gold mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalCompleted}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Completed</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-secondary/50 border border-border/30">
            <UserPlus className="w-4 h-4 text-cyan mx-auto mb-1" />
            <div className="text-xl font-display font-bold">{demoMetrics.totalClaimed}</div>
            <div className="text-[10px] text-muted-foreground font-tech">Claimed</div>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-tech">Conversion Rate</span>
          <span className="font-display font-bold text-primary">{demoMetrics.conversionRate.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-tech">Avg Messages/Session</span>
          <span className="font-display font-bold">{demoMetrics.avgMessagesPerSession.toFixed(1)}</span>
        </div>
        <div className="border-t border-border/30 pt-3 mt-3">
          <div className="text-xs font-tech text-muted-foreground uppercase tracking-wider mb-2">Last 24 Hours</div>
          <div className="flex justify-between text-xs">
            <span>{demoMetrics.last24h.starts} starts</span>
            <span>{demoMetrics.last24h.completed} completed</span>
            <span>{demoMetrics.last24h.claimed} claimed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
