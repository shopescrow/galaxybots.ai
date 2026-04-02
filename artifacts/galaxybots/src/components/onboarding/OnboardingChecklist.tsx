import { useState } from "react";
import { useAuth, type OnboardingState } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  Users,
  Factory,
  Plug,
  Rocket,
  Check,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import OnboardingWizard from "./OnboardingWizard";

const STEPS = [
  { key: "companyProfile" as const, label: "Set up company profile", icon: Building2, path: null, estimate: "30 sec" },
  { key: "firstClient" as const, label: "Add your first client", icon: Users, path: "/clients", estimate: "1 min" },
  { key: "industry" as const, label: "Select your industry", icon: Factory, path: null, estimate: "10 sec" },
  { key: "integrations" as const, label: "Connect an integration", icon: Plug, path: "/integrations", estimate: "1 click" },
  { key: "firstMission" as const, label: "Launch your first mission", icon: Rocket, path: "/deploy-team", estimate: "2 min" },
];

export default function OnboardingChecklist() {
  const { user, updateOnboarding } = useAuth();
  const [, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const onboarding: OnboardingState = user?.onboarding ?? {
    companyProfile: false,
    firstClient: false,
    industry: false,
    integrations: false,
    firstMission: false,
    dismissed: false,
    completedAt: null,
  };

  if (onboarding.dismissed || onboarding.completedAt) {
    return null;
  }

  const completedCount = STEPS.filter((s) => onboarding[s.key]).length;
  const allComplete = completedCount === STEPS.length;
  const progressPercent = (completedCount / STEPS.length) * 100;

  const handleDismiss = async () => {
    await updateOnboarding({ dismissed: true });
  };

  if (allComplete) {
    return null;
  }

  return (
    <>
      <Card className="p-4 border-primary/30 bg-primary/5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Getting Started</h3>
            <span className="text-xs text-muted-foreground">
              {completedCount}/{STEPS.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-muted-foreground h-7 w-7 p-0">
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(!collapsed)} className="h-7 w-7 p-0">
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <Progress value={progressPercent} className="mb-3" />

        {!collapsed && (
          <div className="space-y-1.5">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const done = onboarding[step.key];
              return (
                <button
                  key={step.key}
                  onClick={() => {
                    if (done) return;
                    if (step.path) {
                      navigate(step.path);
                    } else {
                      setWizardOpen(true);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    done
                      ? "text-green-400 bg-green-500/5"
                      : "text-foreground hover:bg-primary/10 cursor-pointer"
                  }`}
                  disabled={done}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done ? "bg-green-500/20" : "bg-muted border border-border/50"
                  }`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3 text-muted-foreground" />}
                  </div>
                  <span className={`flex-1 ${done ? "line-through opacity-60" : ""}`}>{step.label}</span>
                  {!done && (
                    <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">{step.estimate}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!collapsed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWizardOpen(true)}
            className="mt-3 w-full text-xs"
          >
            Open Setup Wizard
          </Button>
        )}
      </Card>

      <OnboardingWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
