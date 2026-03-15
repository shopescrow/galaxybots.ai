import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
  TrendingUp, DollarSign, Users, Building, Zap,
  Globe, Shield, Target, ArrowUpRight, AlertTriangle, Star
} from "lucide-react";
import { Link } from "wouter";

// ─── DATA ────────────────────────────────────────────────────────────────────

const YEARS = ["2026", "2027", "2028", "2029", "2030"];

const projections = [
  {
    year: "2026", clients: 60, revenue: 1.86, expenses: 1.4, netProfit: 0.46,
    bull: 12, base: 8, bear: 5,
    revSingle: 0.36, revTeam: 0.9, revEnterprise: 0.6,
  },
  {
    year: "2027", clients: 220, revenue: 8.2, expenses: 4.1, netProfit: 4.1,
    bull: 65, base: 45, bear: 28,
    revSingle: 1.2, revTeam: 3.6, revEnterprise: 3.4,
  },
  {
    year: "2028", clients: 580, revenue: 26, expenses: 12.4, netProfit: 13.6,
    bull: 210, base: 155, bear: 95,
    revSingle: 3.2, revTeam: 10.1, revEnterprise: 12.7,
  },
  {
    year: "2029", clients: 1280, revenue: 64, expenses: 27.5, netProfit: 36.5,
    bull: 580, base: 420, bear: 260,
    revSingle: 6.8, revTeam: 22.4, revEnterprise: 34.8,
  },
  {
    year: "2030", clients: 3100, revenue: 152, expenses: 63, netProfit: 89,
    bull: 1800, base: 1250, bear: 750,
    revSingle: 14.6, revTeam: 51.2, revEnterprise: 86.2,
  },
];

const expenseBreakdown = [
  { year: "2026", infrastructure: 0.3, aiapi: 0.25, team: 0.5, marketing: 0.2, ops: 0.15 },
  { year: "2027", infrastructure: 0.8, aiapi: 0.7, team: 1.5, marketing: 0.7, ops: 0.4 },
  { year: "2028", infrastructure: 1.8, aiapi: 1.6, team: 4.5, marketing: 2.5, ops: 2.0 },
  { year: "2029", infrastructure: 3.5, aiapi: 3.2, team: 10.8, marketing: 5.8, ops: 4.2 },
  { year: "2030", infrastructure: 7.2, aiapi: 6.9, team: 24.5, marketing: 13.5, ops: 10.9 },
];

const revenueByTier2030 = [
  { name: "Single Director", value: 14.6, color: "#22d3ee" },
  { name: "Department Team", value: 51.2, color: "#8b5cf6" },
  { name: "Full Board", value: 86.2, color: "#f59e0b" },
];

const assumptions = [
  { label: "Average Revenue Per Client (Year 1)", value: "$31K/yr", icon: DollarSign },
  { label: "Average Revenue Per Client (Year 5)", value: "$49K/yr", icon: TrendingUp },
  { label: "Monthly Churn Rate", value: "1.5%", icon: Users },
  { label: "Year-Over-Year Client Growth", value: "2.8x avg", icon: ArrowUpRight },
  { label: "AI API Cost as % of Revenue", value: "~4–5%", icon: Zap },
  { label: "SaaS Revenue Multiple (Year 5)", value: "8–12x ARR", icon: Building },
];

const COLORS_EXPENSE = {
  infrastructure: "#22d3ee",
  aiapi: "#8b5cf6",
  team: "#f59e0b",
  marketing: "#10b981",
  ops: "#ef4444",
};

function fmt(n: number, decimals = 1) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  if (n >= 1) return `$${n.toFixed(decimals)}M`;
  return `$${(n * 1000).toFixed(0)}K`;
}

