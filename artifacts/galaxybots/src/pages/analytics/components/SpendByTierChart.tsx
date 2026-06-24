import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Cpu } from "lucide-react";
import { BASE } from "./types";

interface TierUsage {
  tiers: Array<{ tier: string; callCount: number; totalCostUsd: number; totalTokens: number }>;
  coordinatorCallCount: number;
  projectedMonthlySavingsUsd: number;
}

const TIER_COLORS: Record<string, string> = {
  local: "#22c55e",
  efficient: "#f59e0b",
  frontier: "#6366f1",
};

const TIER_LABELS: Record<string, string> = {
  local: "Local (Ollama)",
  efficient: "Efficient",
  frontier: "Frontier",
};

export function SpendByTierChart() {
  const { data, isLoading } = useQuery<TierUsage>({
    queryKey: ["analytics", "spend-by-tier"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/spend-by-tier`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const chartData = (data?.tiers ?? []).map((t) => ({
    name: TIER_LABELS[t.tier] ?? t.tier,
    value: t.tier === "local" ? t.callCount : Math.round(t.totalCostUsd * 10000) / 10000,
    tier: t.tier,
    callCount: t.callCount,
    totalCostUsd: t.totalCostUsd,
  }));

  const savings = data?.projectedMonthlySavingsUsd ?? 0;
  const localCalls = data?.coordinatorCallCount ?? 0;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />
            Spend by Model Tier
          </CardTitle>
          {localCalls > 0 && (
            <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 bg-green-400/5">
              {localCalls} local calls
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm font-tech">
            Loading…
          </div>
        ) : chartData.length > 0 ? (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="callCount"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={TIER_COLORS[entry.tier] ?? "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload as typeof chartData[0];
                    return (
                      <div className="bg-background border border-border rounded px-3 py-2 text-xs shadow-lg">
                        <div className="font-medium mb-1">{d.name}</div>
                        <div className="text-muted-foreground">{d.callCount.toLocaleString()} calls</div>
                        <div className="text-muted-foreground">${d.totalCostUsd.toFixed(4)} cost</div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-3 mt-1 justify-center">
              {chartData.map((t) => (
                <div key={t.tier} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TIER_COLORS[t.tier] ?? "#6b7280" }} />
                  <span className="text-muted-foreground">{TIER_LABELS[t.tier] ?? t.tier}</span>
                </div>
              ))}
            </div>

            {savings > 0.0001 && (
              <div className="mt-3 text-center">
                <p className="text-xs text-muted-foreground font-tech">Projected monthly savings from local routing</p>
                <p className="text-sm font-bold text-green-400 font-tech mt-0.5">${savings.toFixed(4)}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Cpu className="w-8 h-8 opacity-30" />
            <p className="text-sm font-tech">No tier data yet</p>
            <p className="text-xs text-center max-w-[200px]">Tier tracking begins once the local Ollama coordinator is active</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
