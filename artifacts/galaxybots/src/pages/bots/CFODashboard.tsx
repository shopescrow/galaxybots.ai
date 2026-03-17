import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useParams, Link } from "wouter";
import { useBot } from "@/hooks/use-bots";
import { useStartConversation, useConversations, useChatMessages } from "@/hooks/use-chat";
import { useSSEStream } from "@/hooks/use-sse";
import { getGetConversationMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  BarChart3,
  Layers,
  Zap,
  Target,
  Shield,
  FileText,
  Settings2,
  Send,
  MessageSquare,
  X,
  Loader2,
  TrendingDown,
  Activity,
  Database,
  Building2,
  Star,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ReferenceLine,
} from "recharts";
import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(173 58% 39%)",
  "hsl(270 50% 60%)",
  "hsl(43 74% 66%)",
  "hsl(12 76% 61%)",
];

const DEMO_BADGE = (
  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/5 ml-2">
    Demo Data
  </Badge>
);

const CONNECT_PROMPT = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
    <Database className="w-3 h-3 text-primary shrink-0" />
    <span>Connect {label} to use live data</span>
    <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs text-primary px-2 py-0">
      Connect
    </Button>
  </div>
);

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number | string; name: string; color?: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xl text-xs">
      {label && <p className="text-muted-foreground mb-1 font-tech">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="font-bold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
}

