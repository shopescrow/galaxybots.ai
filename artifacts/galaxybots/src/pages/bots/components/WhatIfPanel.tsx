import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import { SAAS_DATA, CustomTooltip, InsightBar } from "./constants";

export function WhatIfPanel() {
  const [customARR, setCustomARR] = useState(0);
  const [customChurn, setCustomChurn] = useState(0);
  const scenarios = SAAS_DATA.scenarios;

  const chartData = scenarios.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + "\u2026" : s.name,
    impact: Math.round(s.netImpact / 1000),
    probability: s.probability,
  }));

  const customProjected = SAAS_DATA.currentARR + customARR * 1000 - customChurn * 1000;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Preset Scenarios — Net ARR Impact</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${v}K`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={120} />
                <Tooltip content={<CustomTooltip />} formatter={(v: number) => [`$${v}K`, "Net Impact"]} />
                <Bar dataKey="impact" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" name="Net Impact ($K)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Custom Scenario Planner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-tech text-muted-foreground">Additional ARR ($K)</Label>
              <Input
                type="number"
                value={customARR}
                onChange={(e) => setCustomARR(Number(e.target.value))}
                placeholder="e.g. 500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-tech text-muted-foreground">ARR Lost to Churn ($K)</Label>
              <Input
                type="number"
                value={customChurn}
                onChange={(e) => setCustomChurn(Number(e.target.value))}
                placeholder="e.g. 100"
              />
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider mb-1">Projected ARR</p>
              <p className="text-2xl font-bold text-primary">${(customProjected / 1e6).toFixed(2)}M</p>
              <p className="text-xs text-muted-foreground mt-1">
                {customProjected > SAAS_DATA.currentARR
                  ? `+$${((customProjected - SAAS_DATA.currentARR) / 1000).toFixed(0)}K vs current`
                  : `-$${((SAAS_DATA.currentARR - customProjected) / 1000).toFixed(0)}K vs current`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-3">
        {scenarios.map((s) => (
          <Card key={s.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm">{s.name}</p>
                    <Badge variant="outline" className="text-[10px]">{s.probability}% probability</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.recommendation}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-green-500">+${(s.netImpact / 1000).toFixed(0)}K</p>
                  <p className="text-[10px] text-muted-foreground">net ARR impact</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <InsightBar insights={[
        "Highest-probability scenario: 10% Price Increase (72% probability, +$350K net). Pair with value communication campaign and grandfathering strategy.",
        "Halving churn rate produces $486K net ARR with no incremental acquisition cost — often the highest-ROI lever for SaaS CFOs.",
        "EMEA expansion offers the best risk-adjusted return at 61% probability. Model currency and compliance costs before committing.",
      ]} />
    </div>
  );
}
