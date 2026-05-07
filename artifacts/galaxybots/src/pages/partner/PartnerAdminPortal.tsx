import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import {
  Shield, Users, TrendingUp, AlertTriangle, CheckCircle,
  BarChart3, Clock, ChevronRight, Building, Star, Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TIER_COLORS: Record<string, string> = {
  authorized: "text-cyan",
  certified: "text-primary",
  elite: "text-gold",
};

const TIER_ICONS: Record<string, typeof Zap> = {
  authorized: Zap,
  certified: Star,
  elite: Building,
};

type PartnerStatus = {
  ref: string;
  tier: string;
  partnerName: string;
  wholesaleDiscount: string;
  minClients: number;
  minMonthlySpend: string;
  isActive: boolean;
  consecutiveMonthsBelowThreshold: number;
  lastTierReviewAt: string | null;
  activeClientCount: number;
  totalClients: number;
  recentLogs: {
    id: number;
    reviewedAt: string;
    activeClientCount: number;
    monthlySpend: string;
    tierAtReview: string;
    action: string;
    notes: string | null;
  }[];
  referrals: {
    id: number;
    companyName: string;
    plan: string;
    status: string;
    registeredAt: string;
  }[];
};

export default function PartnerAdminPortal() {
  const prefersReducedMotion = useReducedMotion();
  const { ref } = useParams<{ ref: string }>();
  const [passwordInput, setPasswordInput] = useState("");
  const [authenticated, setAuthenticated] = useState(true);
  const [lookupRef, setLookupRef] = useState(ref || "");

  const { data: status, isLoading, isError, refetch } = useQuery<PartnerStatus>({
    queryKey: ["partner-status", lookupRef],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/partner/${encodeURIComponent(lookupRef)}/status`);
      if (!res.ok) throw new Error("Partner not found");
      return res.json();
    },
    enabled: !!lookupRef && authenticated,
  });

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthenticated(true);
  };

  if (!authenticated) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 max-w-md">
          <div className="text-center mb-8">
            <Shield className="w-12 h-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-display font-bold mb-2">Partner Admin Portal</h1>
            <p className="text-muted-foreground text-sm">Enter your partner ref to view your account status.</p>
          </div>
          <form onSubmit={handleLookup} className="space-y-4">
            <Input
              placeholder="Partner ref (e.g., bingolingo)"
              value={lookupRef}
              onChange={e => setLookupRef(e.target.value)}
              required
            />
            <Button type="submit" variant="glow" className="w-full">View Status</Button>
          </form>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">
          Loading partner status...
        </div>
      </AppLayout>
    );
  }

  if (isError || !status) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center space-y-4">
          <p className="text-muted-foreground">Partner not found or access denied.</p>
          <Button variant="outline" onClick={() => { setAuthenticated(false); setLookupRef(""); }}>Try Again</Button>
        </div>
      </AppLayout>
    );
  }

  const TierIcon = TIER_ICONS[status.tier] ?? Zap;
  const tierColor = TIER_COLORS[status.tier] ?? "text-primary";
  const clientProgress = Math.min(100, Math.round((status.activeClientCount / status.minClients) * 100));
  const isAtRisk = status.consecutiveMonthsBelowThreshold >= 1;
  const isDowngradeImminent = status.consecutiveMonthsBelowThreshold >= 2;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-5xl space-y-8">

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
          className="flex items-start justify-between flex-wrap gap-4"
        >
          <div>
            <h1 className="text-3xl font-display font-bold mb-1">{status.partnerName}</h1>
            <div className="flex items-center gap-3">
              <Badge className={`${tierColor.replace("text-", "bg-").replace("cyan", "cyan-500/20").replace("primary", "primary/20").replace("gold", "amber-500/20")} border ${tierColor.replace("text", "border").replace("cyan", "cyan/30").replace("primary", "primary/30").replace("gold", "amber/30")} font-tech uppercase text-xs`}>
                <TierIcon className={`w-3 h-3 mr-1 ${tierColor}`} />
                <span className={tierColor}>{status.tier} partner</span>
              </Badge>
              <span className="text-sm text-muted-foreground font-tech">{parseFloat(status.wholesaleDiscount).toFixed(0)}% wholesale discount</span>
              {status.isActive ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">Active</Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">Inactive</Badge>
              )}
            </div>
          </div>
        </motion.div>

        {isDowngradeImminent && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/30">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-destructive mb-1">Downgrade Warning</div>
              <p className="text-sm text-muted-foreground">
                You've been below tier thresholds for 2 consecutive months. Your tier will be automatically downgraded at the next monthly review unless you meet the minimum requirements.
              </p>
            </div>
          </div>
        )}

        {isAtRisk && !isDowngradeImminent && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-amber-400 mb-1">At Risk</div>
              <p className="text-sm text-muted-foreground">
                You are below tier thresholds for 1 month. One more month below threshold will trigger an automatic downgrade.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs font-tech uppercase tracking-widest text-muted-foreground">Active Clients</span>
              </div>
              <div className="text-3xl font-display font-bold mb-1">{status.activeClientCount}</div>
              <div className="text-xs text-muted-foreground mb-3">of {status.minClients} required</div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${clientProgress >= 100 ? "bg-emerald-400" : clientProgress >= 70 ? "bg-amber-400" : "bg-destructive"}`}
                  style={{ width: `${clientProgress}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{clientProgress}% of minimum</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs font-tech uppercase tracking-widest text-muted-foreground">Total Referrals</span>
              </div>
              <div className="text-3xl font-display font-bold">{status.totalClients}</div>
              <div className="text-xs text-muted-foreground">{status.activeClientCount} active</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs font-tech uppercase tracking-widest text-muted-foreground">Last Review</span>
              </div>
              <div className="text-sm font-medium">
                {status.lastTierReviewAt ? new Date(status.lastTierReviewAt).toLocaleDateString() : "No review yet"}
              </div>
              {status.consecutiveMonthsBelowThreshold > 0 && (
                <div className="text-xs text-amber-400 mt-1">{status.consecutiveMonthsBelowThreshold} month(s) below threshold</div>
              )}
            </CardContent>
          </Card>
        </div>

        {status.recentLogs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-tech">Tier Review History</CardTitle>
              <CardDescription>Last 3 monthly tier reviews</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {status.recentLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-4 p-3 rounded-xl bg-secondary/50">
                    <div className="text-xs text-muted-foreground w-24 shrink-0">{new Date(log.reviewedAt).toLocaleDateString()}</div>
                    <div className="flex-1">
                      <div className="text-xs font-tech uppercase tracking-widest text-muted-foreground">Tier: {log.tierAtReview}</div>
                      <div className="text-xs text-foreground/70">{log.activeClientCount} clients · ${parseFloat(log.monthlySpend || "0").toFixed(0)} spend</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs font-tech ${
                        log.action === "no_change" ? "border-emerald-500/30 text-emerald-400" :
                        log.action === "downgraded" ? "border-destructive/30 text-destructive" :
                        "border-primary/30 text-primary"
                      }`}
                    >
                      {log.action.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {status.referrals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-tech">Referred Clients</CardTitle>
              <CardDescription>All clients referred under your partner link</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {status.referrals.map(r => (
                  <div key={r.id} className="flex items-center gap-4 p-3 rounded-xl border border-border/50">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{r.companyName}</div>
                      <div className="text-xs text-muted-foreground font-tech">{r.plan} · Joined {new Date(r.registeredAt).toLocaleDateString()}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs ${r.status === "active" ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground"}`}
                    >
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