const SAAS_DATA = {
  currentMRR: 487250,
  prevMRR: 451800,
  currentARR: 5847000,
  prevARR: 5421600,
  nrr: 112,
  grr: 94,
  cacPayback: 11.4,
  ltv: 52400,
  cac: 4200,
  grossMargin: 74,
  burnRate: 185000,
  bankBalance: 3240000,
  runway: 17.5,
  churnRate: 2.1,

  mrrWaterfall: [
    { name: "Prior MRR", value: 451800 },
    { name: "New MRR", value: 52400, type: "new" },
    { name: "Expansion", value: 28600, type: "expansion" },
    { name: "Contraction", value: -12300, type: "contraction" },
    { name: "Churn", value: -33250, type: "churn" },
    { name: "Current MRR", value: 487250 },
  ],

  mrrTrend: [
    { month: "Sep", mrr: 389000, arr: 4668000 },
    { month: "Oct", mrr: 411000, arr: 4932000 },
    { month: "Nov", mrr: 428500, arr: 5142000 },
    { month: "Dec", mrr: 441200, arr: 5294400 },
    { month: "Jan", mrr: 451800, arr: 5421600 },
    { month: "Feb", mrr: 461400, arr: 5536800 },
    { month: "Mar", mrr: 487250, arr: 5847000 },
  ],

  cohortRetention: [
    { cohort: "Jan '25", m0: 100, m1: 92, m2: 87, m3: 85, m4: 83, m5: 81, m6: 80 },
    { cohort: "Feb '25", m0: 100, m1: 93, m2: 88, m3: 86, m4: 84, m5: 82 },
    { cohort: "Mar '25", m0: 100, m1: 91, m2: 86, m3: 84, m4: 82 },
    { cohort: "Apr '25", m0: 100, m1: 94, m2: 89, m3: 87 },
    { cohort: "May '25", m0: 100, m1: 92, m2: 87 },
    { cohort: "Jun '25", m0: 100, m1: 93 },
    { cohort: "Jul '25", m0: 100 },
  ],

  unitEconomics: {
    ltv: 52400,
    cac: 4200,
    ltvCacRatio: 12.5,
    paybackMonths: 11.4,
    grossMargin: 74,
    contributionMargin: 61,
    breakevenMonths: 8.2,
  },

  cashFlow: [
    { month: "Sep", inflow: 389000, outflow: 201000, netCash: 188000, balance: 2460000 },
    { month: "Oct", inflow: 411000, outflow: 198000, netCash: 213000, balance: 2673000 },
    { month: "Nov", inflow: 428500, outflow: 195000, netCash: 233500, balance: 2906500 },
    { month: "Dec", inflow: 441200, outflow: 207000, netCash: 234200, balance: 3140700 },
    { month: "Jan", inflow: 451800, outflow: 189000, netCash: 262800, balance: 3403500 },
    { month: "Feb", inflow: 461400, outflow: 181000, netCash: 280400, balance: 3683900 },
    { month: "Mar", inflow: 487250, outflow: 185000, netCash: 302250, balance: 3240000 },
  ],

  arAging: [
    { bucket: "Current", amount: 142000 },
    { bucket: "1-30 days", amount: 38400 },
    { bucket: "31-60 days", amount: 12200 },
    { bucket: "61-90 days", amount: 4800 },
    { bucket: "90+ days", amount: 1900 },
  ],

  churnRiskCustomers: [
    { name: "TechCorp Global", score: 87, arr: 84000, signals: ["Usage -42%", "No login 18d", "3 tickets"] },
    { name: "Meridian Labs", score: 74, arr: 62000, signals: ["Usage -28%", "Contract renewal due"] },
    { name: "Apex Systems", score: 68, arr: 48000, signals: ["No QBR attended", "Champion left"] },
    { name: "FuturePath Inc", score: 61, arr: 36000, signals: ["Feature requests declining"] },
    { name: "DataStream Co", score: 54, arr: 28000, signals: ["Downgrade attempted"] },
  ],

  exitReasons: [
    { reason: "Price too high", pct: 34 },
    { reason: "Switched competitor", pct: 28 },
    { reason: "Budget cuts", pct: 21 },
    { reason: "Product gaps", pct: 12 },
    { reason: "Other", pct: 5 },
  ],

  benchmarks: [
    { metric: "NRR", company: 112, benchmark: 110, good: 120 },
    { metric: "ARR Growth", company: 38, benchmark: 25, good: 50 },
    { metric: "Gross Margin", company: 74, benchmark: 70, good: 80 },
    { metric: "CAC Payback", company: 11.4, benchmark: 15, good: 12 },
    { metric: "Churn Rate", company: 2.1, benchmark: 3.0, good: 1.5 },
    { metric: "LTV:CAC", company: 12.5, benchmark: 3.0, good: 5.0 },
  ],

  capitalEfficiency: [
    { month: "Sep", magicNumber: 0.68, ruleOf40: 29 },
    { month: "Oct", magicNumber: 0.72, ruleOf40: 31 },
    { month: "Nov", magicNumber: 0.74, ruleOf40: 34 },
    { month: "Dec", magicNumber: 0.79, ruleOf40: 35 },
    { month: "Jan", magicNumber: 0.81, ruleOf40: 38 },
    { month: "Feb", magicNumber: 0.84, ruleOf40: 39 },
    { month: "Mar", magicNumber: 0.87, ruleOf40: 42 },
  ],

  dti: {
    totalDebt: 1200000,
    annualRevenue: 5847000,
    monthlyRevenue: 487250,
    monthlyDebt: 28500,
    ebitda: 1462000,
    debtService: 342000,
    traditionalDti: 24.5,
    saasOptimizedDti: 20.5,
    dscr: 4.27,
  },

  scenarios: [
    {
      id: "price-increase",
      name: "10% Price Increase",
      arrImpact: +584700,
      churnImpact: +0.8,
      netImpact: +350820,
      probability: 72,
      recommendation: "Implement in Q2 with grandfathering for existing customers",
    },
    {
      id: "acquisition-spike",
      name: "2× Acquisition Rate",
      arrImpact: +1169400,
      churnImpact: +0.2,
      netImpact: +1064000,
      probability: 48,
      recommendation: "Requires +$380K in sales & marketing spend",
    },
    {
      id: "new-market",
      name: "EMEA Market Entry",
      arrImpact: +874000,
      churnImpact: +0.3,
      netImpact: +612000,
      probability: 61,
      recommendation: "18-month timeline; hire 2 regional sales reps",
    },
    {
      id: "churn-reduction",
      name: "Halve Churn Rate",
      arrImpact: +486000,
      churnImpact: -1.05,
      netImpact: +486000,
      probability: 65,
      recommendation: "Invest $120K in CS team + automated health scoring",
    },
  ],
};

type PanelId =
  | "arr-mrr"
  | "cohort"
  | "unit-economics"
  | "cash-flow"
  | "churn"
  | "pricing-sim"
  | "benchmarking"
  | "capital-efficiency"
  | "dti"
  | "what-if"
  | "board-report";

const PANELS: { id: PanelId; label: string; icon: React.ElementType }[] = [
  { id: "arr-mrr", label: "ARR/MRR Analytics", icon: TrendingUp },
  { id: "cohort", label: "Cohort Analysis", icon: Layers },
  { id: "unit-economics", label: "Unit Economics", icon: Target },
  { id: "cash-flow", label: "Cash Flow & Runway", icon: DollarSign },
  { id: "churn", label: "Churn Analysis", icon: TrendingDown },
  { id: "pricing-sim", label: "Pricing Simulator", icon: Settings2 },
  { id: "benchmarking", label: "Benchmarking", icon: BarChart3 },
  { id: "capital-efficiency", label: "Capital Efficiency", icon: Zap },
  { id: "dti", label: "DTI Ratio", icon: Shield },
  { id: "what-if", label: "What-If Scenarios", icon: Activity },
  { id: "board-report", label: "Board Report", icon: FileText },
];

