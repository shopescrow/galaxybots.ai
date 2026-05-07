import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import {
  Building, Users, CheckCircle, ArrowRight, ChevronRight,
  Shield, Star, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TIER_INFO = {
  authorized: {
    label: "Authorized",
    discount: "40% off retail",
    minClients: 5,
    minSpend: "$200/mo",
    contract: "Monthly",
    color: "text-cyan",
    border: "border-cyan/30",
    bg: "bg-cyan/10",
    icon: Zap,
  },
  certified: {
    label: "Certified",
    discount: "60% off retail",
    minClients: 15,
    minSpend: "$500/mo",
    contract: "Annual",
    color: "text-primary",
    border: "border-primary/30",
    bg: "bg-primary/10",
    icon: Star,
  },
  elite: {
    label: "Elite",
    discount: "70% off retail",
    minClients: 50,
    minSpend: "$2,000/mo",
    contract: "Annual",
    color: "text-gold",
    border: "border-gold/30",
    bg: "bg-gold/10",
    icon: Building,
  },
};

type FormData = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  currentClientCount: string;
  requestedTier: "authorized" | "certified" | "elite";
  resellerAgreementAccepted: boolean;
};

export default function PartnerApply() {
  const prefersReducedMotion = useReducedMotion();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    contactName: "",
    contactEmail: "",
    currentClientCount: "",
    requestedTier: "authorized",
    resellerAgreementAccepted: false,
  });

  const applyMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`${BASE}/api/partner/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          currentClientCount: parseInt(data.currentClientCount || "0", 10),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Application failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast({ title: "Application failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.resellerAgreementAccepted) {
      toast({ title: "Agreement required", description: "Please accept the reseller agreement to continue.", variant: "destructive" });
      return;
    }
    applyMutation.mutate(formData);
  };

  const selectedTierInfo = TIER_INFO[formData.requestedTier];

  if (submitted) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            className="text-center max-w-lg space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Application Submitted</h2>
            <p className="text-muted-foreground text-lg">
              Your partner application is under review. Our team will contact you at <strong>{formData.contactEmail}</strong> within 2-3 business days.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/pricing">
                <Button variant="outline">View Pricing</Button>
              </Link>
              <Link href="/">
                <Button variant="glow" className="gap-2">Go Home <ArrowRight className="w-4 h-4" /></Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 max-w-5xl">

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 text-xs font-tech text-primary uppercase tracking-widest mb-6">
            <Users className="w-3.5 h-3.5" />
            Wholesale Partner Program
          </div>
          <h1 className="text-3xl sm:text-5xl font-display font-bold mb-6">Become a GalaxyBots Partner</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Agencies and resellers qualify for wholesale rates up to 70% off retail. Build your practice on AI executive intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              <h3 className="text-sm font-tech uppercase tracking-widest text-muted-foreground">Partner Tiers</h3>
              {Object.entries(TIER_INFO).map(([key, info]) => {
                const Icon = info.icon;
                const isSelected = formData.requestedTier === key;
                return (
                  <div
                    key={key}
                    onClick={() => setFormData(p => ({ ...p, requestedTier: key as FormData["requestedTier"] }))}
                    className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                      isSelected ? `${info.border} ${info.bg}` : "border-border/50 hover:border-primary/20"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? `${info.bg} border ${info.border}` : "bg-secondary"}`}>
                      <Icon className={`w-5 h-5 ${isSelected ? info.color : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-bold text-sm ${isSelected ? info.color : ""}`}>{info.label} Partner</span>
                        <span className={`text-xs font-tech font-bold ${isSelected ? info.color : "text-muted-foreground"}`}>{info.discount}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{info.minClients}+ clients</span>
                        <span>{info.minSpend} min</span>
                        <span>{info.contract}</span>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className={`w-4 h-4 ${info.color} shrink-0 mt-0.5`} />}
                  </div>
                );
              })}
            </div>

            <div className="p-5 rounded-2xl bg-card border border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Qualification Rules</span>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  Partner account must be registered under a company name
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  Reseller agreement acknowledgment required at application
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  Active client count and spend checked monthly
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  Two consecutive months below threshold triggers downgrade with advance warning
                </li>
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.1 }}
          >
            <Card className="border-primary/20 shadow-2xl shadow-primary/10">
              <CardHeader>
                <CardTitle className="text-2xl font-display">Partner Application</CardTitle>
                <CardDescription>Applying for <strong className={selectedTierInfo.color}>{selectedTierInfo.label} tier</strong> — {selectedTierInfo.discount}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="font-tech text-xs uppercase tracking-wider">Company Name *</Label>
                    <Input
                      id="companyName"
                      placeholder="Your Agency Name"
                      value={formData.companyName}
                      onChange={e => setFormData(p => ({ ...p, companyName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactName" className="font-tech text-xs uppercase tracking-wider">Contact Name *</Label>
                    <Input
                      id="contactName"
                      placeholder="Jane Smith"
                      value={formData.contactName}
                      onChange={e => setFormData(p => ({ ...p, contactName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail" className="font-tech text-xs uppercase tracking-wider">Business Email *</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="jane@youragency.com"
                      value={formData.contactEmail}
                      onChange={e => setFormData(p => ({ ...p, contactEmail: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientCount" className="font-tech text-xs uppercase tracking-wider">Current Client Count</Label>
                    <Input
                      id="clientCount"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formData.currentClientCount}
                      onChange={e => setFormData(p => ({ ...p, currentClientCount: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Requested Tier</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["authorized", "certified", "elite"] as const).map(tier => {
                        const info = TIER_INFO[tier];
                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => setFormData(p => ({ ...p, requestedTier: tier }))}
                            className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                              formData.requestedTier === tier
                                ? `${info.border} ${info.bg} ${info.color}`
                                : "border-border/50 text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            <div className="font-tech font-bold text-xs">{info.label}</div>
                            <div className="text-xs opacity-70 mt-0.5">{info.discount}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-xl border border-border/50 bg-secondary/50">
                    <input
                      type="checkbox"
                      id="agreement"
                      checked={formData.resellerAgreementAccepted}
                      onChange={e => setFormData(p => ({ ...p, resellerAgreementAccepted: e.target.checked }))}
                      className="mt-0.5 rounded"
                      required
                    />
                    <Label htmlFor="agreement" className="text-xs text-muted-foreground cursor-pointer">
                      I acknowledge and accept the GalaxyBots.ai Reseller Agreement. I understand that tier qualification is reviewed monthly and two consecutive months below threshold will trigger a downgrade with advance notice.
                    </Label>
                  </div>

                  <Button
                    type="submit"
                    variant="glow"
                    className="w-full gap-2"
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? "Submitting..." : "Submit Application"}
                    {!applyMutation.isPending && <ArrowRight className="w-4 h-4" />}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground font-tech">
                    GalaxyBots.ai Partner Program · Powered by AI executive intelligence
                  </p>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
