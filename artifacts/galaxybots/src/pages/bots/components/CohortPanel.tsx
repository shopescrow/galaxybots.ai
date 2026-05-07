import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CustomTooltip, InsightBar } from "./constants";

export function CohortPanel() {
  const d = SAAS_DATA;
  const months = ["M0", "M1", "M2", "M3", "M4", "M5", "M6"];

  function getHeatColor(value: number) {
    if (value >= 90) return "bg-green-500/80 text-white";
    if (value >= 80) return "bg-green-400/60 text-foreground";
    if (value >= 70) return "bg-yellow-400/60 text-foreground";
    if (value >= 60) return "bg-orange-400/60 text-foreground";
    return "bg-red-500/60 text-white";
  }

  const retentionCurveData = months.map((m, idx) => {
    const mKey = `m${idx}` as keyof (typeof d.cohortRetention)[0];
    const values = d.cohortRetention.map((c) => c[mKey]).filter((v): v is number => v !== undefined);
    return { month: m, avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
  });

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Revenue Retention by Cohort (%)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="text-xs w-full min-w-[480px]">
            <thead>
              <tr>
                <th className="text-left text-muted-foreground font-tech pb-2 pr-3">Cohort</th>
                {months.map((m) => (
                  <th key={m} className="text-center text-muted-foreground font-tech pb-2 px-1">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="space-y-1">
              {d.cohortRetention.map((row) => (
                <tr key={row.cohort}>
                  <td className="text-muted-foreground pr-3 py-1 whitespace-nowrap">{row.cohort}</td>
                  {months.map((m, idx) => {
                    const mKey = `m${idx}` as keyof typeof row;
                    const val = row[mKey] as number | undefined;
                    return (
                      <td key={m} className="px-1 py-1">
                        {val !== undefined ? (
                          <div className={cn("rounded text-center py-1 px-2 font-mono font-bold", getHeatColor(val))}>
                            {val}%
                          </div>
                        ) : (
                          <div className="rounded text-center py-1 px-2 bg-muted/20 text-muted-foreground">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Average Retention Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={retentionCurveData}>
              <defs>
                <linearGradient id="cohortGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(173 58% 39%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(173 58% 39%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[70, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`${v}%`, "Avg Retention"]} />
              <Area type="monotone" dataKey="avg" stroke="hsl(173 58% 39%)" fill="url(#cohortGrad)" strokeWidth={2} name="Avg Retention" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <InsightBar insights={[
        "M1 retention averages 92.4% — strong initial activation. Focus on M2-M3 where the steepest drop-off occurs (92% → 87%).",
        "Jan '25 cohort shows the best retention at M3+ (85%), suggesting recent onboarding improvements are working.",
        "Churn risk factors: customers who don't hit their first 'aha moment' within 14 days are 3× more likely to churn by M2.",
      ]} />
    </div>
  );
}
