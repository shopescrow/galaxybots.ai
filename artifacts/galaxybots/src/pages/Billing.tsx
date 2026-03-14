import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Zap, Building, Globe, ExternalLink, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface PlanLink {
  name: string;
  price: number;
  link: string | null;
}

interface BillingLinks {
  provider: string;
  plans: {
    single: PlanLink;
    team: PlanLink;
    enterprise: PlanLink;
  };
}

interface BillingStatus {
  plan: string;
  status: string;
}

const PLAN_ICONS = {
  single: Zap,
  team: Building,
  enterprise: Globe,
};

const PLAN_COLORS = {
  single: "text-cyan-400",
  team: "text-purple-400",
  enterprise: "text-amber-400",
};

const PLAN_BORDER = {
  single: "hover:border-cyan-500/50",
  team: "border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.15)]",
  enterprise: "hover:border-amber-500/50",
};

const PLAN_FEATURES: Record<string, string[]> = {
  single: [
    "Choose any 1 Director-level AI bot",
    "Unlimited conversations",
    "Semantic memory & context",
    "Full task execution suite",
    "Email support",
  ],
  team: [
    "Choose any 5 Director-level AI bots",
    "Inter-bot Boardroom sessions",
    "Shared memory across the team",
    "Task Rooms with full agentic loops",
    "Priority support",
    "ROI dashboards",
  ],
  enterprise: [
    "Unlimited AI bots from the roster",
    "Full Boardroom command centre",
    "Cross-client analytics & reporting",
    "Custom bot personas on request",
    "Dedicated account manager",
    "SLA + compliance reporting",
  ],
};

export default function Billing() {
  const { token } = useAuth();
  const [links, setLinks] = useState<BillingLinks | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    Promise.all([
      fetch(`${BASE}/api/billing/links`, { headers }).then((r) => r.json()),
      fetch(`${BASE}/api/billing/status`, { headers }).then((r) => r.json()),
    ])
      .then(([linksData, statusData]) => {
        setLinks(linksData);
        setStatus(statusData);
      })
      .catch(() => setError("Unable to load billing information. Please try again."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubscribe = (link: string | null, planName: string) => {
    if (!link) {
      alert(`Payment link for the ${planName} plan has not been configured yet. Please contact support.`);
      return;
    }
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const planKeys = ["single", "team", "enterprise"] as const;

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-tech text-sm mb-6">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Powered by Kort Payments</span>
          </div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-display font-bold mb-6">
            Choose Your <span className="text-gradient">Command Tier</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Secure, seamless checkout via Kort Payments. Select a plan and you'll be taken to
            our payment partner to complete your subscription.
          </p>

          {status && status.status !== "trial" && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-tech">
              <Check className="w-4 h-4" />
              Active plan: {status.plan.toUpperCase()} — {status.status.toUpperCase()}
            </div>
          )}

          {status && status.status === "trial" && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-tech">
              <Zap className="w-4 h-4" />
              Currently on free trial — subscribe below to unlock full access
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center text-muted-foreground py-16">Loading plans…</div>
        )}

        {error && (
          <div className="text-center text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-6 py-4 max-w-md mx-auto">
            {error}
          </div>
        )}

        {!loading && !error && links && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {planKeys.map((key) => {
              const plan = links.plans[key];
              const Icon = PLAN_ICONS[key];
              const isCurrentPlan = status?.plan === key;

              return (
                <Card
                  key={key}
                  className={`flex flex-col relative overflow-hidden transition-all duration-500 ${PLAN_BORDER[key]} ${key === "team" ? "scale-105" : ""}`}
                >
                  {key === "team" && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
                  )}
                  {key === "team" && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-tech">
                      MOST POPULAR
                    </div>
                  )}

                  <CardHeader className="pb-6">
                    <Icon className={`w-7 h-7 sm:w-8 sm:h-8 mb-4 ${PLAN_COLORS[key]}`} />
                    <CardTitle className="text-2xl font-display">{plan.name}</CardTitle>
                    <CardDescription>
                      {key === "single" && "Targeted expertise for a specific department gap."}
                      {key === "team" && "A cross-functional leadership team working in sync."}
                      {key === "enterprise" && "Full executive command across the entire organisation."}
                    </CardDescription>
                    <div className="mt-4">
                      <span className="text-4xl font-bold">${plan.price.toLocaleString()}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1">
                    <ul className="space-y-3">
                      {PLAN_FEATURES[key].map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <Check className={`w-5 h-5 shrink-0 mt-0.5 ${PLAN_COLORS[key]}`} />
                          <span className="text-sm text-foreground/80">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="pt-6">
                    {isCurrentPlan && status?.status === "active" ? (
                      <Button className="w-full" variant="outline" disabled>
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full gap-2"
                        variant={key === "team" ? "default" : "outline"}
                        onClick={() => handleSubscribe(plan.link, plan.name)}
                      >
                        Subscribe via Kort Payments
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-16 text-center text-sm text-muted-foreground max-w-2xl mx-auto space-y-2">
          <p>
            Payments are securely processed by{" "}
            <a
              href="https://kortpayments.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Kort Payments
            </a>
            . You will be redirected to their secure hosted checkout page to complete your
            subscription.
          </p>
          <p>
            Questions about billing?{" "}
            <a href="mailto:support@galaxybots.ai" className="text-primary hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
