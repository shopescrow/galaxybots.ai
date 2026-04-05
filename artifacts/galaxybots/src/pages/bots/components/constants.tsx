import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Layers,
  Zap,
  Target,
  Shield,
  FileText,
  Settings2,
  TrendingDown,
  Activity,
  Database,
  Star,
} from "lucide-react";

export const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(173 58% 39%)",
  "hsl(270 50% 60%)",
  "hsl(43 74% 66%)",
  "hsl(12 76% 61%)",
];

export const DEMO_BADGE = (
  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/5 ml-2">
    Demo Data
  </Badge>
);

export const CONNECT_PROMPT = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
    <Database className="w-3 h-3 text-primary shrink-0" />
    <span>Connect {label} to use live data</span>
    <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs text-primary px-2 py-0">
      Connect
    </Button>
  </div>
);

export type PanelId =
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

export const PANELS: { id: PanelId; label: string; icon: React.ElementType }[] = [
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

export function InsightBar({ insights }: { insights: string[] }) {
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

export function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number | string; name: string; color?: string }>; label?: string }) {
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

export const SAAS_DATA = {
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
