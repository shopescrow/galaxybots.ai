import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import {
  Zap, Database, Bot, Clock, Cpu, Download, AlertTriangle,
  TrendingUp, CheckCircle, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ADDON_ICONS: Record<string, typeof Zap> = {
  priority_response: Zap,
  memory_vault: Database,
  custom_bot_fabrication: Bot,
  background_autonomy: Clock,
  api_access: Cpu,
  conversation_export: Download,
};

type Subscription = {
  id: number;
  planTier: string;
  planMonthlyPrice: string;
  planIncludedCredits: number;
  creditBalance: number;
  billingCycleStart: string;
  billingCycleEnd: string;
  status: string;
};

type Addon = {
  id: number;
  key: string;
  name: string;
  description: string;
  monthlyPrice: string;
};

type UsageData = {
  totalCreditsUsed: number;
  dailyUsage: { date: string; credits: number }[];
  recentEvents: { id: number; model: string; creditsDeducted: number; route: string; createdAt: string }[];
};

type AllAddons = {
  id: number;
  key: string;
  name: string;
  description: string;
  monthlyPrice: string;
};

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function UsageDashboard() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subData, isLoading: subLoading } = useQuery<{ subscription: Subscription | null; addons: Addon[] }>({
    queryKey: ["billing-subscription"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/subscription`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: usage, isLoading: usageLoading } = useQuery<UsageData>({
    queryKey: ["billing-usage"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/usage`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: allAddons = [] } = useQuery<AllAddons[]>({
    queryKey: ["billing-addons"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/billing/addons`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ addonKey, activate }: { addonKey: string; activate: boolean }) => {
      const res = await fetch(`${BASE}/api/billing/addons/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ addonKey, activate }),
      });
      if (!res.ok) throw new Error("Failed to update add-on");
      return res.json();
    },
    onSuccess: (_, { activate }) => {
      queryClient.invalidateQueries({ queryKey: ["billing-subscription"] });
      toast({ title: activate ? "Add-on activated" : "Add-on deactivated" });
    },
    onError: () => {
      toast({ title: "Failed to update add-on", variant: "destructive" });
    },
  });

  const sub = subData?.subscription;
  const activeAddonKeys = new Set((subData?.addons ?? []).map(a => a.key));
  const includedCredits = sub?.planIncludedCredits ?? 0;
  const balance = sub?.creditBalance ?? 0;
  const used = includedCredits - balance;
  const usedPct = includedCredits > 0 ? Math.min(100, Math.round((used / includedCredits) * 100)) : 0;
  const isLowBalance = balance > 0 && usedPct >= 80;

  const TIER_LABELS: Record<string, string> = { starter: "Starter", pro: "Pro", scale: "Scale" };

  if (subLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">
          Loading usage data...
        </div>
      </AppLayout>
    );
  }

  if (!sub) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center max-w-lg space-y-6">
          <TrendingUp className="w-16 h-16 text-muted-foreground mx-auto" />
          <h2 className="text-2xl font-display font-bold">No Active Subscription</h2>
          <p className="text-muted-foreground">You don't have a credit-based plan yet. Choose a plan to start using AI credits.</p>
          <Link href="/pricing">
            <Button variant="glow">View Plans</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-5xl space-y-10">

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
        >
          <h1 className="text-3xl font-display font-bold mb-2">Usage Dashboard</h1>
          <p className="text-muted-foreground">Your current billing cycle and AI credit consumption.</p>
        </motion.div>

        {isLowBalance && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-medium text-amber-400">Low Credit Balance</span>
              <span className="text-sm text-muted-foreground ml-2">You've used {usedPct}% of your monthly credits. Consider upgrading your plan.</span>
            </div>
            <Link href="/pricing" className="ml-auto shrink-0">
              <Button variant="outline" size="sm">Upgrade</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-1">Current Plan</div>
              <div className="text-2xl font-display font-bold text-primary">{TIER_LABELS[sub.planTier] ?? sub.planTier}</div>
              <div className="text-sm text-muted-foreground">${parseFloat(sub.planMonthlyPrice).toFixed(2)}/month</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-1">Credits Remaining</div>
              <div className="text-2xl font-display font-bold text-emerald-400">{balance.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">of {includedCredits.toLocaleString()} included</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-1">Credits Used</div>
              <div className="text-2xl font-display font-bold">{used.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{usedPct}% of monthly allocation</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-tech">Credit Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>0</span>
              <span className={usedPct >= 80 ? "text-amber-400 font-bold" : ""}>{usedPct}% used</span>
              <span>{includedCredits.toLocaleString()}</span>
            </div>
            <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  usedPct >= 80 ? "bg-amber-400" : usedPct >= 50 ? "bg-primary" : "bg-emerald-400"
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span>Cycle: {new Date(sub.billingCycleStart).toLocaleDateString()} → {new Date(sub.billingCycleEnd).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        {usage && usage.dailyUsage.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-tech">30-Day Daily Usage</CardTitle>
              <CardDescription>Credits consumed per day over the past 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={usage.dailyUsage} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: "#888" }} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                    labelStyle={{ color: "#fff", fontSize: 12 }}
                    itemStyle={{ color: "#7c3aed" }}
                  />
                  <Bar dataKey="credits" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-tech">Accessorial Add-Ons</CardTitle>
            <CardDescription>Activate or deactivate premium features for your account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allAddons.map(addon => {
                const isActive = activeAddonKeys.has(addon.key);
                const Icon = ADDON_ICONS[addon.key] ?? Zap;
                return (
                  <div
                    key={addon.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all duration-200 ${
                      isActive ? "border-primary/40 bg-primary/5" : "border-border/50"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isActive ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{addon.name}</span>
                        {isActive ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      <div className="text-xs text-muted-foreground">${parseFloat(addon.monthlyPrice).toFixed(0)}/mo</div>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate({ addonKey: addon.key, activate: !isActive })}
                      disabled={toggleMutation.isPending}
                      className={`text-xs font-tech font-bold px-3 py-1.5 rounded-lg border transition-all ${
                        isActive
                          ? "border-primary/30 text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                          : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      {isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
