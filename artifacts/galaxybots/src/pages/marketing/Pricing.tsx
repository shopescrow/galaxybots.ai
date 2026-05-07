import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calculator, Check, Zap, Building, Globe, Star, ArrowRight,
  Users, DollarSign, TrendingDown, Shield, Clock, BarChart3,
  Cpu, Database, Download, Bot, Lock, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const EXEC_SALARY_BY_INDUSTRY: Record<string, number> = {
  "Technology": 380000,
  "Finance": 450000,
  "Healthcare": 330000,
  "Manufacturing": 280000,
  "Retail": 260000,
  "Real Estate": 310000,
  "Consulting": 420000,
  "Legal": 480000,
  "Other": 300000,
};

const COMPANY_SIZE_MULTIPLIER: Record<string, number> = {
  "1–50": 0.7,
  "51–200": 0.85,
  "201–500": 1.0,
  "501–1000": 1.15,
  "1000+": 1.35,
};

const TIER_CONFIG = {
  authorized: { label: "Authorized", discount: "40%", minClients: 5, minSpend: "$200/mo", contract: "Monthly", color: "text-cyan", border: "border-cyan/30", bg: "bg-cyan/10" },
  certified: { label: "Certified", discount: "60%", minClients: 15, minSpend: "$500/mo", contract: "Annual", color: "text-primary", border: "border-primary/30", bg: "bg-primary/10" },
  elite: { label: "Elite", discount: "70%", minClients: 50, minSpend: "$2,000/mo", contract: "Annual", color: "text-gold", border: "border-gold/30", bg: "bg-gold/10" },
};

const ADDON_ICONS: Record<string, typeof Zap> = {
  priority_response: Zap,
  memory_vault: Database,
  custom_bot_fabrication: Bot,
  background_autonomy: Clock,
  api_access: Cpu,
  conversation_export: Download,
};

type Plan = {
  id: number;
  tier: string;
  monthlyPrice: string;
  includedCredits: number;
  overageRatePerCredit: string;
};

type Addon = {
  id: number;
  key: string;
  name: string;
  description: string;
  monthlyPrice: string;
};

