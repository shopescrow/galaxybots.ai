import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CONNECT_PROMPT, CustomTooltip, InsightBar } from "./constants";

export function CashFlowPanel() {
  const d = SAAS_DATA;
  const runwayMonths = Math.round(d.bankBalance / d.burnRate);

  const runwayColor =
    runwayMonths >= 18 ? "text-green-500" : runwayMonths >= 12 ? "text-amber-500" : "text-red-500";

  const fundingTriggers = [
    { scenario: "Current burn continues", months: runwayMonths, status: "safe" },
    { scenario: "Burn +20% (headcount adds)", months: Math.round(d.bankBalance / (d.burnRate * 1.2)), status: "watch" },
    { scenario: "Revenue -15% (churn spike)", months: Math.round(d.bankBalance / (d.burnRate * 1.35)), status: "alert" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Bank Balance", value: `$${(d.bankBalance / 1e6).toFixed(2)}M`, color: "text-green-500" },
          { label: "Monthly Burn", value: `$${(d.burnRate / 1000).toFixed(0)}K`, color: "text-amber-500" },
          { label: "Runway", value: `${runwayMonths}mo`, color: runwayColor },
          { label: "Net Cash/Mo", value: `$${((d.currentMRR - d.burnRate) / 1000).toFixed(0)}K`, color: "text-green-500" },
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
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Cash Inflow vs Outflow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.cashFlow}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`$${v.toLocaleString()}`, ""]} />
              <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
              <Bar dataKey="inflow" fill="hsl(173 58% 39%)" radius={[4, 4, 0, 0]} name="Inflow" />
              <Bar dataKey="outflow" fill="hsl(12 76% 61%)" radius={[4, 4, 0, 0]} name="Outflow" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">AR Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {d.arAging.map((item) => {
                const isRisk = item.bucket.includes("60") || item.bucket.includes("90");
                return (
                  <div key={item.bucket} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground w-24">{item.bucket}</span>
                    <div className="flex-1 mx-3 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", isRisk ? "bg-red-500" : "bg-primary")}
                        style={{ width: `${(item.amount / 142000) * 100}%` }}
                      />
                    </div>
                    <span className={cn("text-xs font-mono font-bold", isRisk ? "text-red-500" : "")}>${item.amount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Funding Trigger Scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {fundingTriggers.map((ft) => (
                <div key={ft.scenario} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                  <div>
                    <p className="text-xs font-medium">{ft.scenario}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Runway: {ft.months} months</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]",
                    ft.status === "safe" ? "text-green-500 border-green-500/30" :
                    ft.status === "watch" ? "text-amber-500 border-amber-500/30" :
                    "text-red-500 border-red-500/30"
                  )}>
                    {ft.status === "safe" ? "Safe" : ft.status === "watch" ? "Watch" : "Alert"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <CONNECT_PROMPT label="bank feed / QuickBooks" />
      <InsightBar insights={[
        `${runwayMonths}-month runway is comfortable. Initiate Series B conversations at 12 months remaining to avoid pressure fundraising.`,
        "AR aging shows $6.7K past 60 days — flag for collections. 90+ days ($1.9K) should be written off in Q2 for clean books.",
        "Net cash generation of $302K/mo means you're cash-flow positive. Reinvest aggressively in S&M while burn rate stays below MRR.",
      ]} />
    </div>
  );
}
