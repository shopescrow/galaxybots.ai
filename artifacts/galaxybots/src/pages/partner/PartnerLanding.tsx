import { AppLayout } from "@/components/layout/AppLayout";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { usePartner } from "@/contexts/PartnerContext";
import { 
  ArrowRight, Zap, Shield, Gift, CheckCircle, 
  ExternalLink, Users, Building
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type PartnerInfo = {
  ref: string;
  partnerName: string;
  partnerLogo: string | null;
  primaryColor: string | null;
  welcomeMessage: string;
  offer: string | null;
  isActive: boolean;
};

type FormData = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  plan: "single" | "team" | "enterprise";
};

export default function PartnerLanding() {
  const prefersReducedMotion = useReducedMotion();
  const { ref } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { setPartner } = usePartner();
  const [formData, setFormData] = useState<FormData>({
    companyName: "",
    contactName: "",
    contactEmail: "",
    plan: "team",
  });
  const [registered, setRegistered] = useState(false);

  const { data: partner, isLoading, isError } = useQuery<PartnerInfo>({
    queryKey: ["partner-info", ref],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/partner/link?ref=${encodeURIComponent(ref || "")}`);
      if (!res.ok) throw new Error("Partner not found");
      return res.json();
    },
    enabled: !!ref,
  });

  useEffect(() => {
    if (partner && partner.isActive) {
      setPartner({
        ref: partner.ref,
        partnerName: partner.partnerName,
        partnerLogo: partner.partnerLogo,
        primaryColor: partner.primaryColor ?? null,
      });
    }
  }, [partner]);

  const registerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`${BASE}/api/partner/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, partnerRef: ref, source: ref }),
      });
      if (!res.ok) throw new Error("Registration failed");
      return res.json();
    },
    onSuccess: () => {
      setRegistered(true);
      toast({ title: `Welcome to ${partner?.partnerName ?? "the platform"}!`, description: "Your account has been created. Your AI board is ready to deploy." });
    },
    onError: () => {
      toast({ title: "Registration failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.contactName || !formData.contactEmail) return;
    registerMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground font-tech">
          Initializing partner connection...
        </div>
      </AppLayout>
    );
  }

  if (isError || !partner || !partner.isActive) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 text-center space-y-4">
          <p className="text-muted-foreground font-tech">Partner connection not recognized.</p>
          <Link href="/">
            <Button variant="outline">Go to GalaxyBots.ai</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (registered) {
    return (
      <AppLayout>
        <div className="container mx-auto px-4 py-24 flex items-center justify-center min-h-[60vh]">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.5 }}
            className="text-center max-w-lg space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold">Deployment Initiated</h2>
            <p className="text-muted-foreground text-lg">
              Your AI executive team is being configured. Welcome — referred by {partner.partnerName}.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/bots">
                <Button variant="glow" className="gap-2">Meet Your Directors <ArrowRight className="w-4 h-4" /></Button>
              </Link>
              <Link href="/clients">
                <Button variant="outline">View Dashboard</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24 max-w-6xl">
        
        {/* Partner Badge */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -10  }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.4  }}
          className="flex justify-center mb-10"
        >
          <div className="flex items-center gap-3 bg-gold/10 border border-gold/30 rounded-full px-6 py-2 text-sm font-tech text-gold">
            <ExternalLink className="w-4 h-4" />
            <span>You arrived via <strong>{partner.partnerName}</strong></span>
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          
          {/* Left: Welcome & Benefits */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: -30  }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6  }}
            className="space-y-8"
          >
            <div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-display font-bold leading-tight mb-6">
                Welcome from<br />
                <span className="text-gradient">{partner.partnerName}</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                {partner.welcomeMessage}
              </p>
            </div>

            {/* Partner Offer */}
            {partner.offer && (
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-gold/10 border border-gold/30">
                <Gift className="w-6 h-6 text-gold shrink-0 mt-0.5" />
                <div>
                  <div className="font-display font-bold text-gold mb-1">Exclusive Partner Offer</div>
                  <p className="text-sm text-foreground/80">{partner.offer}</p>
                </div>
              </div>
            )}

            {/* Benefits */}
            <div className="space-y-4">
              <h3 className="text-sm font-tech uppercase tracking-widest text-muted-foreground">What You Get</h3>
              {[
                { icon: Users, label: "51 AI Director-Level Personalities", sub: "Every Fortune 500 department covered", color: "text-cyan" },
                { icon: Zap, label: "Instant Strategic Consultation", sub: "Available 24/7, no scheduling required", color: "text-primary" },
                { icon: Building, label: "Global Boardroom Access", sub: "Multi-bot intelligence synthesis", color: "text-gold" },
                { icon: Shield, label: "CEO-Controlled Access", sub: "Your data, your rules, your board", color: "text-purple" },
              ].map((benefit, i) => (
                <motion.div
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -20  }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: prefersReducedMotion ? 0 : 0.3 + i * 0.1  }}
                  className="flex items-start gap-4"
                >
                  <div className={`w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center shrink-0`}>
                    <benefit.icon className={`w-5 h-5 ${benefit.color}`} />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{benefit.label}</div>
                    <div className="text-sm text-muted-foreground">{benefit.sub}</div>
                  </div>
                </motion.div>
              ))}
            </div>

            <Link href="/bots">
              <button className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-tech transition-colors">
                Browse the 51 Directors first <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </motion.div>

          {/* Right: Registration Form */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, x: 30  }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.1  }}
          >
            <Card className="border-primary/20 shadow-2xl shadow-primary/10">
              <CardHeader>
                <CardTitle className="text-2xl font-display">Deploy Your AI Board</CardTitle>
                <CardDescription>
                  Activate your account as a {partner.partnerName} partner. Takes under 60 seconds.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="font-tech text-xs uppercase tracking-wider">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Acme Corp"
                      value={formData.companyName}
                      onChange={e => setFormData(p => ({ ...p, companyName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactName" className="font-tech text-xs uppercase tracking-wider">Your Name</Label>
                    <Input
                      id="contactName"
                      placeholder="Jane Smith"
                      value={formData.contactName}
                      onChange={e => setFormData(p => ({ ...p, contactName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail" className="font-tech text-xs uppercase tracking-wider">Business Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="jane@acmecorp.com"
                      value={formData.contactEmail}
                      onChange={e => setFormData(p => ({ ...p, contactEmail: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="font-tech text-xs uppercase tracking-wider">Starting Tier</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "single", label: "Single", price: "$999/mo" },
                        { value: "team", label: "Team", price: "$4,999/mo" },
                        { value: "enterprise", label: "Full Board", price: "$9,999/mo" },
                      ].map((tier) => (
                        <button
                          key={tier.value}
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, plan: tier.value as FormData["plan"] }))}
                          className={`p-3 rounded-xl border text-center transition-all duration-200 ${
                            formData.plan === tier.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/50 text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          <div className="font-tech font-bold text-xs">{tier.label}</div>
                          <div className="text-xs opacity-70 mt-0.5">{tier.price}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="glow"
                    className="w-full gap-2"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? "Deploying..." : "Activate Partner Account"}
                    {!registerMutation.isPending && <ArrowRight className="w-4 h-4" />}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground font-tech">
                    Referred by {partner.partnerName} · Partner Program
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
