import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, InsightBar } from "./constants";

export function UnitEconomicsPanel() {
  const u = SAAS_DATA.unitEconomics;

  const metrics = [
    { label: "LTV", value: `$${(u.ltv / 1000).toFixed(1)}K`, status: "good", detail: "Lifetime value per customer" },
    { label: "CAC", value: `$${(u.cac / 1000).toFixed(1)}K`, status: "neutral", detail: "Customer acquisition cost" },
    { label: "LTV:CAC Ratio", value: `${u.ltvCacRatio}x`, status: "good", detail: ">3x is healthy; >5x is excellent" },
    { label: "CAC Payback", value: `${u.paybackMonths}mo`, status: "good", detail: "Months to recover CAC" },
    { label: "Gross Margin", value: `${u.grossMargin}%`, status: "good", detail: "Revenue minus COGS" },
    { label: "Contribution Margin", value: `${u.contributionMargin}%`, status: "good", detail: "After variable costs" },
    { label: "Breakeven", value: `${u.breakevenMonths}mo`, status: "good", detail: "Months to breakeven per customer" },
  ];

  const radarData = [
    { metric: "LTV:CAC", value: Math.min((u.ltvCacRatio / 15) * 100, 100), benchmark: 60 },
    { metric: "Gross Margin", value: u.grossMargin, benchmark: 70 },
    { metric: "Contrib. Margin", value: u.contributionMargin, benchmark: 55 },
    { metric: "Payback Speed", value: Math.max(100 - (u.paybackMonths - 6) * 5, 20), benchmark: 60 },
    { metric: "NRR", value: SAAS_DATA.nrr - 10, benchmark: 90 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.slice(0, 4).map((m) => (
          <Card key={m.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{m.label}</p>
              <p className={cn("text-2xl font-bold mt-1", m.status === "good" ? "text-green-500" : "")}>{m.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{m.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Unit Economics Radar</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Radar name="Company" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                <Radar name="Benchmark" dataKey="benchmark" stroke="hsl(173 58% 39%)" fill="hsl(173 58% 39%)" fillOpacity={0.1} strokeDasharray="4 2" />
                <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Margin Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {[
              { label: "Gross Margin", value: u.grossMargin, color: "bg-green-500" },
              { label: "Contribution Margin", value: u.contributionMargin, color: "bg-primary" },
              { label: "EBITDA Margin", value: 25, color: "bg-cyan-500" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-bold">{item.value}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-4 p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Breakeven:</span> {u.breakevenMonths} months per customer acquired. At current CAC of ${u.cac.toLocaleString()}, each customer becomes profitable by month {Math.ceil(u.breakevenMonths)}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <InsightBar insights={[
        `LTV:CAC ratio of ${u.ltvCacRatio}x is exceptional — top-quartile SaaS averages 4-5x. This indicates highly efficient growth.`,
        `Gross margin of ${u.grossMargin}% exceeds the 70% SaaS benchmark. Every new dollar of ARR adds ${u.grossMargin}¢ to gross profit.`,
        "Contribution margin gap vs gross margin (13pp) suggests significant S&M variable costs — worth auditing commission structures.",
      ]} />
    </div>
  );
}
