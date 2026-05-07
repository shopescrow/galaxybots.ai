import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RevealWrapper, RevealItem } from "@/components/RevealWrapper";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  FlaskConical,
  Crown,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Rocket,
  Shield,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  Zap,
  Globe,
} from "lucide-react";
import { Link } from "wouter";

const phases = [
  {
    id: "scout",
    phase: "Phase 1",
    name: "The Scout",
    tagline: "See what you have",
    icon: Search,
    color: "text-chart-5",
    bgColor: "bg-chart-5/10",
    borderColor: "border-chart-5/30",
    days: "Days 1–3",
    price: "Free",
    details: [
      "Provide read-only access or share a screen recording",
      "Receive a comprehensive Data Topography Map within 24 hours",
      "Visualize all hidden tables, custom fields, and attachments",
      "Understand exactly what data you have and where it lives",
      "No commitment — the audit is yours to keep regardless",
    ],
    outcome: "A clear picture of your data landscape — knowledge is the first step to sovereignty.",
  },
  {
    id: "proving",
    phase: "Phase 2",
    name: "The Proving Ground",
    tagline: "Prove it works",
    icon: FlaskConical,
    color: "text-chart-4",
    bgColor: "bg-chart-4/10",
    borderColor: "border-chart-4/30",
    days: "Days 4–7",
    price: "Sandbox",
    details: [
      "Run The Liberator on a representative subset of your data",
      "Extract 50 contacts, deals, or records as a proof of concept",
      "Export directly to Google Sheets, CSV, or your target platform",
      "Validate data integrity — every field, relationship, and attachment",
      "See the process in action with full transparency",
    ],
    outcome: "Proof that your data can move freely — no APIs, no developer hours, no compromises.",
  },
  {
    id: "reclamation",
    phase: "Phase 3",
    name: "The Reclamation",
    tagline: "Take back what's yours",
    icon: Crown,
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
    days: "Days 8–14",
    price: "From $499",
    details: [
      "Full extraction of your complete dataset",
      "Preserves all relationships, attachments, and activity history",
      "Automated quality assurance with completeness reporting",
      "Direct transfer to your new platform or portable format",
      "Dedicated support throughout the migration process",
    ],
    outcome: "Your data, fully liberated — in your hands, in your format, under your control.",
  },
];

const comparisonRows = [
  { aspect: "Developer Required", old: true, sovereign: false },
  { aspect: "API Access Needed", old: true, sovereign: false },
  { aspect: "Vendor Cooperation", old: true, sovereign: false },
  { aspect: "Preserves Attachments", old: false, sovereign: true },
  { aspect: "Activity History Retained", old: false, sovereign: true },
  { aspect: "Works on Any Platform", old: false, sovereign: true },
  { aspect: "Complete in Under 4 Hours", old: false, sovereign: true },
  { aspect: "Fixed, Predictable Cost", old: false, sovereign: true },
];

function PhaseCard({ phase, index }: { phase: typeof phases[0]; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <RevealItem delay={0.15 * (index + 1)}>
      <Card
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={`bg-card border-border transition-all cursor-pointer group ${
          phase.id === "scout"
            ? "hover:border-chart-5/30"
            : phase.id === "proving"
              ? "hover:border-chart-4/30"
              : "hover:border-primary/30"
        }`}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <CardContent className="pt-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg ${phase.bgColor} flex items-center justify-center shrink-0`}>
                <phase.icon className={`w-6 h-6 ${phase.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${phase.color}`}>{phase.phase}</span>
                  <span className="text-xs text-muted-foreground">{phase.days}</span>
                </div>
                <h3 className="text-xl font-bold">{phase.name}</h3>
                <p className="text-muted-foreground text-sm mt-0.5">{phase.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold ${phase.color}`}>{phase.price}</span>
              {expanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-4 border-t border-border space-y-3">
                  <ul className="space-y-2">
                    {phase.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 shrink-0 ${phase.color}`} />
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <div className={`p-3 rounded-md ${phase.bgColor} border ${phase.borderColor}`}>
                    <p className="text-sm font-medium">{phase.outcome}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </RevealItem>
  );
}

