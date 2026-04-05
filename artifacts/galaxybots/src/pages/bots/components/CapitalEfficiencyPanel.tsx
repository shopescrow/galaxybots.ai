import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CustomTooltip, InsightBar } from "./constants";

export function CapitalEfficiencyPanel() {
  const d = SAAS_DATA;
  const latestCE = d.capitalEfficiency[d.capitalEfficiency.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Magic Number",
            value: latestCE.magicNumber.toFixed(2),
            sub: ">0.75 is efficient",
            status: latestCE.magicNumber >= 0.75 ? "good" : "warn",
          },
          {
            label: "Rule of 40",
            value: `${latestCE.ruleOf40}%`,
            sub: ">40% is healthy",
            status: latestCE.ruleOf40 >= 40 ? "good" : "warn",
          },
          {
            label: "Burn Multiple",
            value: "0.61x",
            sub: "<1x is best-in-class",
            status: "good",
          },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.status === "good" ? "text-green-500" : "text-amber-500")}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Magic Number Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.capitalEfficiency}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0.5, 1.0]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0.75} stroke="hsl(173 58% 39%)" strokeDasharray="4 2" label={{ value: "Target 0.75", position: "insideTopRight", fontSize: 10, fill: "hsl(173 58% 39%)" }} />
              <Line type="monotone" dataKey="magicNumber" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Magic Number" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Rule of 40 Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={d.capitalEfficiency}>
              <defs>
                <linearGradient id="ruleGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(270 50% 60%)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(270 50% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[20, 50]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`${v}%`, "Rule of 40"]} />
              <ReferenceLine y={40} stroke="hsl(173 58% 39%)" strokeDasharray="4 2" label={{ value: "Target 40%", position: "insideTopRight", fontSize: 10, fill: "hsl(173 58% 39%)" }} />
              <Area type="monotone" dataKey="ruleOf40" stroke="hsl(270 50% 60%)" fill="url(#ruleGrad)" strokeWidth={2} name="Rule of 40" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <InsightBar insights={[
        `Magic Number of ${latestCE.magicNumber} means for every $1 spent on S&M, you're generating $${latestCE.magicNumber.toFixed(2)} of new ARR — above the 0.75 efficiency threshold.`,
        `Rule of 40 score of ${latestCE.ruleOf40}% (exceeding the 40% threshold) signals you can sustain both growth and profitability. This is a key metric for Series B investors.`,
        "Burn Multiple of 0.61x is exceptional — best-in-class SaaS companies operate below 0.5x at scale. At current trajectory, you'll hit that by Q4.",
      ]} />
    </div>
  );
}
