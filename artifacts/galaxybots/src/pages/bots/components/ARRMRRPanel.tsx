import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CHART_COLORS, CONNECT_PROMPT, CustomTooltip, InsightBar } from "./constants";

export function ARRMRRPanel() {
  const d = SAAS_DATA;
  const mrrGrowth = (((d.currentMRR - d.prevMRR) / d.prevMRR) * 100).toFixed(1);

  const waterfallData = d.mrrWaterfall.map((item, i) => {
    if (i === 0 || i === d.mrrWaterfall.length - 1) {
      return { ...item, fill: CHART_COLORS[0] };
    }
    return { ...item, fill: item.value >= 0 ? CHART_COLORS[1] : CHART_COLORS[4] };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "ARR", value: `$${(d.currentARR / 1e6).toFixed(2)}M`, sub: `+${(((d.currentARR - d.prevARR) / d.prevARR) * 100).toFixed(1)}% MoM` },
          { label: "MRR", value: `$${(d.currentMRR / 1000).toFixed(0)}K`, sub: `+${mrrGrowth}% MoM` },
          { label: "NRR", value: `${d.nrr}%`, sub: "Net Revenue Retention" },
          { label: "GRR", value: `${d.grr}%`, sub: "Gross Revenue Retention" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-xl font-bold mt-1">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">MRR Growth Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d.mrrTrend}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
                <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" fill="url(#mrrGrad)" strokeWidth={2} name="MRR" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">MRR Waterfall</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={waterfallData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`$${Math.abs(v).toLocaleString()}`, ""]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "CAC Payback", value: `${d.cacPayback}mo`, status: "good" },
          { label: "LTV", value: `$${(d.ltv / 1000).toFixed(1)}K`, status: "good" },
          { label: "CAC", value: `$${(d.cac / 1000).toFixed(1)}K`, status: "neutral" },
          { label: "LTV:CAC", value: `${(d.ltv / d.cac).toFixed(1)}x`, status: "good" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className={cn("text-xl font-bold mt-1", stat.status === "good" ? "text-green-500" : "")}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <CONNECT_PROMPT label="Stripe / billing system" />
      <InsightBar insights={[
        "MRR grew +7.8% this month — above the SaaS benchmark of 5%. Expansion revenue ($28.6K) now exceeds new logo revenue ($52.4K new minus prior baseline), indicating strong land-and-expand motion.",
        "NRR of 112% means existing customers are growing revenue faster than churn erodes it — a key signal of product-market fit.",
        "CAC payback of 11.4 months is trending better than the 15-month industry median. Consider increasing acquisition spend.",
      ]} />
    </div>
  );
}
