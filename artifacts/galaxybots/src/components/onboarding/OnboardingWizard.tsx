import { useState } from "react";
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
} from "lucide-react";
import { useLocation } from "wouter";

const STEPS = [
  {
    key: "companyProfile" as const,
    label: "Company Profile",
    icon: Building2,
    description: "Tell us about your company so your AI team can represent you accurately.",
  },
  {
    key: "firstClient" as const,
    label: "First Client",
    icon: Users,
    description: "Add your first client to start managing relationships with AI assistance.",
  },
  {
    key: "industry" as const,
    label: "Industry",
    icon: Factory,
    description: "Select your industry vertical so bots can tailor their strategies.",
  },
  {
    key: "integrations" as const,
    label: "Integrations",
    icon: Plug,
    description: "Connect at least one external service to unlock your bots' full potential.",
  },
  {
    key: "firstMission" as const,
    label: "First Mission",
    icon: Rocket,
    description: "Launch your first bot mission and see your AI team in action.",
  },
];

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance & Banking",
  "Real Estate",
  "E-commerce & Retail",
  "Manufacturing",
  "Legal Services",
  "Marketing & Advertising",
  "Education",
  "Hospitality & Travel",
  "Construction",
  "Consulting",
  "Nonprofit",
  "Other",
];

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function OnboardingWizard({ open, onOpenChange }: OnboardingWizardProps) {
  const { user, token, updateOnboarding } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("");

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const onboarding: OnboardingState = user?.onboarding ?? {
    companyProfile: false,
    firstClient: false,
    industry: false,
    integrations: false,
    firstMission: false,
    dismissed: false,
    completedAt: null,
  };

  const completedCount = STEPS.filter((s) => onboarding[s.key]).length;
  const allComplete = completedCount === STEPS.length;
  const progressPercent = (completedCount / STEPS.length) * 100;

  const handleDismiss = async () => {
    await updateOnboarding({ dismissed: true });
    onOpenChange(false);
  };

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
      }
    } finally {
      setLoading(false);
    }
  };

  const handleIndustry = async () => {
    if (!selectedIndustry) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/clients/${user?.clientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ industry: selectedIndustry }),
      });
      if (res.ok) {
        await updateOnboarding({ industry: true });
        setCurrentStep(3);
      }
    } finally {
      setLoading(false);
    }
  };

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
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
            {onboarding[step.key] && (
              <Badge className="ml-auto bg-green-600 text-white text-[10px]">
                <Check className="w-3 h-3 mr-1" />
                Done
              </Badge>
            )}
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
                <Input
                  id="wiz-website"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://acme.com"
                  className="bg-background"
                />
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
              <div className="grid grid-cols-2 gap-1.5">
                {INDUSTRIES.map((ind) => (
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
              <Button onClick={handleIndustry} disabled={!selectedIndustry || loading} size="sm" variant="glow">
                {loading ? "Saving..." : "Save & Continue"}
              </Button>
            </div>
          )}

          {step.key === "integrations" && !onboarding.integrations && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Connect Gmail, Google Calendar, HubSpot, Notion, or other services so your bots can take real action on your behalf.
              </p>
              <Button onClick={handleGoToIntegrations} size="sm" variant="glow" className="gap-1.5">
                <Plug className="w-4 h-4" />
                Connect Integration
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
