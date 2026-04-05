import { useState, useEffect, useCallback } from "react";
import { useAuth, type OnboardingState } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Factory,
  Plug,
  Rocket,
  Check,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  PartyPopper,
  Globe,
  Loader2,
  Mail,
  Calendar,
  BarChart3,
  FileText,
  MessageSquare,
} from "lucide-react";
import { useLocation } from "wouter";

const STEPS = [
  {
    key: "companyProfile" as const,
    label: "Company Profile",
    icon: Building2,
    description: "Tell us about your company so your AI team can represent you accurately.",
    estimate: "30 seconds",
  },
  {
    key: "firstClient" as const,
    label: "First Client",
    icon: Users,
    description: "Add your first client to start managing relationships with AI assistance.",
    estimate: "1 minute",
  },
  {
    key: "industry" as const,
    label: "Industry",
    icon: Factory,
    description: "Select your industry vertical so bots can tailor their strategies.",
    estimate: "10 seconds",
  },
  {
    key: "integrations" as const,
    label: "Integrations",
    icon: Plug,
    description: "Connect at least one external service to unlock your bots' full potential.",
    estimate: "1 click",
  },
  {
    key: "firstMission" as const,
    label: "First Mission",
    icon: Rocket,
    description: "Launch your first bot mission and see your AI team in action.",
    estimate: "2 minutes",
  },
];

const INDUSTRY_PACKS = [
  { label: "SaaS & Technology", icon: "💻", packId: "saas-tech", industry: "Technology" },
  { label: "Legal & Professional Services", icon: "⚖️", packId: "legal", industry: "Legal" },
  { label: "Restaurant & Hospitality", icon: "🍽️", packId: "restaurant", industry: "Restaurant" },
  { label: "Real Estate", icon: "🏢", packId: "real-estate", industry: "Real Estate" },
  { label: "Healthcare & Wellness", icon: "🏥", packId: "healthcare", industry: "Healthcare" },
  { label: "Agency & Consulting", icon: "🎯", packId: "agency", industry: "Consulting" },
] as const;

const OTHER_INDUSTRIES = [
  "Finance & Banking",
  "E-commerce & Retail",
  "Manufacturing",
  "Education",
  "Construction",
  "Nonprofit",
  "Transportation",
  "Household Moving",
  "Other",
];

const ALL_OAUTH_INTEGRATIONS = [
  { key: "gmail", name: "Gmail", icon: Mail, color: "text-red-400", industries: ["*"] },
  { key: "hubspot", name: "HubSpot CRM", icon: BarChart3, color: "text-orange-400", industries: ["Technology", "Legal", "Consulting", "Real Estate", "Healthcare", "*"] },
  { key: "slack", name: "Slack", icon: MessageSquare, color: "text-green-400", industries: ["Technology", "Consulting", "*"] },
  { key: "google_calendar", name: "Google Calendar", icon: Calendar, color: "text-blue-400", industries: ["Healthcare", "Legal", "Real Estate", "Restaurant", "*"] },
  { key: "notion", name: "Notion", icon: FileText, color: "text-gray-300", industries: ["Technology", "Consulting", "*"] },
];