export function TheReclamation() {
  return (
    <div className="space-y-16 animate-in fade-in duration-500 pb-16">
      <RevealWrapper>
        <div className="text-center max-w-3xl mx-auto">
          <RevealItem>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-6">
              <Crown className="w-4 h-4" />
              The Journey
            </div>
          </RevealItem>
          <RevealItem delay={0.1}>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              The{" "}
              <span className="text-primary">Reclamation</span>
            </h1>
          </RevealItem>
          <RevealItem delay={0.2}>
            <p className="text-lg text-muted-foreground leading-relaxed">
              From feeling stuck to being free. Your data sovereignty journey starts with a single step —
              and every step forward is a step toward owning your future.
            </p>
          </RevealItem>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                <Layers className="w-4 h-4 text-primary" />
              </div>
              The 14-Day Challenge
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              Three phases. Two weeks. Complete data sovereignty. Click each phase to explore the details.
            </p>
          </RevealItem>

          <div className="relative">
            <div className="hidden md:block absolute left-[1.85rem] top-0 bottom-0 w-px bg-gradient-to-b from-chart-5/50 via-chart-4/50 to-primary/50" />
            <div className="space-y-6 md:pl-16 relative">
              {phases.map((phase, i) => (
                <PhaseCard key={phase.id} phase={phase} index={i} />
              ))}
            </div>
            <div className="hidden md:flex absolute left-[1.25rem] top-0 flex-col justify-between h-full py-8 pointer-events-none">
              {phases.map((phase) => (
                <div key={phase.id} className={`w-3 h-3 rounded-full ${phase.bgColor} border-2 ${phase.borderColor}`} />
              ))}
            </div>
          </div>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-chart-5/10 flex items-center justify-center">
                <Eye className="w-4 h-4 text-chart-5" />
              </div>
              The Old Way vs. The Sovereign Way
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              API-gated migration vs. Visual Liberation — the difference is night and day.
            </p>
          </RevealItem>
          <RevealItem delay={0.1}>
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="p-0">
                <div className="grid grid-cols-3 text-sm font-semibold border-b border-border">
                  <div className="p-4 text-muted-foreground">Aspect</div>
                  <div className="p-4 text-center text-destructive/80 bg-destructive/5">The Old Way</div>
                  <div className="p-4 text-center text-primary bg-primary/5">The Sovereign Way</div>
                </div>
                {comparisonRows.map((row, i) => (
                  <RevealItem
                    key={row.aspect}
                    delay={0.05 * i}
                    className="grid grid-cols-3 text-sm border-b border-border last:border-0"
                  >
                    <div className="p-4 text-muted-foreground">{row.aspect}</div>
                    <div className="p-4 flex justify-center bg-destructive/5">
                      {row.old ? (
                        <CheckCircle2 className="w-4 h-4 text-destructive/60" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive/30" />
                      )}
                    </div>
                    <div className="p-4 flex justify-center bg-primary/5">
                      {row.sovereign ? (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/30" />
                      )}
                    </div>
                  </RevealItem>
                ))}
              </CardContent>
            </Card>
          </RevealItem>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <div className="space-y-6">
          <RevealItem>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-chart-4/10 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-chart-4" />
              </div>
              Now That Your Data Is Free
            </h2>
            <p className="text-muted-foreground mt-1 ml-11">
              Liberation is just the beginning. Build exactly what your team needs.
            </p>
          </RevealItem>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: "Custom Workflows",
                description: "Connect your liberated data to automation pipelines that work exactly the way your team thinks.",
                color: "text-chart-4",
                bgColor: "bg-chart-4/10",
              },
              {
                icon: Globe,
                title: "Platform Freedom",
                description: "Move to any CRM, database, or platform — or build your own. Your data, your choice, your future.",
                color: "text-chart-5",
                bgColor: "bg-chart-5/10",
              },
              {
                icon: Shield,
                title: "True Ownership",
                description: "With GalaxyBots, your data stays yours. No lock-in, no paywalls, no permission required — ever again.",
                color: "text-primary",
                bgColor: "bg-primary/10",
              },
            ].map((item, i) => (
              <RevealItem key={item.title} delay={0.1 * (i + 1)}>
                <Card className="bg-card border-border h-full group hover:border-primary/30 transition-colors">
                  <CardContent className="pt-6">
                    <div className={`w-12 h-12 rounded-lg ${item.bgColor} flex items-center justify-center mb-4`}>
                      <item.icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </CardContent>
                </Card>
              </RevealItem>
            ))}
          </div>
          <RevealItem delay={0.4}>
            <div className="text-center mt-4">
              <p className="text-muted-foreground text-sm">
                The Liberator is the gateway to the broader{" "}
                <span className="text-primary font-medium">GalaxyBots</span> platform — where liberated
                data becomes custom-built software that serves your exact needs.
              </p>
            </div>
          </RevealItem>
        </div>
      </RevealWrapper>

      <RevealWrapper delay={0.1}>
        <RevealItem>
          <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
            <CardContent className="py-12 text-center space-y-6">
              <Crown className="w-12 h-12 mx-auto text-primary" />
              <div className="space-y-2 max-w-lg mx-auto">
                <h2 className="text-3xl font-bold">Begin Your Reclamation</h2>
                <p className="text-muted-foreground">
                  Start with a free Scout audit. See your data landscape, understand what you have,
                  and take the first step toward true data sovereignty — with zero obligation.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/jobs/new">
                  <Button size="lg" className="gap-2">
                    Start Your Free Audit <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/intel/cost-of-captivity">
                  <Button size="lg" variant="outline" className="gap-2">
                    See the Cost of Captivity
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </RevealItem>
      </RevealWrapper>
    </div>
  );
}