function InsightBar({ insights }: { insights: string[] }) {
  return (
    <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
      <div className="flex items-center gap-2 mb-2">
        <Star className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-tech text-primary uppercase tracking-wider">CFO Sentinel Marcus — Insights</span>
      </div>
      <ul className="space-y-1">
        {insights.map((ins, i) => (
          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
            <span className="text-primary mt-0.5">›</span>
            {ins}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ARRMRRPanel() {
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

function CohortPanel() {
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

function UnitEconomicsPanel() {
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

function CashFlowPanel() {
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

function ChurnPanel() {
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

function PricingSimPanel() {
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

function BenchmarkingPanel() {
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

function CapitalEfficiencyPanel() {
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

function DTIPanel() {
  const dti = SAAS_DATA.dti;

  const getRiskBadge = (dscr: number) => {
    if (dscr >= 3) return <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Low Risk</Badge>;
    if (dscr >= 1.5) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30">Moderate Risk</Badge>;
    return <Badge className="bg-red-500/10 text-red-500 border-red-500/30">High Risk</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Traditional DTI", value: `${dti.traditionalDti}%`, sub: "Total debt / annual revenue", color: "text-amber-500" },
          { label: "SaaS-Optimized DTI", value: `${dti.saasOptimizedDti}%`, sub: "Debt / ARR (recurring)", color: "text-green-500" },
          { label: "DSCR", value: `${dti.dscr}x`, sub: "Debt service coverage ratio", color: "text-green-500" },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-tech text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Risk Interpretation</CardTitle>
            {getRiskBadge(dti.dscr)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Total Debt</p>
              <p className="font-bold">${(dti.totalDebt / 1e6).toFixed(2)}M</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Annual Revenue (ARR)</p>
              <p className="font-bold">${(dti.annualRevenue / 1e6).toFixed(2)}M</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">Monthly Debt Service</p>
              <p className="font-bold">${dti.monthlyDebt.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-tech mb-1">EBITDA (TTM)</p>
              <p className="font-bold">${(dti.ebitda / 1e6).toFixed(2)}M</p>
            </div>
          </div>
          <div className="border-t border-border/30 pt-4 space-y-3">
            <div>
              <p className="text-xs font-bold mb-1">Traditional DTI ({dti.traditionalDti}%)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(dti.traditionalDti, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Below 40% is acceptable for lenders; below 20% is preferred.</p>
            </div>
            <div>
              <p className="text-xs font-bold mb-1">SaaS-Optimized DTI ({dti.saasOptimizedDti}%)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(dti.saasOptimizedDti, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Adjusted for recurring revenue — banks and VCs prefer this metric for SaaS.</p>
            </div>
            <div>
              <p className="text-xs font-bold mb-1">DSCR ({dti.dscr}x)</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min((dti.dscr / 5) * 100, 100)}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">&gt;1.25x = lender minimum; &gt;2x = healthy; &gt;3x = excellent credit standing.</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <InsightBar insights={[
        `DSCR of ${dti.dscr}x means you generate ${dti.dscr}x the cash needed to service all debt — excellent position for any debt financing round.`,
        "SaaS-optimized DTI of 20.5% is below the 25% threshold that most growth lenders require. You can safely take on 20-25% more debt if needed for growth.",
        "Traditional DTI understates your capacity because it ignores the predictable, recurring nature of ARR. Always present SaaS DTI to potential lenders.",
      ]} />
    </div>
  );
}

function WhatIfPanel() {
  const [customARR, setCustomARR] = useState(0);
  const [customChurn, setCustomChurn] = useState(0);
  const scenarios = SAAS_DATA.scenarios;

  const chartData = scenarios.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + "…" : s.name,
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

function BoardReportPanel() {
  const d = SAAS_DATA;
  const [generated, setGenerated] = useState(false);

  const report = `BOARD OF DIRECTORS — FINANCIAL REPORT
Period: Q1 2026 | Prepared by: CFO Sentinel Marcus
Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The company closed Q1 2026 with ARR of $5.85M, representing 38% year-over-year growth and tracking above the 25% SaaS industry median. MRR reached $487,250, up 7.8% month-over-month, driven by $28.6K in expansion revenue and $52.4K in new logo ARR. Net Revenue Retention of 112% confirms strong product-market fit and effective land-and-expand motion.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY PERFORMANCE INDICATORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ARR:               $${(d.currentARR / 1e6).toFixed(2)}M  (+38% YoY)
  MRR:               $${(d.currentMRR / 1000).toFixed(0)}K  (+7.8% MoM)
  NRR:               ${d.nrr}%         (target: >110%)
  GRR:               ${d.grr}%          (target: >90%)
  Gross Margin:      ${d.grossMargin}%          (target: >70%)
  Monthly Burn:      $${(d.burnRate / 1000).toFixed(0)}K
  Bank Balance:      $${(d.bankBalance / 1e6).toFixed(2)}M
  Runway:            ${Math.round(d.bankBalance / d.burnRate)} months
  Churn Rate:        ${d.churnRate}%/mo     (target: <2.5%)
  LTV:CAC:           ${(d.ltv / d.cac).toFixed(1)}x          (target: >3x)
  CAC Payback:       ${d.cacPayback} months  (target: <15mo)
  Rule of 40:        42%          (target: >40%)
  Magic Number:      0.87          (target: >0.75)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIANCE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  New MRR vs Plan:     $52.4K vs $48.0K  (+9.2% ahead of plan)
  Expansion vs Plan:   $28.6K vs $25.0K  (+14.4% ahead of plan)
  Churn vs Plan:       $33.3K vs $30.0K  (+11.0% — requires attention)
  Burn vs Budget:      $185K vs $195K    (5.1% favorable variance)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORWARD-LOOKING STATEMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. At current growth rate, ARR will exceed $7.0M by Q4 2026 — this triggers the threshold for Series B conversations.
2. Churn exceeded plan by $3.3K this month. 5 at-risk accounts represent $258K ARR. Recommend urgent CS intervention.
3. A 10% price increase (72% probability scenario) would yield +$350K net ARR with minimal churn impact if executed at renewal cycles.
4. Runway of 17.5 months is comfortable. Begin Series B preparation at 12-month mark (approximately September 2026).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDED BOARD ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  □ Approve $120K CS team investment to address churn spike
  □ Authorize pricing increase initiative for Q2 rollout
  □ Ratify EMEA expansion feasibility study (Q2 deliverable)
  □ Commission Series B readiness assessment

[DEMO DATA — Connect live data sources to generate real board reports]`;

  return (
    <div className="space-y-6">
      {!generated ? (
        <Card className="border-border/50">
          <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Board Report Generator</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Generate a board-ready executive financial summary covering all KPIs, variance analysis, and forward-looking statements.
              </p>
            </div>
            <Button onClick={() => setGenerated(true)} className="gap-2">
              <FileText className="w-4 h-4" />
              Generate Board Report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-tech text-muted-foreground uppercase tracking-wider">Executive Summary — Q1 2026</CardTitle>
              <div className="flex gap-2">
                {DEMO_BADGE}
                <Button variant="outline" size="sm" onClick={() => {
                  const blob = new Blob([report], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "board-report-q1-2026.txt";
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setGenerated(false)}>Reset</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg whitespace-pre-wrap overflow-x-auto leading-relaxed border border-border/30">
              {report}
            </pre>
          </CardContent>
        </Card>
      )}
      <InsightBar insights={[
        "Board report generated from live dashboard metrics. Connect Stripe, QuickBooks, and your bank feed to replace demo data with actuals.",
        "Variance analysis shows churn 11% over plan — lead with this in board discussions and present the CS investment proposal alongside.",
        "Forward-looking statements are model-generated. Review with your legal team before filing as forward guidance.",
      ]} />
    </div>
  );
}

function ChatSlideOver({ botId, onClose }: { botId: number; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);

  const { data: conversations } = useConversations(null, botId);
  const startConvo = useStartConversation();
  const { data: messages } = useChatMessages(activeConvoId ?? 0);

  useEffect(() => {
    if (conversations?.[0]?.id) {
      setActiveConvoId(conversations[0].id);
    }
  }, [conversations]);

  const onStreamComplete = useCallback(() => {
    if (activeConvoId) {
      queryClient.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(activeConvoId) });
    }
  }, [activeConvoId, queryClient]);

  const onStreamError = useCallback((error: string) => {
    toast({ title: "Chat error", description: error || "Failed to send message", variant: "destructive" });
  }, [toast]);

  const { isStreaming, events: streamEvents, startStream } = useSSEStream({
    onComplete: onStreamComplete,
    onError: onStreamError,
  });

  const streamingText = streamEvents
    .filter((e) => e.type === "message")
    .map((e) => e.content ?? "")
    .join("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamEvents]);

  const ensureConversation = async (): Promise<number> => {
    if (activeConvoId) return activeConvoId;
    const convo = await startConvo.mutateAsync({ data: { botId, title: "CFO Dashboard Chat" } });
    const id = convo.id;
    setActiveConvoId(id);
    return id;
  };

  const handleSend = async () => {
    if (!message.trim() || isStreaming) return;
    const content = message.trim();
    setMessage("");

    try {
      const convoId = await ensureConversation();
      await startStream(`/api/conversations/${convoId}/messages/stream`, {
        content,
        senderName: "User",
      });
    } catch (err) {
      toast({
        title: "Failed to send message",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md bg-background border-l border-border shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">CFO Sentinel Marcus</span>
          <Badge variant="outline" className="text-[10px]">Finance Director</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(!messages || messages.length === 0) && !isStreaming && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-primary/40" />
            <p>Ask Marcus about any metric, trend, or financial decision.</p>
          </div>
        )}
        {(messages ?? []).map((m: { id: number; role: string; content: string }) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3 py-2 text-sm",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              {m.content}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-muted">
              {streamingText || <span className="animate-pulse">▊</span>}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Marcus anything..."
            disabled={isStreaming}
            className="text-sm"
          />
          <Button size="sm" onClick={handleSend} disabled={isStreaming || !message.trim()}>
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CFODashboard() {
  const params = useParams<{ id: string }>();
  const botId = Number(params.id);
  const { data: bot } = useBot(botId);

  const [activePanel, setActivePanel] = useState<PanelId>("arr-mrr");
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeInfo = PANELS.find((p) => p.id === activePanel)!;

  const renderPanel = () => {
    switch (activePanel) {
      case "arr-mrr": return <ARRMRRPanel />;
      case "cohort": return <CohortPanel />;
      case "unit-economics": return <UnitEconomicsPanel />;
      case "cash-flow": return <CashFlowPanel />;
      case "churn": return <ChurnPanel />;
      case "pricing-sim": return <PricingSimPanel />;
      case "benchmarking": return <BenchmarkingPanel />;
      case "capital-efficiency": return <CapitalEfficiencyPanel />;
      case "dti": return <DTIPanel />;
      case "what-if": return <WhatIfPanel />;
      case "board-report": return <BoardReportPanel />;
    }
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-4rem)] overflow-hidden relative">
        <aside className={cn(
          "shrink-0 w-64 border-r border-border/50 bg-card/50 flex-col overflow-y-auto transition-transform duration-200 z-30",
          "hidden lg:flex",
        )}>
          <div className="p-4 border-b border-border/50">
            <Link href={`/bots/${botId}`}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 mb-3 -ml-1">
                <ArrowLeft className="w-4 h-4" />
                Back to Bot
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{bot?.name ?? "CFO Sentinel Marcus"}</p>
                <p className="text-[10px] text-muted-foreground font-tech">{bot?.title ?? "Finance Director"}</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-2">
            {PANELS.map((panel) => {
              const Icon = panel.icon;
              return (
                <button
                  key={panel.id}
                  onClick={() => setActivePanel(panel.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left mb-0.5",
                    activePanel === panel.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {panel.label}
                </button>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border/50">
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setChatOpen(true)}>
              <MessageSquare className="w-4 h-4" />
              Chat with Marcus
            </Button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/30 shrink-0">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <activeInfo.icon className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-base">{activeInfo.label}</h1>
                  {DEMO_BADGE}
                </div>
                <p className="text-[11px] text-muted-foreground font-tech hidden sm:block">CFO Financial Command Center</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 hidden sm:flex">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                Live Demo
              </Badge>
              <Button size="sm" className="gap-2" onClick={() => setChatOpen(true)}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Ask Marcus</span>
              </Button>
            </div>
          </header>

          {sidebarOpen && (
            <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)}>
              <div className="w-64 h-full bg-card border-r border-border/50 p-2" onClick={(e) => e.stopPropagation()}>
                {PANELS.map((panel) => {
                  const Icon = panel.icon;
                  return (
                    <button
                      key={panel.id}
                      onClick={() => { setActivePanel(panel.id); setSidebarOpen(false); }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left mb-0.5",
                        activePanel === panel.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {panel.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {renderPanel()}
          </main>
        </div>

        {chatOpen && bot && (
          <>
            <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
            <ChatSlideOver botId={botId} onClose={() => setChatOpen(false)} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