function SectionHeader({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <div className="text-xs font-tech uppercase tracking-widest text-primary mb-2">{label}</div>
      <h2 className="text-2xl sm:text-3xl font-display font-bold">{title}</h2>
      {sub && <p className="text-muted-foreground mt-2">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4 shadow-xl text-sm">
      <p className="font-tech font-bold text-foreground mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-bold text-foreground">{typeof entry.value === 'number' ? fmt(entry.value) : entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Valuation() {
  const headerRef = useRef<HTMLDivElement>(null);
  const headerInView = useInView(headerRef, { once: true });
  const prefersReducedMotion = useReducedMotion();

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 space-y-24 max-w-7xl">

        {/* HERO */}
        <motion.div
          ref={headerRef}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          animate={headerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: prefersReducedMotion ? 0 : 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-full px-4 py-2 text-xs font-tech text-gold uppercase tracking-widest mb-8">
            <TrendingUp className="w-3.5 h-3.5" />
            5-Year Financial Projections · Confidential
          </div>
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 leading-tight">
            GalaxyBots.ai<br />
            <span className="text-gradient">Valuation Outlook</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Projected financial performance, expense structure, and valuation range for 2026–2030. Based on SaaS industry benchmarks, AI adoption curves, and white-label market dynamics.
          </p>

          {/* Year 5 headline numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12">
            {[
              { label: "2030 ARR", value: "$152M", color: "text-cyan", border: "border-cyan/20", bg: "bg-cyan/5" },
              { label: "2030 Net Profit", value: "$89M", color: "text-primary", border: "border-primary/20", bg: "bg-primary/5" },
              { label: "2030 Clients", value: "3,100+", color: "text-gold", border: "border-gold/20", bg: "bg-gold/5" },
              { label: "Valuation Range", value: "$750M–$1.8B", color: "text-purple", border: "border-purple/20", bg: "bg-purple/5" },
            ].map((kpi, i) => (
              <motion.div
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
                animate={headerInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: prefersReducedMotion ? 0 : 0.3 + i * 0.1  }}
                className={`p-5 rounded-2xl border ${kpi.border} ${kpi.bg} text-center`}
              >
                <div className={`text-2xl sm:text-3xl font-display font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-xs text-muted-foreground font-tech mt-1.5 uppercase tracking-wider">{kpi.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── SECTION 1: Revenue + Profit Overview ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Revenue & Profitability"
            title="Revenue, Expenses & Net Profit"
            sub="All figures in USD millions. Base case projections."
          />
          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <ResponsiveContainer width="100%" height={380}>
              <AreaChart data={projections} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 12, fontFamily: "Chakra Petch" }} />
                <YAxis tickFormatter={(v) => `$${v}M`} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "16px", fontFamily: "Chakra Petch", fontSize: "12px" }} />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#revGrad)" dot={{ fill: "#8b5cf6", r: 4 }} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expGrad)" dot={{ fill: "#ef4444", r: 3 }} />
                <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#22d3ee" strokeWidth={2.5} fill="url(#profitGrad)" dot={{ fill: "#22d3ee", r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Year-by-year table */}
          <div className="mt-6 rounded-2xl border border-border/40 bg-card overflow-x-auto">
            <div className="min-w-[500px]">
              <div className="grid grid-cols-6 text-xs font-tech uppercase tracking-wider text-muted-foreground px-4 sm:px-6 py-4 border-b border-border/40 bg-secondary/30">
                <span>Year</span>
                <span className="text-right">Clients</span>
                <span className="text-right text-primary">Revenue</span>
                <span className="text-right text-red-400">Expenses</span>
                <span className="text-right text-cyan">Net Profit</span>
                <span className="text-right">Margin</span>
              </div>
              {projections.map((p, i) => (
                <motion.div
                  key={p.year}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -20  }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08  }}
                  className="grid grid-cols-6 px-4 sm:px-6 py-4 border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                >
                  <span className="font-display font-bold text-foreground">{p.year}</span>
                  <span className="text-right font-tech text-foreground/80">{p.clients.toLocaleString()}</span>
                  <span className="text-right font-bold text-primary">{fmt(p.revenue)}</span>
                  <span className="text-right text-red-400">{fmt(p.expenses)}</span>
                  <span className="text-right font-bold text-cyan">{fmt(p.netProfit)}</span>
                  <span className="text-right font-tech text-foreground/70">
                    {Math.round((p.netProfit / p.revenue) * 100)}%
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── SECTION 2: Valuation Scenarios ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Valuation Analysis"
            title="Bull / Base / Bear Valuation Scenarios"
            sub="Valuations in USD millions. Based on SaaS revenue multiples (8–12x ARR) + AI premium."
          />

          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={projections} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 12, fontFamily: "Chakra Petch" }} />
                <YAxis tickFormatter={(v) => v >= 1000 ? `$${v / 1000}B` : `$${v}M`} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "16px", fontFamily: "Chakra Petch", fontSize: "12px" }} />
                <Line type="monotone" dataKey="bull" name="Bull Case" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: "#f59e0b", r: 5 }} strokeDasharray="0" />
                <Line type="monotone" dataKey="base" name="Base Case" stroke="#8b5cf6" strokeWidth={3} dot={{ fill: "#8b5cf6", r: 6 }} />
                <Line type="monotone" dataKey="bear" name="Bear Case" stroke="#6b7280" strokeWidth={2} dot={{ fill: "#6b7280", r: 4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            {[
              {
                case: "Bear Case",
                val2030: "$750M",
                desc: "Slower AI enterprise adoption, higher churn, competitive pricing pressure. ~5x ARR multiple.",
                color: "text-muted-foreground",
                border: "border-border/40",
                bg: "",
                icon: AlertTriangle,
                iconColor: "text-muted-foreground",
              },
              {
                case: "Base Case",
                val2030: "$1.25B",
                desc: "Steady SaaS growth curve with expanding enterprise deals, BingoLingo.ai + partner channels producing consistent pipeline.",
                color: "text-primary",
                border: "border-primary/30",
                bg: "bg-primary/5",
                icon: Target,
                iconColor: "text-primary",
                recommended: true,
              },
              {
                case: "Bull Case",
                val2030: "$1.8B",
                desc: "Accelerated enterprise adoption, major white-label licensing deals, possible M&A premium from Fortune 500 acquirer.",
                color: "text-gold",
                border: "border-gold/30",
                bg: "bg-gold/5",
                icon: Star,
                iconColor: "text-gold",
              },
            ].map((scenario, i) => (
              <motion.div
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1  }}
                className={`relative p-6 rounded-2xl border ${scenario.border} ${scenario.bg}`}
              >
                {scenario.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary/20 border border-primary/40 text-primary text-xs font-tech font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                    Most Likely
                  </div>
                )}
                <scenario.icon className={`w-7 h-7 ${scenario.iconColor} mb-4`} />
                <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-1">{scenario.case}</div>
                <div className={`text-3xl font-display font-bold ${scenario.color} mb-3`}>{scenario.val2030}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{scenario.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── SECTION 3: Expense Breakdown ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Cost Structure"
            title="Annual Expense Breakdown by Category"
            sub="All figures in USD millions."
          />
          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={expenseBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 12, fontFamily: "Chakra Petch" }} />
                <YAxis tickFormatter={(v) => `$${v}M`} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: "16px", fontFamily: "Chakra Petch", fontSize: "12px" }} />
                <Bar dataKey="team" name="Team & Salaries" stackId="a" fill={COLORS_EXPENSE.team} radius={[0, 0, 0, 0]} />
                <Bar dataKey="marketing" name="Sales & Marketing" stackId="a" fill={COLORS_EXPENSE.marketing} />
                <Bar dataKey="ops" name="Operations" stackId="a" fill={COLORS_EXPENSE.ops} />
                <Bar dataKey="infrastructure" name="Infrastructure" stackId="a" fill={COLORS_EXPENSE.infrastructure} />
                <Bar dataKey="aiapi" name="AI API Costs" stackId="a" fill={COLORS_EXPENSE.aiapi} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Expense legend detail */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
            {[
              { key: "team", label: "Team & Salaries", pct: "39%", desc: "Engineering, Sales, CS, Operations" },
              { key: "marketing", label: "Sales & Marketing", pct: "21%", desc: "Ads, partners, content, events" },
              { key: "ops", label: "Operations", pct: "17%", desc: "Legal, finance, admin, compliance" },
              { key: "infrastructure", label: "Infrastructure", pct: "12%", desc: "Cloud hosting, databases, CDN" },
              { key: "aiapi", label: "AI API Costs", pct: "11%", desc: "OpenAI + model inference costs" },
            ].map((exp, i) => (
              <div key={i} className="p-4 rounded-xl border border-border/30 bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS_EXPENSE[exp.key as keyof typeof COLORS_EXPENSE] }} />
                  <span className="text-xs font-tech font-bold text-foreground">{exp.pct}</span>
                </div>
                <div className="text-xs font-semibold text-foreground mb-1">{exp.label}</div>
                <div className="text-xs text-muted-foreground">{exp.desc}</div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── SECTION 4: Revenue Mix ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Revenue Mix"
            title="2030 Revenue by Hiring Tier"
            sub="Full Board (Enterprise) becomes the dominant revenue driver by Year 5."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border/40 bg-card p-6 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueByTier2030}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {revenueByTier2030.map((entry, index) => (
                      <Cell key={index} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border/60 rounded-xl p-3 text-sm shadow-xl">
                          <div className="font-bold text-foreground">{d.name}</div>
                          <div className="text-muted-foreground">{fmt(d.value)} · {Math.round((d.value / 152) * 100)}%</div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-4 justify-center">
              {revenueByTier2030.map((tier, i) => (
                <motion.div
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: 30  }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1  }}
                  className="flex items-center gap-5 p-5 rounded-2xl border border-border/30 bg-card"
                >
                  <div className="w-4 h-full min-h-[50px] rounded-full shrink-0" style={{ background: tier.color }} />
                  <div className="flex-1">
                    <div className="font-display font-bold" style={{ color: tier.color }}>{tier.name}</div>
                    <div className="text-sm text-muted-foreground font-tech mt-0.5">
                      {Math.round((tier.value / 152) * 100)}% of total revenue
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-display font-bold text-foreground">{fmt(tier.value)}</div>
                    <div className="text-xs text-muted-foreground font-tech">2030 ARR</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ── SECTION 5: Client Growth ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Client Growth"
            title="Projected Client Base Expansion"
            sub="From 60 early adopters in 2026 to 3,100+ enterprise deployments by 2030."
          />
          <div className="rounded-2xl border border-border/40 bg-card p-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={projections} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 12, fontFamily: "Chakra Petch" }} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-card border border-border/60 rounded-xl p-3 text-sm shadow-xl">
                        <div className="font-tech font-bold mb-1">{label}</div>
                        <div className="text-primary font-bold">{payload[0].value?.toLocaleString()} clients</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="clients" name="Active Clients" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
                  {projections.map((_, i) => (
                    <Cell key={i} fill={`hsl(${265 + i * 10}, 75%, ${45 + i * 8}%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        {/* ── SECTION 6: Assumptions ── */}
        <motion.section
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20  }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
        >
          <SectionHeader
            label="Model Assumptions"
            title="Key Financial Assumptions"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assumptions.map((a, i) => (
              <motion.div
                key={i}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 15  }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07  }}
                className="flex items-start gap-4 p-5 rounded-2xl border border-border/30 bg-card"
              >
                <a.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground font-tech mb-1">{a.label}</div>
                  <div className="text-lg font-display font-bold text-foreground">{a.value}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Disclaimer */}
        <div className="text-center text-xs text-muted-foreground font-tech border-t border-border/30 pt-8 max-w-3xl mx-auto">
          <Shield className="w-4 h-4 mx-auto mb-2 opacity-40" />
          These projections are internal strategic estimates for planning purposes only. They are not financial advice, audited financials, or a guarantee of future performance. Actual results will vary based on market conditions, competition, execution, and macroeconomic factors. Strictly confidential — property of Gifted Productions Inc. / GalaxyBots.ai.
        </div>
      </div>
    </AppLayout>
  );
}