function SavingsCalculator() {
  const prefersReducedMotion = useReducedMotion();
  const [directors, setDirectors] = useState(5);
  const [industry, setIndustry] = useState("Technology");
  const [companySize, setCompanySize] = useState("51–200");

  const avgSalary = EXEC_SALARY_BY_INDUSTRY[industry] ?? 300000;
  const sizeMulti = COMPANY_SIZE_MULTIPLIER[companySize] ?? 1;
  const annualExecCost = Math.round(directors * avgSalary * sizeMulti);
  const galaxyBotsAnnual = directors <= 1 ? 60 : directors <= 5 ? 180 : 588;
  const savings = annualExecCost - galaxyBotsAnnual;
  const savingsPct = Math.round((savings / annualExecCost) * 100);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
      className="bg-card border border-primary/20 rounded-3xl p-8 sm:p-12 max-w-4xl mx-auto"
    >
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Calculator className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold">Savings Calculator</h2>
          <p className="text-muted-foreground text-sm">See your specific ROI vs hiring real executives</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div>
          <label className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-3 block">
            Directors Needed: <span className="text-primary font-bold">{directors}</span>
          </label>
          <Slider
            min={1}
            max={51}
            step={1}
            value={[directors]}
            onValueChange={([v]) => setDirectors(v)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span><span>51</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-3 block">Industry</label>
          <select
            value={industry}
            onChange={e => setIndustry(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm"
          >
            {Object.keys(EXEC_SALARY_BY_INDUSTRY).map(i => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-3 block">Company Size</label>
          <select
            value={companySize}
            onChange={e => setCompanySize(e.target.value)}
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm"
          >
            {Object.keys(COMPANY_SIZE_MULTIPLIER).map(s => (
              <option key={s} value={s}>{s} employees</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 text-center">
          <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-2">Annual Exec Cost</div>
          <div className="text-3xl font-display font-bold text-destructive">${annualExecCost.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">{directors} exec{directors > 1 ? "s" : ""} @ {industry}</div>
        </div>

        <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20 text-center">
          <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-2">GalaxyBots Annual</div>
          <div className="text-3xl font-display font-bold text-primary">${galaxyBotsAnnual.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">All {directors} director{directors > 1 ? "s" : ""} included</div>
        </div>

        <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
          <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-2">You Save</div>
          <div className="text-3xl font-display font-bold text-emerald-400">${savings.toLocaleString()}</div>
          <div className="text-xs text-emerald-400 mt-1 font-tech font-bold">{savingsPct}% reduction</div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6 font-tech">
        Based on average executive base compensation data. GalaxyBots delivers the same strategic intelligence at {savingsPct}% lower cost.
      </p>
    </motion.div>
  );
}

function PlanCard({ plan, onSubscribe, isSubscribing }: { plan: Plan; onSubscribe: (tier: string) => void; isSubscribing: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const isPro = plan.tier === "pro";

  const PLAN_COPY: Record<string, { label: string; icon: typeof Zap; color: string; border: string; bg: string; features: string[]; comparison: string }> = {
    starter: {
      label: "Starter",
      icon: Zap,
      color: "text-cyan",
      border: isPro ? "border-primary/50" : "border-cyan/30",
      bg: "bg-cyan/5",
      features: ["100 AI credits/month", "Overage at $0.025/credit", "1-on-1 director chats", "Basic memory context", "Email support"],
      comparison: "Replaces 1 executive assistant ($60K/yr)"
    },
    pro: {
      label: "Pro",
      icon: Building,
      color: "text-primary",
      border: "border-primary/50",
      bg: "bg-primary/5",
      features: ["500 AI credits/month", "Overage at $0.025/credit", "Boardroom sessions", "Shared memory", "Task Rooms", "Priority support"],
      comparison: "Replaces 5 senior directors ($1.8M/yr)"
    },
    scale: {
      label: "Scale",
      icon: Globe,
      color: "text-gold",
      border: "border-gold/30",
      bg: "bg-gold/5",
      features: ["2,000 AI credits/month", "Overage at $0.025/credit", "All 51 directors", "Full boardroom access", "Analytics dashboard", "Dedicated support"],
      comparison: "Replaces full executive team ($15M/yr)"
    }
  };

  const config = PLAN_COPY[plan.tier] || PLAN_COPY.starter;
  const Icon = config.icon;
  const price = parseFloat(plan.monthlyPrice);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
      className={`relative flex flex-col border-2 ${config.border} ${config.bg} rounded-3xl p-8 ${isPro ? "ring-2 ring-primary/30 shadow-2xl shadow-primary/10" : ""}`}
    >
      {isPro && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-4 py-1 font-tech text-xs uppercase tracking-widest">Most Popular</Badge>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 rounded-2xl bg-card border flex items-center justify-center ${config.border}`}>
          <Icon className={`w-6 h-6 ${config.color}`} />
        </div>
        <div>
          <div className={`text-sm font-tech uppercase tracking-widest ${config.color}`}>{config.label}</div>
          <div className="text-3xl font-display font-bold">${price}/mo</div>
        </div>
      </div>

      <div className={`p-3 rounded-xl border ${config.border} mb-6 text-center`}>
        <div className={`text-xs font-tech uppercase tracking-wider ${config.color} mb-1`}>You Save vs Hiring</div>
        <div className={`text-sm font-bold ${config.color}`}>{config.comparison}</div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {config.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className={`w-4 h-4 shrink-0 mt-0.5 ${config.color}`} />
            <span className="text-sm text-foreground/80">{f}</span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => onSubscribe(plan.tier)}
        disabled={isSubscribing}
        variant={isPro ? "glow" : "outline"}
        className="w-full"
      >
        {isSubscribing ? "Activating..." : "Get Started"} <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </motion.div>
  );
}

function AddonCard({ addon, isActive, onToggle, isToggling }: { addon: Addon; isActive: boolean; onToggle: (key: string, activate: boolean) => void; isToggling: boolean }) {
  const Icon = ADDON_ICONS[addon.key] || Shield;
  const price = parseFloat(addon.monthlyPrice);

  return (
    <div className={`p-5 rounded-2xl border transition-all duration-200 ${isActive ? "border-primary/50 bg-primary/5" : "border-border/50 bg-card hover:border-primary/20"}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10 border border-primary/30" : "bg-secondary border border-border"}`}>
          <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-medium text-sm">{addon.name}</span>
            <span className="text-sm font-tech font-bold text-primary shrink-0">${price}/mo</span>
          </div>
          <p className="text-xs text-muted-foreground">{addon.description}</p>
        </div>
      </div>
      <button
        onClick={() => onToggle(addon.key, !isActive)}
        disabled={isToggling}
        className={`mt-4 w-full py-2 px-4 rounded-xl text-xs font-tech font-bold uppercase tracking-widest transition-all duration-200 ${
          isActive
            ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
            : "bg-secondary text-muted-foreground border border-border hover:border-primary/30 hover:text-primary"
        }`}
      >
        {isToggling ? "..." : isActive ? "Active — Click to Deactivate" : "Add to Plan"}
      </button>
    </div>
  );
}

export default function Pricing() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null);
  const [togglingAddon, setTogglingAddon] = useState<string | null>(null);

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/plans`);
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json();
    },
  });

  const { data: addons = [] } = useQuery<Addon[]>({
    queryKey: ["billing-addons"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/addons`);
      if (!res.ok) throw new Error("Failed to load addons");
      return res.json();
    },
  });

  const { data: subscription } = useQuery<{ subscription: null | object; addons: Addon[] }>({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE}/api/billing/subscription`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { subscription: null, addons: [] };
      return res.json();
    },
  });

  const activeAddonKeys = new Set((subscription?.addons ?? []).map((a: Addon) => a.key));

  const subscribeMutation = useMutation({
    mutationFn: async (planTier: string) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE}/api/billing/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ planTier }),
      });
      if (!res.ok) throw new Error("Subscription failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Plan activated!", description: "Your credit balance has been loaded. Start chatting with your AI directors." });
      setSubscribingTier(null);
    },
    onError: () => {
      toast({ title: "Subscription failed", description: "Please try again or contact support.", variant: "destructive" });
      setSubscribingTier(null);
    },
  });

  const toggleAddonMutation = useMutation({
    mutationFn: async ({ addonKey, activate }: { addonKey: string; activate: boolean }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE}/api/billing/addons/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ addonKey, activate }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },
    onSuccess: (_, { addonKey, activate }) => {
      toast({ title: activate ? "Add-on activated!" : "Add-on deactivated", description: activate ? "Feature is now available on your account." : "Feature has been removed." });
      setTogglingAddon(null);
    },
    onError: () => {
      toast({ title: "Failed to update add-on", variant: "destructive" });
      setTogglingAddon(null);
    },
  });

  const handleSubscribe = (tier: string) => {
    setSubscribingTier(tier);
    subscribeMutation.mutate(tier);
  };

  const handleToggleAddon = (key: string, activate: boolean) => {
    setTogglingAddon(key);
    toggleAddonMutation.mutate({ addonKey: key, activate });
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 space-y-24 max-w-6xl">

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 text-xs font-tech text-emerald-400 uppercase tracking-widest mb-8">
            <TrendingDown className="w-3.5 h-3.5" />
            4 cents on the dollar
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 leading-tight">
            What would <span className="text-destructive">51 executives</span><br />
            cost you?
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            GalaxyBots delivers the same strategic intelligence as a Fortune 500 executive team at a fraction of the cost. See your savings below.
          </p>
        </motion.div>

        <SavingsCalculator />

        <div>
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 text-xs font-tech text-primary uppercase tracking-widest mb-6">
              <DollarSign className="w-3.5 h-3.5" />
              Credit-Based Membership
            </div>
            <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">Choose Your Plan</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Credits are consumed per AI interaction. All plans include the same 51-director team — choose based on usage volume.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onSubscribe={handleSubscribe}
                isSubscribing={subscribingTier === plan.tier}
              />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 font-tech">
            All plans include 51 AI directors. Credits reset monthly. Overages billed at $0.025/credit.
          </p>
        </div>

        {addons.length > 0 && (
          <div id="addons">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-gold/10 border border-gold/20 rounded-full px-4 py-2 text-xs font-tech text-gold uppercase tracking-widest mb-6">
                <Star className="w-3.5 h-3.5" />
                Premium Add-Ons
              </div>
              <h2 className="text-3xl sm:text-4xl font-display font-bold mb-4">Accessorial Features</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Extend your base plan with premium capabilities. Each add-on is billed monthly and can be toggled on or off.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {addons.map(addon => (
                <AddonCard
                  key={addon.id}
                  addon={addon}
                  isActive={activeAddonKeys.has(addon.key)}
                  onToggle={handleToggleAddon}
                  isToggling={togglingAddon === addon.key}
                />
              ))}
            </div>
          </div>
        )}

        <div className="bg-card border border-border/50 rounded-3xl p-8 sm:p-12">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-purple/10 border border-purple/20 rounded-full px-4 py-2 text-xs font-tech text-purple uppercase tracking-widest mb-6">
              <Users className="w-3.5 h-3.5" />
              Partner Program
            </div>
            <h2 className="text-3xl font-display font-bold mb-4">Wholesale Partner Tiers</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Agencies and resellers qualify for wholesale discounts. Meet client count and spend thresholds to unlock deeper savings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {Object.entries(TIER_CONFIG).map(([key, tier]) => (
              <div key={key} className={`p-6 rounded-2xl border ${tier.border} ${tier.bg}`}>
                <div className={`text-xs font-tech uppercase tracking-widest ${tier.color} mb-3`}>{tier.label} Partner</div>
                <div className={`text-4xl font-display font-bold ${tier.color} mb-4`}>{tier.discount} off</div>
                <ul className="space-y-2 text-sm text-foreground/70">
                  <li className="flex items-center gap-2"><ChevronRight className={`w-4 h-4 ${tier.color}`} />{tier.minClients}+ active clients</li>
                  <li className="flex items-center gap-2"><ChevronRight className={`w-4 h-4 ${tier.color}`} />{tier.minSpend} minimum</li>
                  <li className="flex items-center gap-2"><ChevronRight className={`w-4 h-4 ${tier.color}`} />{tier.contract} contract</li>
                </ul>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-6">
              Monthly tier reviews ensure qualification. Two consecutive months below threshold triggers auto-downgrade with advance warning.
            </p>
            <Link href="/partner-apply">
              <Button variant="glow" className="gap-2">
                Apply for Partner Program <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
