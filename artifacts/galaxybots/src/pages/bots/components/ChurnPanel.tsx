import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CHART_COLORS, InsightBar } from "./constants";

export function ChurnPanel() {
  const d = SAAS_DATA;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Monthly Churn Rate", value: `${d.churnRate}%`, color: "text-amber-500" },
          { label: "Customers at Risk", value: "5", color: "text-red-500" },
          { label: "ARR at Risk", value: "$258K", color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">At-Risk Customers — Churn Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {d.churnRiskCustomers.map((c) => {
              const scoreColor = c.score >= 80 ? "text-red-500" : c.score >= 65 ? "text-amber-500" : "text-yellow-500";
              return (
                <div key={c.name} className="flex items-start justify-between p-3 rounded-lg bg-muted/20 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">${(c.arr / 1000).toFixed(0)}K ARR</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.signals.map((sig) => (
                        <span key={sig} className="text-[10px] bg-red-500/10 text-red-400 rounded px-1.5 py-0.5">{sig}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-xl font-bold font-mono", scoreColor)}>{c.score}</p>
                    <p className="text-[10px] text-muted-foreground">risk score</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Exit Reason Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <ResponsiveContainer width={200} height={160}>
              <PieChart>
                <Pie data={d.exitReasons} dataKey="pct" nameKey="reason" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}>
                  {d.exitReasons.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v}%`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 flex-1">
              {d.exitReasons.map((r, i) => (
                <div key={r.reason} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-muted-foreground flex-1">{r.reason}</span>
                  <span className="text-xs font-bold font-mono">{r.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <InsightBar insights={[
        "TechCorp Global (score 87, $84K ARR) is your highest-risk account. Schedule an emergency QBR this week — usage dropped 42% in 30 days.",
        "Price sensitivity drives 34% of exits. Consider value-based pricing tiers rather than a blanket increase. Bundle training/support for high-ARR accounts.",
        "Monitor login frequency weekly — accounts with <2 logins/week over 14 days have a 67% churn probability within 60 days.",
      ]} />
    </div>
  );
}
