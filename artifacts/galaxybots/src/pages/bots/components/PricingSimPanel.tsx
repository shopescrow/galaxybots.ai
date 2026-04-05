import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SAAS_DATA, CustomTooltip, InsightBar } from "./constants";

export function PricingSimPanel() {
  const [priceChange, setPriceChange] = useState(10);
  const [churnSensitivity, setChurnSensitivity] = useState(0.5);
  const currentARR = SAAS_DATA.currentARR;
  const currentChurn = SAAS_DATA.churnRate;

  const projectedARR = currentARR * (1 + priceChange / 100) * (1 - (churnSensitivity * priceChange) / 100);
  const churnSpike = currentChurn + churnSensitivity * (priceChange / 10);
  const arrImpact = projectedARR - currentARR;

  const chartData = [-20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30].map((pct) => {
    const arr = currentARR * (1 + pct / 100) * (1 - (churnSensitivity * pct) / 100);
    return { pct: `${pct > 0 ? "+" : ""}${pct}%`, arr: Math.round(arr / 1e6 * 100) / 100 };
  });

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Price Change Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-xs font-tech text-muted-foreground uppercase tracking-wider">
                Price Change: <span className="text-primary font-bold">{priceChange > 0 ? "+" : ""}{priceChange}%</span>
              </Label>
              <Slider
                value={[priceChange]}
                onValueChange={(v) => setPriceChange(v[0])}
                min={-30}
                max={50}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>-30%</span><span>0</span><span>+50%</span>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-tech text-muted-foreground uppercase tracking-wider">
                Churn Sensitivity: <span className="text-primary font-bold">{churnSensitivity}x</span>
              </Label>
              <Slider
                value={[churnSensitivity * 10]}
                onValueChange={(v) => setChurnSensitivity(Math.round(v[0]) / 10)}
                min={1}
                max={20}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Low (0.1x)</span><span>Medium</span><span>High (2x)</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Projected ARR", value: `$${(projectedARR / 1e6).toFixed(2)}M`, color: arrImpact >= 0 ? "text-green-500" : "text-red-500" },
              { label: "ARR Impact", value: `${arrImpact >= 0 ? "+" : ""}$${Math.abs(arrImpact / 1000).toFixed(0)}K`, color: arrImpact >= 0 ? "text-green-500" : "text-red-500" },
              { label: "Expected Churn", value: `${churnSpike.toFixed(1)}%`, color: churnSpike > currentChurn + 1 ? "text-red-500" : "text-amber-500" },
            ].map((s) => (
              <Card key={s.label} className="border-border/50">
                <CardContent className="p-4 text-center">
                  <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className={cn("text-xl font-bold mt-1", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">ARR Sensitivity to Price Change</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="pricingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="pct" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}M`} />
              <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`$${v}M ARR`, ""]} />
              <ReferenceLine x="0%" stroke="hsl(var(--border))" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="arr" stroke="hsl(var(--primary))" fill="url(#pricingGrad)" strokeWidth={2} name="Projected ARR" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/15">
        <p className="text-xs font-tech text-primary uppercase tracking-wider mb-2">Optimal Timing Recommendation</p>
        <p className="text-sm text-foreground">
          {priceChange > 0
            ? `A ${priceChange}% price increase is ${arrImpact > 0 ? "net positive" : "net negative"} under current churn sensitivity. Best timing: implement at contract renewal cycles, grandfather existing customers for 90 days, and pair with a feature release to justify value.`
            : `A ${Math.abs(priceChange)}% price reduction could accelerate new logo acquisition. Ensure your CAC economics remain intact — target segments where price is the primary objection.`}
        </p>
      </div>
    </div>
  );
}
