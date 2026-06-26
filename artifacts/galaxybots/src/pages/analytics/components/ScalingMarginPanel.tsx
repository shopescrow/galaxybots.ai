import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp, AlertTriangle, Gauge } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { BASE, type ScalingTelemetryData } from "./types";

function fmtUsd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(4)}`;
}

export function ScalingMarginPanel() {
  const { data, isLoading } = useQuery<ScalingTelemetryData>({
    queryKey: ["analytics", "scaling"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/analytics/scaling`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-tech text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Scaling Margin & Fidelity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !data || data.totals.runs === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No scaling telemetry recorded yet. Metrics appear after multi-agent runs complete.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total Margin</div>
                <div className={`text-lg font-bold ${data.totals.totalMarginUsd >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {fmtUsd(data.totals.totalMarginUsd)}
                </div>
                <div className="text-[10px] text-muted-foreground">{data.totals.runs} runs</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Avg Margin / Run</div>
                <div className={`text-lg font-bold ${data.totals.avgMarginUsd >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {fmtUsd(data.totals.avgMarginUsd)}
                </div>
                <div className="text-[10px] text-muted-foreground">{Math.round(data.totals.marginPositiveRate * 100)}% profitable</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Avg Fidelity</div>
                <div className="text-lg font-bold">
                  {data.totals.avgFidelity == null ? "—" : `${(data.totals.avgFidelity * 100).toFixed(1)}%`}
                </div>
                <div className="text-[10px] text-muted-foreground">vs baseline quality</div>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Tokens Saved</div>
                <div className="text-lg font-bold">{data.totals.totalTokensSaved.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">cost: {fmtUsd(data.totals.totalCostUsd)}</div>
              </div>
            </div>

            {data.alerts.length > 0 && (
              <div className="space-y-2">
                {data.alerts.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            {data.marginTrend.length > 1 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Avg margin per run over time
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.marginTrend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, name: string) =>
                        name === "avgMarginUsd" ? [fmtUsd(v), "Avg margin"] : [v, name]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="avgMarginUsd" name="Avg margin" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="overflow-x-auto">
              <div className="text-xs text-muted-foreground mb-2">Margin & fidelity by task category and fleet size</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/50">
                    <th className="py-1.5 pr-2 font-medium">Category</th>
                    <th className="py-1.5 px-2 font-medium">Fleet</th>
                    <th className="py-1.5 px-2 font-medium text-right">Runs</th>
                    <th className="py-1.5 px-2 font-medium text-right">Avg Margin</th>
                    <th className="py-1.5 px-2 font-medium text-right">Avg Cost</th>
                    <th className="py-1.5 px-2 font-medium text-right">Fidelity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCategory.map((c, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-1.5 pr-2 capitalize">{c.taskCategory.replace(/_/g, " ")}</td>
                      <td className="py-1.5 px-2">{c.fleetSize}</td>
                      <td className="py-1.5 px-2 text-right">{c.runs}</td>
                      <td className={`py-1.5 px-2 text-right font-medium ${c.avgMarginUsd >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                        {fmtUsd(c.avgMarginUsd)}
                      </td>
                      <td className="py-1.5 px-2 text-right">{fmtUsd(c.avgCostUsd)}</td>
                      <td className="py-1.5 px-2 text-right">
                        {c.avgFidelity == null ? "—" : `${(c.avgFidelity * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.recentRuns.slice(0, 6).map((r) => (
                <Badge key={r.id} variant="outline" className="text-[10px] font-tech">
                  {r.strategy?.replace(/_/g, " ") ?? "run"} · fleet {r.fleetSize} ·{" "}
                  <span className={r.marginUsd >= 0 ? "text-emerald-500" : "text-destructive"}>{fmtUsd(r.marginUsd)}</span>
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