function getRecommendedIntegrations(industry: string | null | undefined) {
  const industryKey = industry ?? "";
  const gmail = ALL_OAUTH_INTEGRATIONS.find((i) => i.key === "gmail")!;
  const others = ALL_OAUTH_INTEGRATIONS.filter((i) => i.key !== "gmail");
  const scored = others.map((intg) => ({
    ...intg,
    score: intg.industries.includes(industryKey) ? 2 : intg.industries.includes("*") ? 1 : 0,
  }));
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return [gmail, ...sorted.slice(0, 3)];
}

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OnboardingWizard({ open, onOpenChange }: OnboardingWizardProps) {
  const { user, token, updateOnboarding, refreshUser } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [clientIndustry, setClientIndustry] = useState<string | null>(null);
  const [scrapingWebsite, setScrapingWebsite] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (open && user?.clientId && token) {
      fetch(`${BASE}/api/clients/${user.clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.industry) setClientIndustry(data.industry);
        })
        .catch(() => {});
    }
  }, [open, user?.clientId, token]);

  const onboarding: OnboardingState = user?.onboarding ?? {
    companyProfile: false,
    firstClient: false,
    industry: false,
    integrations: false,
    firstMission: false,
    dismissed: false,
    completedAt: null,
  };

  // Auto-complete firstClient step if the user already has clients
  useEffect(() => {
    if (open && token && !onboarding.firstClient) {
      fetch(`${BASE}/api/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : [])
        .then((json: { data?: unknown[] } | unknown[]) => {
          const clients = Array.isArray(json) ? json : (json.data ?? []);
          if (clients.length > 0) {
            updateOnboarding({ firstClient: true }).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [open, token]);

  const completedCount = STEPS.filter((s) => onboarding[s.key]).length;
  const allComplete = completedCount === STEPS.length;
  const progressPercent = (completedCount / STEPS.length) * 100;

  useEffect(() => {
    if (open) {
      const firstIncomplete = STEPS.findIndex((s) => !onboarding[s.key]);
      if (firstIncomplete !== -1) {
        setCurrentStep(firstIncomplete);
      }
    }
  }, [open]);

  const handleDismiss = async () => {
    await updateOnboarding({ dismissed: true });
    onOpenChange(false);
  };

  const markStepStarted = useCallback(async (stepKey: keyof OnboardingState) => {
    const startedAtKey = `${stepKey}StartedAt` as keyof OnboardingState;
    if (!onboarding[startedAtKey]) {
      await updateOnboarding({ [startedAtKey]: new Date().toISOString() } as Partial<OnboardingState>).catch(() => {});
    }
  }, [onboarding, updateOnboarding]);

  const handleCompanyProfile = async () => {
    if (!companyName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/clients/${user?.clientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim() || undefined,
          businessContext: `Company: ${companyName.trim()}`,
        }),
      });
      if (res.ok) {
        await updateOnboarding({ companyProfile: true });
        setCurrentStep(1);

        if (websiteUrl.trim()) {
          setScrapingWebsite(true);
          fetch(`${BASE}/api/clients/${user?.clientId}/scrape-website`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url: websiteUrl.trim() }),
          }).catch(() => {}).finally(() => {
            setTimeout(() => setScrapingWebsite(false), 30000);
          });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIndustry = async () => {
    if (!selectedIndustry) return;
    setLoading(true);
    try {
      const matchingPack = INDUSTRY_PACKS.find(
        (p) => p.industry === selectedIndustry || p.label === selectedIndustry,
      );

      const res = await fetch(`${BASE}/api/clients/${user?.clientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ industry: matchingPack?.industry || selectedIndustry }),
      });

      if (res.ok) {
        let packInstalled = false;
        if (matchingPack) {
          try {
            const installRes = await fetch(`${BASE}/api/packs/${matchingPack.packId}/install`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
            if (installRes.ok) {
              packInstalled = true;
              const installData = await installRes.json();
              if (installData.welcomeSessionId) {
                sessionStorage.setItem("pack_welcome_session", String(installData.welcomeSessionId));
              }
            } else if (installRes.status === 409) {
              packInstalled = true;
            }
          } catch (_e) {}
        }

        if (!matchingPack || packInstalled) {
          await updateOnboarding({ industry: true });
          const welcomeId = sessionStorage.getItem("pack_welcome_session");
          if (welcomeId) {
            sessionStorage.removeItem("pack_welcome_session");
            onOpenChange(false);
            navigate(`/task-rooms/${welcomeId}`);
          } else {
            setCurrentStep(3);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthConnect = useCallback(async (service: string) => {
    if (!user?.id || !user?.clientId) return;
    setConnectingOAuth(service);
    try {
      const initiateRes = await fetch(
        `${BASE}/api/oauth/initiate/${service}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!initiateRes.ok) {
        console.error(`[oauth] Failed to get auth URL for ${service}`);
        setConnectingOAuth(null);
        return;
      }
      const { authUrl } = await initiateRes.json();
      if (!authUrl) {
        setConnectingOAuth(null);
        return;
      }

      const popup = window.open(authUrl, `oauth_${service}`, "width=600,height=700,scrollbars=yes,resizable=yes");

      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.source !== popup) return;
        if (event.data?.type === "oauth_success" && event.data?.service === service) {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(null);
          await updateOnboarding({ integrations: true });
          await refreshUser();
          popup?.close();
        } else if (event.data?.type === "oauth_error" && event.data?.service === service) {
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(null);
          console.error(`[oauth] Error connecting ${service}:`, event.data.error);
          popup?.close();
        }
      };

      window.addEventListener("message", handleMessage);

      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          window.removeEventListener("message", handleMessage);
          setConnectingOAuth(null);
        }
      }, 1000);
    } catch (err) {
      console.error("[oauth] Failed to initiate OAuth:", err);
      setConnectingOAuth(null);
    }
  }, [user, token, BASE, updateOnboarding, refreshUser]);

  const handleGoToClients = () => {
    onOpenChange(false);
    navigate("/clients");
  };

  const handleGoToIntegrations = () => {
    onOpenChange(false);
    navigate("/integrations");
  };

  const handleGoToMission = () => {
    onOpenChange(false);
    navigate("/deploy-team");
  };

  const step = STEPS[currentStep];
  const StepIcon = step.icon;

  useEffect(() => {
    if (open) {
      markStepStarted(step.key).catch(() => {});
    }
  }, [open, currentStep, step.key]);

  if (allComplete) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
              <PartyPopper className="w-8 h-8 text-primary" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl text-center">Your AI Team is Ready!</DialogTitle>
              <DialogDescription className="text-center">
                You've completed all setup steps. Your AI directors are fully configured and ready to execute.
              </DialogDescription>
            </DialogHeader>
            <Button variant="glow" onClick={() => onOpenChange(false)} className="mt-4">
              Go to Dashboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Welcome to GalaxyBots</DialogTitle>
          <DialogDescription>
            Let's get your AI team set up. Complete these steps to unlock the full power of your virtual directors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{completedCount} of {STEPS.length} complete</span>
            <span className="font-medium text-primary">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = onboarding[s.key];
            const active = i === currentStep;
            return (
              <button
                key={s.key}
                onClick={() => setCurrentStep(i)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : done
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "bg-muted/50 text-muted-foreground border border-transparent hover:border-border"
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-5 min-h-[180px]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <StepIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-base">{step.label}</h3>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {step.estimate && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">
                  {step.estimate}
                </Badge>
              )}
              {onboarding[step.key] && (
                <Badge className="bg-green-600 text-white text-[10px]">
                  <Check className="w-3 h-3 mr-1" />
                  Done
                </Badge>
              )}
            </div>
          </div>

          {step.key === "companyProfile" && !onboarding.companyProfile && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-company" className="text-sm">Company Name</Label>
                <Input
                  id="wiz-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Corp"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-website" className="text-sm">Website (optional)</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="wiz-website"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://acme.com"
                    className="bg-background pl-9"
                  />
                </div>
                {websiteUrl.trim() && (
                  <p className="text-[11px] text-primary/70">
                    We'll analyze your website to personalize your first mission brief.
                  </p>
                )}
              </div>
              <Button onClick={handleCompanyProfile} disabled={!companyName.trim() || loading} size="sm" variant="glow">
                {loading ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          )}

          {step.key === "firstClient" && !onboarding.firstClient && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Head over to the Clients page to add your first client. Your AI directors need client context to deliver personalized strategies.
              </p>
              <Button onClick={handleGoToClients} size="sm" variant="glow" className="gap-1.5">
                <Users className="w-4 h-4" />
                Add First Client
              </Button>
            </div>
          )}

          {step.key === "industry" && !onboarding.industry && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Select your industry to get a pre-configured AI starter pack with missions, pipelines, and knowledge base:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {INDUSTRY_PACKS.map((pack) => (
                  <button
                    key={pack.packId}
                    onClick={() => setSelectedIndustry(pack.industry)}
                    className={`text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-2 ${
                      selectedIndustry === pack.industry
                        ? "bg-primary/20 text-primary border-primary/40"
                        : "bg-background text-muted-foreground border-border/30 hover:border-primary/30"
                    }`}
                  >
                    <span className="text-base">{pack.icon}</span>
                    <span>{pack.label}</span>
                  </button>
                ))}
              </div>
              <details className="text-xs">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground">Other industries</summary>
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {OTHER_INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      onClick={() => setSelectedIndustry(ind)}
                      className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                        selectedIndustry === ind
                          ? "bg-primary/20 text-primary border-primary/40"
                          : "bg-background text-muted-foreground border-border/30 hover:border-primary/30"
                      }`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </details>
              <Button onClick={handleIndustry} disabled={!selectedIndustry || loading} size="sm" variant="glow">
                {loading ? "Installing pack..." : "Save & Continue"}
              </Button>
            </div>
          )}

          {step.key === "integrations" && !onboarding.integrations && (
            <div className="space-y-3">
              {(() => {
                const industry = selectedIndustry || clientIndustry;
                const recommendedIntegrations = getRecommendedIntegrations(industry);
                return (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {industry
                        ? `Top integrations recommended for ${industry} — connect one to get started:`
                        : "Connect one service to unlock your bots' full potential. Any one counts — you can add more later."}
                    </p>
                    <div className="grid gap-2">
                      {recommendedIntegrations.map((svc) => {
                        const Icon = svc.icon;
                        const isConnecting = connectingOAuth === svc.key;
                        return (
                          <button
                            key={svc.key}
                            onClick={() => handleOAuthConnect(svc.key)}
                            disabled={!!connectingOAuth}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/30 bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors text-left disabled:opacity-50"
                          >
                            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                              {isConnecting ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : (
                                <Icon className={`w-4 h-4 ${svc.color}`} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{svc.name}</div>
                            </div>
                            <span className="text-xs text-primary font-medium">
                              {isConnecting ? "Connecting..." : "Connect"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <Button onClick={handleGoToIntegrations} size="sm" variant="outline" className="gap-1.5 text-xs w-full">
                <Plug className="w-3.5 h-3.5" />
                See all integrations
              </Button>
            </div>
          )}

          {step.key === "firstMission" && !onboarding.firstMission && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Describe a business objective and Optima Prime will assemble the optimal AI team to execute it. Try something like "Create a social media strategy for Q2."
              </p>
              <Button onClick={handleGoToMission} size="sm" variant="glow" className="gap-1.5">
                <Rocket className="w-4 h-4" />
                Launch First Mission
              </Button>
            </div>
          )}

          {onboarding[step.key] && (
            <p className="text-sm text-green-400 flex items-center gap-2">
              <Check className="w-4 h-4" />
              This step is complete. Move to the next step or close the wizard.
            </p>
          )}
        </div>

        {scrapingWebsite && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary/80">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            Analyzing your website to personalize your first mission...
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-muted-foreground gap-1"
            >
              <SkipForward className="w-3 h-3" />
              Dismiss
            </Button>
            {currentStep < STEPS.length - 1 && (
              <Button
                size="sm"
                onClick={() => setCurrentStep(currentStep + 1)}
                className="gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
