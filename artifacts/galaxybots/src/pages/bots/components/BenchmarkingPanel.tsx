import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Legend,
} from "recharts";
import { SAAS_DATA, InsightBar } from "./constants";

export function BenchmarkingPanel() {
  const b = SAAS_DATA.benchmarks;

  const getStatusBadge = (metric: typeof b[0]) => {
    let isGood: boolean;
    if (metric.metric === "Churn Rate" || metric.metric === "CAC Payback") {
      isGood = metric.company <= metric.good;
    } else {
      isGood = metric.company >= metric.good;
    }
    const isAboveBenchmark = metric.metric === "Churn Rate" || metric.metric === "CAC Payback"
      ? metric.company <= metric.benchmark
      : metric.company >= metric.benchmark;

    if (isGood) return <Badge className="text-[10px] bg-green-500/10 text-green-500 border-green-500/30">Top Quartile</Badge>;
    if (isAboveBenchmark) return <Badge className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/30">Above Median</Badge>;
    return <Badge className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">Below Median</Badge>;
  };

  const radarData = b.map((item) => {
    const normalized = item.metric === "Churn Rate" || item.metric === "CAC Payback"
      ? Math.max(0, 100 - (item.company / (item.good || 1)) * 100 + 100)
      : Math.min((item.company / (item.good || 1)) * 100, 120);
    const benchmarkNorm = item.metric === "Churn Rate" || item.metric === "CAC Payback"
      ? Math.max(0, 100 - (item.benchmark / (item.good || 1)) * 100 + 100)
      : Math.min((item.benchmark / (item.good || 1)) * 100, 120);
    return { metric: item.metric, company: Math.round(normalized), benchmark: Math.round(benchmarkNorm) };
  });

  return (
    <div className="space-y-6">
      <Card className="border-border/50 overflow-x-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">vs SaaS Industry Benchmarks</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left pb-2 text-xs font-tech text-muted-foreground uppercase tracking-wider">Metric</th>
                <th className="text-center pb-2 text-xs font-tech text-muted-foreground uppercase tracking-wider">You</th>
                <th className="text-center pb-2 text-xs font-tech text-muted-foreground uppercase tracking-wider">Median</th>
                <th className="text-center pb-2 text-xs font-tech text-muted-foreground uppercase tracking-wider">Top Quartile</th>
                <th className="text-right pb-2 text-xs font-tech text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {b.map((item) => (
                <tr key={item.metric} className="border-b border-border/20 last:border-0">
                  <td className="py-3 font-medium">{item.metric}</td>
                  <td className="py-3 text-center font-bold text-primary">
                    {item.metric === "CAC Payback" ? `${item.company}mo` :
                     item.metric === "Churn Rate" ? `${item.company}%` :
                     item.metric === "LTV:CAC" ? `${item.company}x` :
                     `${item.company}${item.metric.includes("Margin") || item.metric.includes("Growth") || item.metric === "NRR" ? "%" : ""}`}
                  </td>
                  <td className="py-3 text-center text-muted-foreground">
                    {item.metric === "CAC Payback" ? `${item.benchmark}mo` :
                     item.metric === "Churn Rate" ? `${item.benchmark}%` :
                     item.metric === "LTV:CAC" ? `${item.benchmark}x` :
                     `${item.benchmark}${item.metric.includes("Margin") || item.metric.includes("Growth") || item.metric === "NRR" ? "%" : ""}`}
                  </td>
                  <td className="py-3 text-center text-green-500">
                    {item.metric === "CAC Payback" ? `${item.good}mo` :
                     item.metric === "Churn Rate" ? `${item.good}%` :
                     item.metric === "LTV:CAC" ? `${item.good}x` :
                     `${item.good}${item.metric.includes("Margin") || item.metric.includes("Growth") || item.metric === "NRR" ? "%" : ""}`}
                  </td>
                  <td className="py-3 text-right">{getStatusBadge(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Benchmark Radar vs Industry Median</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Radar name="Your Company" dataKey="company" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
              <Radar name="SaaS Median" dataKey="benchmark" stroke="hsl(173 58% 39%)" fill="hsl(173 58% 39%)" fillOpacity={0.1} strokeDasharray="4 2" />
              <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <InsightBar insights={[
        "You outperform the SaaS median on 5 of 6 benchmarks — a strong competitive position. LTV:CAC (12.5x) is exceptional.",
        "ARR growth of 38% is well above the 25% median but below the 50% top-quartile. Closing this gap is the highest-leverage CFO priority.",
        "Gross margin of 74% vs 70% benchmark leaves room to invest in R&D or S&M — model impact before any margin compression.",
      ]} />
    </div>
  );
}
