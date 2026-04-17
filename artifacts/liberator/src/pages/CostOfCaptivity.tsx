import { useState, useEffect, useRef } from "react";
import { useInView } from "framer-motion";
import { RevealWrapper, RevealItem } from "@/components/RevealWrapper";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  DollarSign,
  Clock,
  ShieldCheck,
  TrendingDown,
  Lock,
  FileSearch,
  CreditCard,
  Scale,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";

function CountUp({ end, suffix = "", prefix = "", duration = 2000 }: { end: number; suffix?: string; prefix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, end, duration]);

  return (
    <span ref={ref}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

const migrationComparisonData = [
  { name: "IT Hours\nRequired", traditional: 120, liberator: 4, label: "IT Hours" },
  { name: "Report\nRebuilds", traditional: 85, liberator: 0, label: "Report Rebuilds" },
  { name: "Days to\nComplete", traditional: 45, liberator: 1, label: "Days to Complete" },
];

const costBreakdownData = [
  { name: "API Development", value: 35, fill: "hsl(var(--chart-2))" },
  { name: "Data Mapping", value: 25, fill: "hsl(var(--chart-3))" },
  { name: "Testing & QA", value: 20, fill: "hsl(var(--chart-4))" },
  { name: "Downtime Cost", value: 20, fill: "hsl(var(--chart-5))" },
];

const dayInLifeSteps = [
  {
    icon: CreditCard,
    title: "Overpaying for features you don't use",
    description: "Locked into enterprise tiers just to keep your data accessible. Every month, you pay for 200 features but only use 12.",
  },
  {
    icon: FileSearch,
    title: "Needing a specialist just to pull a report",
    description: "Your own data sits behind complex query builders, custom fields, and admin-only exports. A simple CSV takes a support ticket.",
  },
  {
    icon: Lock,
    title: "Data trapped behind paywalls",
    description: "Want to export your contacts with attachments? That's an add-on. Need historical activity logs? Upgrade required.",
  },
];

export function CostOfCaptivity() {
  const [crmSpend, setCrmSpend] = useState(5000);
  const [recordCount, setRecordCount] = useState(50000);
  const [itRate, setItRate] = useState(150);

  const traditionalCost = Math.round(itRate * 120 + crmSpend * 2 + recordCount * 0.02);
  const liberatorCost = 499;
  const savings = Math.max(0, traditionalCost - liberatorCost);
  const savingsPercent = traditionalCost > 0 ? Math.round((savings / traditionalCost) * 100) : 0;

  return (
    <div className="space-y-16 animate-in fade-in duration-500 pb-16">
      <RevealWrapper>
        <div className="text-center max-w-3xl mx-auto">
          <RevealItem>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-6">
              <TrendingDown className="w-4 h-4" />
              Interactive Infographic
            </div>
          </RevealItem>
          <RevealItem delay={0.1}>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              The Cost of{" "}
              <span className="text-primary">Captivity</span>
            </h1>
          </RevealItem>
          <RevealItem delay={0.2}>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Every day your data stays locked inside a vendor's platform, your organization
              pays a hidden tax — in money, time, and lost opportunity. Here's what captivity
              really costs.
            </p>
          </RevealItem>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              A Day in the Life of CRM Lock-In
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              Sound familiar? You're not alone.
            </p>
          </RevealItem>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {dayInLifeSteps.map((step, i) => (
              <RevealItem key={step.title} delay={0.1 * (i + 1)}>
                <Card className="bg-card border-border h-full group hover:border-destructive/30 transition-colors">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4 group-hover:bg-destructive/20 transition-colors">
                      <step.icon className="w-6 h-6 text-destructive" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
              </RevealItem>
            ))}
          </div>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: "Completion Rate", value: 95, suffix: "%", icon: CheckCircle2, color: "text-primary" },
            { label: "Avg. Time-to-Value", value: 4, suffix: " hrs", icon: Clock, color: "text-chart-5" },
            { label: "API Dependencies", value: 0, suffix: "", icon: ShieldCheck, color: "text-primary", prefix: "" },
            { label: "Avg. Cost Savings", value: 94, suffix: "%", icon: DollarSign, color: "text-chart-4" },
          ].map((stat, i) => (
            <RevealItem key={stat.label} delay={0.1 * (i + 1)}>
              <Card className="bg-card border-border">
                <CardContent className="pt-6 text-center">
                  <stat.icon className={`w-8 h-8 mx-auto mb-3 ${stat.color}`} />
                  <div className={`text-3xl font-bold ${stat.color}`}>
                    <CountUp end={stat.value} suffix={stat.suffix} prefix={stat.prefix || ""} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-primary" />
              </div>
              Traditional Migration vs. The Liberator
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              Side-by-side comparison of effort required for a typical CRM data migration.
            </p>
          </RevealItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <RevealItem delay={0.1}>
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Effort Comparison</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={migrationComparisonData} barGap={8}>
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "hsl(215 20% 65%)", fontSize: 12 }}
                        axisLine={{ stroke: "hsl(215 28% 17%)" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "hsl(215 20% 65%)", fontSize: 12 }}
                        axisLine={{ stroke: "hsl(215 28% 17%)" }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(220 20% 8%)",
                          border: "1px solid hsl(215 28% 17%)",
                          borderRadius: "6px",
                          color: "hsl(210 40% 98%)",
                        }}
                      />
                      <Bar dataKey="traditional" name="Traditional" radius={[4, 4, 0, 0]}>
                        {migrationComparisonData.map((_, index) => (
                          <Cell key={`trad-${index}`} fill="hsl(0 84% 60%)" fillOpacity={0.7} />
                        ))}
                      </Bar>
                      <Bar dataKey="liberator" name="Liberator" radius={[4, 4, 0, 0]}>
                        {migrationComparisonData.map((_, index) => (
                          <Cell key={`lib-${index}`} fill="hsl(160 84% 39%)" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-6 mt-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(0 84% 60%)", opacity: 0.7 }} />
                      <span className="text-muted-foreground">Traditional</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(160 84% 39%)" }} />
                      <span className="text-muted-foreground">Liberator</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
            <RevealItem delay={0.2}>
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <h3 className="font-semibold mb-4">Where Traditional Migration Costs Go</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={costBreakdownData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={{ stroke: "hsl(215 20% 65%)" }}
                      >
                        {costBreakdownData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(220 20% 8%)",
                          border: "1px solid hsl(215 28% 17%)",
                          borderRadius: "6px",
                          color: "hsl(210 40% 98%)",
                        }}
                        formatter={(value: number) => [`${value}%`, "Share"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </RevealItem>
          </div>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-chart-4/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-chart-4" />
              </div>
              Switching Cost Calculator
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              Enter your numbers to see how much you could save with The Liberator.
            </p>
          </RevealItem>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <RevealItem delay={0.1}>
              <Card className="bg-card border-border">
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="crmSpend">Monthly CRM Spend ($)</Label>
                    <Input
                      id="crmSpend"
                      type="number"
                      value={crmSpend}
                      onChange={(e) => setCrmSpend(Number(e.target.value) || 0)}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recordCount">Number of Records</Label>
                    <Input
                      id="recordCount"
                      type="number"
                      value={recordCount}
                      onChange={(e) => setRecordCount(Number(e.target.value) || 0)}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="itRate">IT Hourly Rate ($)</Label>
                    <Input
                      id="itRate"
                      type="number"
                      value={itRate}
                      onChange={(e) => setItRate(Number(e.target.value) || 0)}
                      className="bg-background"
                    />
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
            <RevealItem delay={0.2}>
              <Card className="bg-card border-primary/30">
                <CardContent className="pt-6 space-y-6">
                  <div className="text-center space-y-1">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">Traditional Migration Cost</p>
                    <p className="text-3xl font-bold text-destructive">${traditionalCost.toLocaleString()}</p>
                  </div>
                  <div className="border-t border-border pt-4 text-center space-y-1">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">With The Liberator</p>
                    <p className="text-3xl font-bold text-primary">${liberatorCost.toLocaleString()}</p>
                  </div>
                  <div className="border-t border-border pt-4 text-center space-y-1">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">Your Savings</p>
                    <p className="text-4xl font-bold text-chart-4">
                      ${savings.toLocaleString()}
                    </p>
                    <p className="text-sm text-chart-4">{savingsPercent}% less than the traditional approach</p>
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
          </div>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                <Scale className="w-4 h-4 text-primary" />
              </div>
              Your Rights
            </h2>
          </RevealItem>
          <RevealItem delay={0.1}>
            <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-lg">GDPR — Right to Data Portability</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Under Article 20 of the GDPR, you have the legal right to receive your personal data
                      in a structured, commonly used, and machine-readable format. You also have the right
                      to transmit that data to another controller without hindrance. Your data is yours —
                      exercising this right is not just legal, it's fundamental.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-lg">CCPA — Right to Know & Access</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      The California Consumer Privacy Act gives businesses and individuals the right to know
                      what data is collected about them and to access that data in a portable format.
                      The Liberator helps you exercise these rights efficiently and completely — because
                      your data belongs to you.
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-primary/10 text-center">
                  <p className="text-sm text-muted-foreground italic">
                    "Data portability is not a loophole — it's a right. The Liberator simply makes it effortless."
                  </p>
                </div>
              </CardContent>
            </Card>
          </RevealItem>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <RevealItem>
          <div className="text-center space-y-4 py-8">
            <h2 className="text-2xl font-bold">Ready to stop paying the captivity tax?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              See exactly what a migration would look like for your organization — free, with no obligation.
            </p>
            <Link href="/intel/reclamation">
              <Button size="lg" className="gap-2 mt-2">
                Begin Your Reclamation <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </RevealItem>
      </RevealWrapper>
    </div>
  );
}
